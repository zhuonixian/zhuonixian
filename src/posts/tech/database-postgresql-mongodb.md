---
title: PostgreSQL 与 MongoDB 生产运维实践
icon: database
date: 2026-06-13
category:
  - 技术
tag:
  - PostgreSQL
  - MongoDB
  - 数据库
  - 运维
---

# PostgreSQL 与 MongoDB 生产运维实践

PostgreSQL 和 MongoDB 是当今最流行的两类数据库代表：关系型和文档型。本文基于生产环境的真实运维经验，梳理两者的架构要点、日常维护操作和常见问题排查。

<!-- more -->

## PostgreSQL

### 版本现状

| 版本 | 发布时间 | 状态 | 关键特性 |
|------|----------|------|----------|
| **17** | 2024-09 | 当前稳定版 | 安全的 search_path、逻辑复制增强、增量备份 |
| **16** | 2023-09 | 支持 | 并行查询增强、IO 提升 |
| **15** | 2022-10 | 支持 | MERGE 命令、压缩改进 |

PostgreSQL 版本策略：每年一个大版本，5 年支持周期。建议生产保持在最近 2 个大版本。

### 生产架构

```
┌─ 主库 (Primary) ─────────────────┐
│  读写：读写均可                    │
│  WAL 日志连续归档到 S3/NFS         │
└──────────┬───────────────────────┘
           │ 流复制 (Streaming Replication)
           ├──────────┬──────────────┐
┌─ 同步从库 ─┐ ┌─ 异步从库 ─┐ ┌─ 级联从库 ─┐
│  Sync      │ │  Async     │ │  Cascade   │
│  读 + 故障 │ │  读 / 报表 │ │  异地容灾   │
│  自动切换  │ │  查询分流  │ │            │
└────────────┘ └────────────┘ └────────────┘
```

推荐方案：

- **小规模**：主从 + PgBouncer 连接池
- **中规模**：Patroni + etcd 实现自动故障切换
- **K8s 环境**：CloudNativePG / Zalando Postgres Operator

### 核心维护操作

#### 1. VACUUM — 回收死元组空间

PostgreSQL 使用 MVCC 机制，UPDATE/DELETE 不会立即释放空间，而是标记为"死元组"，需要 VACUUM 回收。

```sql
-- 手动 VACUUM 单表
VACUUM ANALYZE orders;

-- 查看表的膨胀率（死元组占比）
SELECT schemaname, relname,
       n_dead_tup, n_live_tup,
       ROUND(n_dead_tup::numeric / NULLIF(n_live_tup + n_dead_tup, 0) * 100, 2) AS bloat_pct
FROM pg_stat_user_tables
ORDER BY n_dead_tup DESC;
```

**真实踩坑：** 一张订单表长期只 INSERT 不 DELETE，auto-vacuum 阈值迟迟未触发，导致表膨胀到 200GB（实际数据 80GB）。排查发现是 `autovacuum_vacuum_scale_factor` 默认 0.2 对大表太大。

```sql
-- 对大表调低自动 VACUUM 阈值
ALTER TABLE orders SET (autovacuum_vacuum_scale_factor = 0.05);
ALTER TABLE orders SET (autovacuum_analyze_scale_factor = 0.02);
```

#### 2. 索引维护

```sql
-- 查看未使用的索引（浪费空间、拖慢写入）
SELECT schemaname, relname, indexrelname, idx_scan
FROM pg_stat_user_indexes
WHERE idx_scan = 0
ORDER BY pg_relation_size(indexrelid) DESC;

-- 检测重复索引
SELECT pg_size_pretty(SUM(pg_relation_size(idx))::bigint) AS wasted_size
FROM (
  SELECT indexrelid AS idx, indrelid AS tbl,
         array_to_string(indkey, ',') AS cols,
         array_to_string(indclass, ',') AS opclasses
  FROM pg_index
) sub
GROUP BY tbl, cols, opclasses
HAVING COUNT(*) > 1;

-- 重建索引（不锁表，在线操作）
REINDEX INDEX CONCURRENTLY idx_orders_created_at;
```

#### 3. 连接管理

```sql
-- 查看当前连接
SELECT datname, state, COUNT(*)
FROM pg_stat_activity
GROUP BY datname, state
ORDER BY count DESC;

-- 杀掉阻塞连接
SELECT pg_terminate_backend(pid)
FROM pg_stat_activity
WHERE state = 'idle in transaction'
  AND query_start < NOW() - INTERVAL '30 minutes';
```

**配置建议：**

```ini
# postgresql.conf
max_connections = 200           # 不要设太大，用连接池
shared_buffers = '4GB'          # 物理内存的 25%
effective_cache_size = '12GB'   # 物理内存的 75%
work_mem = '64MB'               # 单个排序操作的内存
maintenance_work_mem = '1GB'    # VACUUM/CREATE INDEX 用
checkpoint_completion_target = 0.9
wal_buffers = '64MB'
default_statistics_target = 100
```

### 常见问题与排查

#### 问题 1：连接数耗尽

**现象：** `FATAL: sorry, too many clients already`

**排查：**

```bash
# 查看最大连接数
SHOW max_connections;

# 查看当前连接分布
SELECT datname, usename, client_addr, state, COUNT(*)
FROM pg_stat_activity
GROUP BY datname, usename, client_addr, state
ORDER BY count DESC;
```

**解决：**

- 引入 **PgBouncer** 连接池，用 `pool_mode = transaction` 模式
- 检查应用是否正确释放连接
- 设置 `idle_in_transaction_session_timeout = '10min'`

#### 问题 2：复制延迟

**现象：** 从库数据落后主库，查询结果不一致

```sql
-- 在主库查看复制状态
SELECT client_addr, state, sent_lsn, replay_lsn,
       (sent_lsn - replay_lsn) AS replication_lag_bytes
FROM pg_stat_replication;

-- 在从库查看是否在恢复
SELECT pg_is_in_recovery(), pg_last_wal_receive_lsn(), pg_last_wal_replay_lsn();
```

**常见原因：**

- 从库硬件性能不足（磁盘 IO 慢）
- 长事务在从库阻塞回放
- 网络带宽不足

#### 问题 3：查询突然变慢

```sql
-- 查看当前慢查询
SELECT query, state, wait_event_type, wait_event,
       NOW() - query_start AS duration
FROM pg_stat_activity
WHERE state = 'active'
  AND NOW() - query_start > INTERVAL '5 seconds'
ORDER BY duration DESC;

-- 查看锁等待
SELECT blocked.pid AS blocked_pid,
       blocked.query AS blocked_query,
       blocking.pid AS blocking_pid,
       blocking.query AS blocking_query
FROM pg_stat_activity blocked
JOIN pg_locks blocked_locks ON blocked.pid = blocked_locks.pid
JOIN pg_locks blocking_locks ON blocked_locks.locktype = blocking_locks.locktype
  AND blocked_locks.database IS NOT DISTINCT FROM blocking_locks.database
  AND blocked_locks.relation IS NOT DISTINCT FROM blocking_locks.relation
  AND blocked_locks.pid != blocking_locks.pid
JOIN pg_stat_activity blocking ON blocking_locks.pid = blocking.pid;
```

---

## MongoDB

### 版本现状

| 版本 | 发布时间 | 状态 | 关键特性 |
|------|----------|------|----------|
| **8.0** | 2024-07 | 当前稳定版 | 可查询加密、批量写入优化 |
| **7.0** | 2023-08 | 支持 | 列存储索引、通配符索引增强 |
| **6.0** | 2022-07 | 支持 | 时间序列集合、集群到集群同步 |

### 生产架构

#### 副本集（Replica Set）— 高可用基础

```
┌─ Primary ───────┐
│  读写操作        │
│  Oplog 写入      │
└───────┬──────────┘
        │ Oplog 同步
   ┌────┴────┐
┌─ Secondary ─┐ ┌─ Secondary ─┐
│  数据同步    │ │  数据同步    │
│  可配置读    │ │  隐藏节点    │
│  Priority 1  │ │  Priority 0 │
└──────────────┘ └──────────────┘
                   (备份/报表专用)
```

推荐配置：

- 生产至少 3 节点（2 Secondary + 1 Arbiter 也可，但不推荐）
- 跨可用区部署，确保选举多数派
- 隐藏节点用于备份和报表查询

#### 分片集群（Sharded Cluster）— 水平扩展

```
┌─ mongos (路由) × 2+ ──────────┐
│  查询路由、结果聚合              │
└────────┬───────────────────────┘
         │
┌─ Config Server Replica Set ───┐
│  集群元数据、分片信息            │
└────────┬───────────────────────┘
         │
┌─ Shard 1 (RS) ─┐ ┌─ Shard 2 (RS) ─┐ ┌─ Shard 3 (RS) ─┐
│  数据分片 1     │ │  数据分片 2     │ │  数据分片 3     │
└─────────────────┘ └─────────────────┘ └─────────────────┘
```

**分片键选择原则：**

- **高基数**：有足够多的不同值（如 userId、orderId）
- **低频率**：单个值不会出现过多（避免 jumbo chunk）
- **非单调递增**：避免所有写入集中在一个分片（如 ObjectId 不适合做分片键）

```javascript
// 好的分片键： hashed + ranged 组合
sh.shardCollection("app.orders", { userId: "hashed" })

// 糟糕的分片键：单调递增
sh.shardCollection("app.logs", { timestamp: 1 })  // 所有写入集中在一个分片
```

### 核心维护操作

#### 1. Oplog 管理

Oplog 是副本集同步的核心，大小固定（默认磁盘空间的 5%）。

```javascript
// 查看 oplog 状态
use local
db.oplog.rs.stats()

// 查看 oplog 时间窗口
rs.printReplicationInfo()
// 输出：configured oplog size: 2048MB
//        log length start to end: 172800secs (48hrs)

// 调整 oplog 大小（MongoDB 4.0+ 在线调整）
db.adminCommand({ replSetResizeOplog: 1, size: 4096 })  // MB
```

**真实踩坑：** 大批量数据迁移时 oplog 被快速填满，Secondary 来不及同步就覆盖了旧 oplog，导致需要全量重新同步。解决方案：迁移前临时增大 oplog，或分批迁移。

#### 2. 索引管理

```javascript
// 查看集合索引大小
db.orders.getIndexes()
db.orders.stats().indexSizes

// 后台创建索引（不阻塞读写，MongoDB 4.2+ 默认）
db.orders.createIndex({ userId: 1, createdAt: -1 })

// 查看未使用索引
db.orders.aggregate([
  { $indexStats: {} },
  { $match: { "accesses.ops": 0 } }
])
```

#### 3. 数据平衡

```javascript
// 查看分片分布
db.orders.getShardDistribution()

// 查看迁移状态
sh.isBalancerRunning()
sh.getBalancerState()

// 手动触发迁移
sh.moveChunk("app.orders", { userId: "user_12345" }, "shard02")
```

### 常见问题与排查

#### 问题 1：Secondary 节点 RECOVERING 状态

**现象：** Secondary 卡在 RECOVERING，无法追上 Primary

```javascript
rs.status().members.forEach(m => {
  print(m.name, m.stateStr, m.optimeDate)
})
```

**常见原因：**

- Oplog 被覆盖（需要全量重同步）
- 磁盘空间不足
- 网络分区

**解决：**

```bash
# 重新全量同步
# 1. 停止 mongod
# 2. 删除数据目录
rm -rf /data/db/*

# 3. 重启 mongod，自动从 Primary 全量同步
systemctl start mongod
```

#### 问题 2：慢查询

```javascript
// 启用慢查询日志（默认 100ms）
db.setProfilingLevel(1, { slowms: 50 })

// 查看慢查询
db.system.profile.find().sort({ ts: -1 }).limit(10)

// 查看当前执行中的操作
db.currentOp({
  active: true,
  secs_running: { $gt: 5 }
})

// 杀掉慢操作
db.killOp(opId)
```

#### 问题 3：Chunk 迁移导致性能下降

**现象：** 集群写入延迟突然增高

```javascript
// 检查 Balancer 是否在运行
sh.isBalancerRunning()

// 检查是否有 jumbo chunk
db.config.chunks.find({ jumbo: true })

// 临时停止 Balancer（业务高峰期）
sh.stopBalancer()

// 指定 Balancer 运行窗口
db.settings.update(
  { _id: "balancer" },
  { $set: { activeWindow: { start: "02:00", stop: "06:00" } } },
  { upsert: true }
)
```

## 通用监控指标

| 指标 | PostgreSQL | MongoDB |
|------|-----------|---------|
| 连接数 | `pg_stat_activity` | `serverStatus.connections` |
| 慢查询 | `pg_stat_statements` | `system.profile` |
| 缓存命中率 | `pg_stat_database.blks_hit / (blks_hit + blks_read)` | `serverStatus.wt.cache` |
| 复制延迟 | `pg_stat_replication` | `rs.printSlaveReplicationInfo()` |
| 锁等待 | `pg_locks` | `db.currentOp()` |
| 磁盘使用 | `pg_database_size()` | `db.stats()` |
| 死元组/膨胀 | `pg_stat_user_tables.n_dead_tup` | `collStats.wiredTiger` |

## 备份策略

| 方式 | PostgreSQL | MongoDB |
|------|-----------|---------|
| 逻辑备份 | `pg_dump` / `pg_dumpall` | `mongodump` |
| 物理备份 | `pg_basebackup` + WAL 归档 | `mongod --dbpath` 快照 |
| 增量备份 | WAL 归档（PITR） | Oplog 导出 |
| 云托管 | RDS 自动备份 | Atlas 自动备份 |
| 推荐 | pgBackRest 或 Barman | Percona Backup for MongoDB |

```bash
# PostgreSQL 基础备份 + WAL 归档
pg_basebackup -D /backup/base -Ft -z -P
# postgresql.conf
# wal_level = replica
# archive_mode = on
# archive_command = 'cp %p /backup/wal/%f'

# MongoDB 备份（副本集）
mongodump --uri="mongodb://primary:27017" \
  --oplog \
  --gzip \
  --archive=/backup/mongo-$(date +%Y%m%d).gz
```

## 总结

| 维度 | PostgreSQL | MongoDB |
|------|-----------|---------|
| **数据模型** | 关系型（表、行、列） | 文档型（JSON/BSON） |
| **事务** | 完整 ACID | 4.0+ 支持多文档事务 |
| **扩展** | 垂直为主 + 只读从库 | 水平分片原生支持 |
| **适合场景** | 复杂查询、强一致性、金融级 | 灵活 Schema、高写入、快速迭代 |
| **运维复杂度** | 中（VACUUM、连接管理） | 中高（分片、Balancer、Oplog） |

**参考资源：**

- [PostgreSQL 官方文档](https://www.postgresql.org/docs/)
- [MongoDB 官方文档 v8.0](https://www.mongodb.com/docs/v8.0/)
- [PostgreSQL 常见错误排查 — Percona](https://www.percona.com/blog/10-common-postgresql-errors/)
- [K8s 上运行 PostgreSQL 排障 — Crunchy Data](https://www.crunchydata.com/blog/troubleshooting-postgres-in-kubernetes)
- [MongoDB 分片排障 — Severalnines](https://severalnines.com/blog/troubleshooting-mongodb-sharded-cluster/)
