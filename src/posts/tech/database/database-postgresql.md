---
title: PostgreSQL 生产运维实战
icon: database
date: 2026-06-13
category:
  - 技术
tag:
  - PostgreSQL
  - 数据库
  - 运维
---

# PostgreSQL 生产运维实战

PostgreSQL 是当前最先进的开源关系型数据库，在全球数据库引擎排行榜（DB-Engines）长期稳居第四，仅次于 Oracle、MySQL 和 SQL Server。其在金融、电信、政务等对数据一致性要求极高的领域得到广泛应用。本文基于生产环境的一线运维经验，系统梳理 PostgreSQL 的版本策略、架构设计、核心维护操作、备份恢复、故障排查和 Kubernetes 部署实践。

<!-- more -->

## 版本现状

PostgreSQL 17 于 2024 年 9 月正式发布，是当前的稳定版本。以下是近期版本的关键信息：

| 版本 | 发布时间 | 状态 | 关键特性 |
|------|----------|------|----------|
| **17** | 2024-09 | 当前稳定版 | 安全的 search_path、逻辑复制增强、增量备份 |
| **16** | 2023-09 | 支持 | 并行查询增强、IO 提升性能显著 |
| **15** | 2022-10 | 支持 | MERGE 命令、JSON 表函数、压缩改进 |
| **14** | 2021-09 | 支持（至 2026-11） | SP-GiST 索引增强、管线化查询 |

PostgreSQL 的版本策略为每年发布一个大版本，每个版本提供 5 年社区支持。生产环境建议始终保持在使用最近 2 个大版本（目前即 16 和 17），以便获得持续的安全补丁和性能优化。升级路径推荐使用 pg_upgrade --link 方式，可在几分钟内完成大版本升级，停机时间极短。

## 生产架构

### 主从流复制架构

PostgreSQL 生产环境的标准架构是基于 WAL（Write-Ahead Log）的流复制。以下是典型的多从库拓扑：

```
┌─ 主库 (Primary) ──────────────────────────────────┐
│  角色：读写                                       │
│  WAL 日志连续归档到 S3/NFS（用于 PITR 恢复）       │
└──────────────┬─────────────────────────────────────┘
               │ 流复制 (Streaming Replication)
               │
       ┌───────┼───────────────┐
       │       │               │
┌─ 同步从库 ─┐ ┌─ 异步从库 ─┐ ┌─ 级联从库 ──┐
│  Sync      │ │  Async     │ │  Cascade    │
│  读 + 故障 │ │  读 / 报表 │ │  异地容灾    │
│  自动切换  │ │  查询分流  │ │  跨机房部署  │
└────────────┘ └────────────┘ └─────────────┘
```

架构要点说明：

- **同步从库**（synchronous_standby_names）：事务提交需等待至少一个同步从库确认写入，保证零数据丢失。适用于金融交易等对数据一致性要求极高的场景。代价是写入延迟受从库影响。
- **异步从库**：主库提交后不等从库确认，延迟通常在毫秒级。适用于读写分离、报表查询等场景。
- **级联从库**：从库再向下级联复制，减轻主库的网络和 IO 负担，常用于异地容灾。

### 高可用方案

| 方案 | 适用场景 | 核心组件 | 自动切换 |
|------|----------|----------|----------|
| **Patroni + etcd** | 中大规模物理机/VM | Patroni Agent + etcd + HAProxy | 支持，秒级 |
| **repmgr** | 中小规模 | repmgr + keepalived | 半自动，需脚本 |
| **CloudNativePG** | Kubernetes 环境 | CNP Operator | 支持，声明式 |
| **Zalando Operator** | Kubernetes 环境 | Postgres Operator + Spilo | 支持 |

推荐方案：

- **小规模**：主从流复制 + PgBouncer 连接池 + repmgr 管理故障切换
- **中规模**：Patroni + etcd（或 Consul）实现自动故障切换，HAProbe 或 Keepalived 做 VIP 漂移
- **Kubernetes 环境**：CloudNativePG 或 Zalando Postgres Operator（下文详述）

Patroni 是目前最成熟的开源 PostgreSQL 高可用方案。其工作原理是每个数据库节点运行一个 Patroni Agent，通过 etcd（或 Consul/ZooKeeper）进行 Leader 选举。当主库故障时，Patroni 自动将最优从库提升为新主库，并重新配置其他从库的复制源。典型切换时间在 10-30 秒之间。

## PostgreSQL 高可用与集群部署

### 高可用架构选型

| 方案 | 自动故障切换 | 一致性保证 | 复杂度 | 适用场景 |
|------|-------------|-----------|--------|----------|
| **流复制 + 手动切换** | 否 | 强一致 | 低 | 小型、可接受短时中断 |
| **Patroni + etcd** | 是（秒级） | 强一致 | 中 | 中大型生产环境 |
| **repmgr** | 是（需 witness） | 强一致 | 中 | 传统 VM 环境 |
| **CloudNativePG** | 是 | 强一致 | 中 | Kubernetes 环境 |
| **PgPool-II** | 是 | 强一致 | 高 | 需要连接池+负载均衡 |
| **逻辑复制** | 否（应用层切换） | 最终一致 | 中 | 跨版本/跨数据中心 |

### 流复制详解

PostgreSQL 高可用的基础是流复制（Streaming Replication），主库持续发送 WAL 日志到从库：

```
┌─ Primary ──────────────────────┐
│  WAL 生成 → Send WAL Stream    │
│  synchronous_commit=on         │
└──────────┬──────────────────────┘
           │ WAL Stream (TCP 5432)
     ┌─────┴─────────────┐
┌─ Sync Standby ─┐ ┌─ Async Standby ─┐
│ 收到 WAL → ACK │ │ 收到 WAL（延迟）│
│ 数据零丢失     │ │ 可能丢失少量    │
│ 可自动提升     │ │ 可自动提升      │
└────────────────┘ └────────────────┘

同步模式：Primary 等待 Sync Standby 确认后才返回成功
异步模式：Primary 不等待，性能更好但可能丢数据
```

### Patroni 自动故障切换流程

Patroni 是目前最主流的 PostgreSQL 自动故障切换方案，依赖 etcd 作为 DCS（分布式配置存储）：

```
正常状态：
┌─ etcd Cluster ─────────────────────┐
│  /service/cluster_name/leader      │
│  = "node1" (leader lock)           │
└──────────┬─────────────────────────┘
           │ TTL 续约（每 10s）
┌─ Patroni@node1 (Leader) ─┐
│  持有 leader lock          │
│  提供读写服务              │
└───────────────────────────┘
┌─ Patroni@node2 (Replica) ┐  ┌─ Patroni@node3 (Replica) ┐
│  流复制同步               │  │  流复制同步               │
│  等待成为 Leader          │  │  等待成为 Leader          │
└───────────────────────────┘  └───────────────────────────┘

故障切换流程（Primary node1 宕机）：

  ┌─────────────┐    ┌──────────────┐    ┌──────────────┐
  │ 1. node1 宕机 │───→│ 2. TTL 过期   │───→│ 3. node2/node3│
  │    Leader 失效│    │   etcd 锁释放 │    │   竞争 Leader │
  └─────────────┘    └──────────────┘    └──────┬───────┘
                                                  │
                    ┌──────────────┐    ┌──────────▼──────┐
                    │ 5. 其余节点   │←───│ 4. node2 获得锁  │
                    │   开始跟随    │    │   promote 自身   │
                    │   新 Leader   │    │   成为新 Leader  │
                    └──────────────┘    └─────────────────┘

关键参数：
- ttl: 30s（Leader 锁 TTL）
- loop_wait: 10s（Patroni 检查间隔）
- retry_timeout: 30s（操作重试超时）
- maximum_lag_on_failover: 1MB（允许的最大复制延迟）
```

### 防脑裂机制

```
Patroni 防脑裂：
1. 依赖 etcd 的分布式锁（同一时刻只有一个 Leader）
2. 网络分区时，少数派节点无法续约锁，自动降级为 Replica
3. 只有持有锁的节点才以 Primary 身份运行
4. 如果 etcd 不可用，所有节点降级为 Replica，宁可不可用也不脑裂

同步复制的零数据丢失：
- synchronous_commit=on
- synchronous_standby_names='FIRST 1 (node2, node3)'
- 至少 1 个同步从库确认后才返回成功
```

### Patroni 集群部署示例

```yaml
# patroni.yml (node1 示例)
scope: pg-cluster
name: node1

restapi:
  listen: 0.0.0.0:8008
  connect_address: node1:8008

etcd:
  hosts: etcd1:2379,etcd2:2379,etcd3:2379

bootstrap:
  dcs:
    ttl: 30
    loop_wait: 10
    retry_timeout: 30
    maximum_lag_on_failover: 1048576
    postgresql:
      use_pg_rewind: true
      use_slots: true
      parameters:
        wal_level: replica
        hot_standby: "on"
        max_wal_senders: 10
        max_replication_slots: 10
        wal_log_hints: "on"
        synchronous_commit: "on"
        synchronous_standby_names: "FIRST 1 (node2, node3)"

postgresql:
  listen: 0.0.0.0:5432
  connect_address: node1:5432
  data_dir: /var/lib/postgresql/data
  pg_hba:
    - local   all all trust
    - host    all all 0.0.0.0/0 md5
    - host    replication replicator 0.0.0.0/0 md5

tags:
  failover_priority: 1
  synchronous_mode: true
```

### 客户端连接管理

故障切换时客户端如何自动重连：

```ini
# PgBouncer 配置（推荐）
[databases]
pg-cluster = host=node1 port=5432 dbname=app

# 或使用 libpq 连接字符串
# postgres://user:pass@node1,node2,node3:5432/app?target_session_attrs=read-write
# 自动连接到当前 Primary
```

### 多数据中心部署

```
┌─ DC-A（主站点）───────────────┐    ┌─ DC-B（灾备站点）───────────┐
│ ┌─ Primary ──────────┐        │    │ ┌─ Async Standby ────────┐  │
│ │  Patroni + etcd    │        │    │ │  Patroni + etcd        │  │
│ │  读写服务           │────────│────│→│  只读 + 灾备           │  │
│ └────────────────────┘        │    │ └────────────────────────┘  │
│ ┌─ Sync Standby ──────┐       │    │                              │
│ │  同步复制 + 自动切换 │       │    │                              │
│ └─────────────────────┘       │    │                              │
│ 延迟：< 1ms                    │    │ 延迟：< 10ms                  │
│ RPO = 0（同步复制）            │    │ RPO ≈ 秒级（异步复制）       │
└────────────────────────────────┘    └──────────────────────────────┘

WAL 归档到共享存储（S3/NFS）确保跨站点数据安全
```

## 核心维护操作

### 1. VACUUM -- 回收死元组空间

PostgreSQL 使用 MVCC（多版本并发控制）机制，UPDATE 和 DELETE 操作不会立即释放磁盘空间，而是将旧行版本标记为"死元组"（dead tuples）。这些死元组需要通过 VACUUM 操作来回收，否则会导致表膨胀（bloat），降低查询性能并浪费磁盘空间。

```sql
-- 手动 VACUUM 单表（不阻塞读写）
VACUUM ANALYZE orders;

-- 查看所有用户表的膨胀率（死元组占比）
SELECT schemaname, relname,
       n_live_tup,
       n_dead_tup,
       ROUND(n_dead_tup::numeric / NULLIF(n_live_tup + n_dead_tup, 0) * 100, 2) AS bloat_pct,
       last_autovacuum,
       last_autoanalyze
FROM pg_stat_user_tables
WHERE n_dead_tup > 10000
ORDER BY n_dead_tup DESC
LIMIT 20;
```

**踩坑案例：** 某电商平台订单表长期只做 INSERT 和 UPDATE（状态流转），几乎不 DELETE。表数据量从最初的几百万增长到 2 亿行，autovacuum 的触发阈值基于 `autovacuum_vacuum_scale_factor`（默认 0.2，即 20% 的行变化才触发）。对于 2 亿行的表，这意味着需要 4000 万行变化才会触发自动 VACUUM，导致死元组大量堆积。最终表膨胀到 200GB，而实际有效数据仅 80GB，查询性能下降 3 倍以上。

解决方案是对大表单独调低自动 VACUUM 阈值，或改用绝对行数阈值：

```sql
-- 方案一：降低百分比阈值
ALTER TABLE orders SET (autovacuum_vacuum_scale_factor = 0.02);
ALTER TABLE orders SET (autovacuum_analyze_scale_factor = 0.01);

-- 方案二：使用绝对行数阈值（推荐，效果更稳定）
ALTER TABLE orders SET (autovacuum_vacuum_scale_factor = 0);
ALTER TABLE orders SET (autovacuum_vacuum_threshold = 50000);
ALTER TABLE orders SET (autovacuum_analyze_scale_factor = 0);
ALTER TABLE orders SET (autovacuum_analyze_threshold = 25000);
```

对于已经严重膨胀的表，可以通过 `pg_repack` 扩展在线重建表，在不锁表的情况下消除膨胀。

### 2. 索引维护

索引是 PostgreSQL 查询性能的关键，但冗余或未使用的索引会拖慢写入性能并浪费磁盘空间。

```sql
-- 查找未使用的索引（idx_scan = 0 表示自上次统计重置后从未使用）
SELECT schemaname, relname, indexrelname,
       idx_scan AS index_scans,
       pg_size_pretty(pg_relation_size(indexrelid)) AS index_size
FROM pg_stat_user_indexes
WHERE idx_scan = 0
  AND schemaname NOT IN ('pg_catalog', 'information_schema')
ORDER BY pg_relation_size(indexrelid) DESC
LIMIT 20;

-- 检测重复索引（相同列上的多个索引）
SELECT pg_size_pretty(SUM(pg_relation_size(idx))::bigint) AS wasted_size
FROM (
  SELECT indexrelid AS idx, indrelid AS tbl,
         array_to_string(indkey, ',') AS cols,
         array_to_string(indclass, ',') AS opclasses
  FROM pg_index
) sub
GROUP BY tbl, cols, opclasses
HAVING COUNT(*) > 1;

-- 查看索引膨胀率（需要 pgstattuple 扩展）
CREATE EXTENSION IF NOT EXISTS pgstattuple;
SELECT indexrelname, pg_size_pretty(pg_relation_size(indexrelid)) AS size,
       ROUND(100.0 * avg_leaf_density, 2) AS leaf_density_pct
FROM pgstatindex_all
WHERE avg_leaf_density < 0.5
ORDER BY avg_leaf_density;
```

重建索引的推荐方式：

```sql
-- PostgreSQL 12+ 支持在线重建索引，不阻塞读写
REINDEX INDEX CONCURRENTLY idx_orders_created_at;

-- 重建整个 schema 的索引
REINDEX SCHEMA public CONCURRENTLY;
```

注意 `REINDEX CONCURRENTLY` 会占用额外磁盘空间（临时存放新索引），操作前需确认磁盘余量。同时建议在业务低峰期执行，避免对 IO 造成过大压力。

### 3. 连接管理

PostgreSQL 的每个连接都是一个操作系统进程（而非线程），默认 `max_connections` 通常设为 100-200。过高的连接数会导致进程调度开销增大、内存占用增加。生产环境应通过连接池控制实际数据库连接数。

```sql
-- 查看当前连接状态分布
SELECT datname, state, COUNT(*) AS conn_count
FROM pg_stat_activity
GROUP BY datname, state
ORDER BY count DESC;

-- 查看长时间空闲的事务连接
SELECT pid, usename, datname, state,
       NOW() - query_start AS idle_duration,
       query
FROM pg_stat_activity
WHERE state = 'idle in transaction'
  AND query_start < NOW() - INTERVAL '10 minutes'
ORDER BY idle_duration DESC;
```

**PgBouncer 配置示例：**

```ini
; pgbouncer.ini
[databases]
myapp = host=127.0.0.1 port=5432 dbname=myapp

[pgbouncer]
pool_mode = transaction          ; 事务级连接池，推荐模式
max_client_conn = 1000           ; 允许的最大客户端连接
default_pool_size = 25           ; 每个数据库/用户对的连接池大小
reserve_pool_size = 5            ; 预留连接数
reserve_pool_timeout = 3         ; 等待预留连接的超时（秒）
server_idle_timeout = 300        ; 空闲服务端连接超时（秒）
```

关键参数配置：

```ini
# postgresql.conf -- 关键参数参考（假设 64GB 内存的服务器）

# 内存相关
shared_buffers = '16GB'              # 物理内存的 25%，PostgreSQL 自身缓存
effective_cache_size = '48GB'        # 物理内存的 75%，查询规划器参考值
work_mem = '64MB'                    # 单个排序/哈希操作的内存上限
maintenance_work_mem = '2GB'         # VACUUM、CREATE INDEX、ALTER TABLE 操作内存
huge_pages = try                     # 启用大页内存，减少 TLB miss

# WAL 相关
wal_buffers = '64MB'
checkpoint_completion_target = 0.9
max_wal_size = '4GB'
min_wal_size = '1GB'

# 连接相关
max_connections = 200                # 配合 PgBouncer，不宜过大
idle_in_transaction_session_timeout = '10min'  ; 自动终止长时间空闲事务

# 查询规划
default_statistics_target = 100      # 统计信息精度
jit = on                             ; PostgreSQL 11+ 启用 JIT 编译

# 日志
log_min_duration_statement = 1000    ; 记录超过 1 秒的慢查询
log_checkpoints = on
log_lock_waits = on
log_temp_files = 0
```

`work_mem` 的设置需要特别注意：它是每个排序操作（ORDER BY）或哈希表（HASH JOIN）的内存上限，一个复杂查询可能同时使用多个 work_mem。设得太大会在并发查询时导致内存溢出。推荐公式：`work_mem = (可用内存 - shared_buffers) / (max_connections * 3)`。

## 备份与恢复

### pg_basebackup + WAL 归档（PITR）

这是 PostgreSQL 最基础也是最灵活的备份方案，支持时间点恢复（Point-In-Time Recovery, PITR）。

```bash
# 执行基础备份
pg_basebackup -D /backup/base-$(date +%Y%m%d) -Ft -z -P -h primary.host -U replicator

# postgresql.conf 配置 WAL 归档
wal_level = replica
archive_mode = on
archive_command = 'rsync -a %p /backup/wal_archive/%f'
# 或使用更可靠的归档命令：
# archive_command = 'aws s3 cp %p s3://my-pg-backup/wal/%f'
```

恢复到指定时间点：

```bash
# 1. 停止 PostgreSQL
systemctl stop postgresql

# 2. 恢复基础备份
tar -xzf /backup/base-20260601/base.tar.gz -C /var/lib/postgresql/17/main

# 3. 创建 recovery 配置
cat > /var/lib/postgresql/17/main/postgresql.auto.conf <<'EOF'
restore_command = 'cp /backup/wal_archive/%f %p'
recovery_target_time = '2026-06-13 14:30:00+08'
recovery_target_action = 'promote'
EOF

# 4. 创建 recovery 信号文件
touch /var/lib/postgresql/17/main/recovery.signal

# 5. 启动 PostgreSQL，自动进入恢复模式
systemctl start postgresql
```

### pgBackRest

pgBackRest 是目前推荐的 PostgreSQL 备份工具，功能全面、可靠性高。

```ini
; pgbackrest.conf
[global]
repo1-path = /var/lib/pgbackrest
repo1-retention-full = 4            ; 保留 4 个全量备份
repo1-retention-diff = 7            ; 保留 7 个差异备份
compress-type = zstd                ; 使用 zstd 压缩
process-max = 4                     ; 并行数

[mydb]
pg1-path = /var/lib/postgresql/17/main
```

```bash
# 全量备份
pgbackrest --stanza=mydb backup --type=full

# 差异备份
pgbackrest --stanza=mydb backup --type=diff

# 增量备份
pgbackrest --stanza=mydb backup --type=incr

# 恢复到最新状态
pgbackrest --stanza=mydb restore

# 恢复到指定时间点
pgbackrest --stanza=mydb restore --type=time --target="2026-06-13 14:30:00+08"
```

### 逻辑备份

```bash
# 单数据库逻辑备份
pg_dump -h localhost -U postgres -Fc myapp > /backup/myapp-$(date +%Y%m%d).dump

# 全集群备份（包含角色、表空间等全局对象）
pg_dumpall -h localhost -U postgres --globals-only > /backup/globals-$(date +%Y%m%d).sql

# 恢复逻辑备份
pg_restore -h localhost -U postgres -d myapp -j 4 /backup/myapp-20260613.dump

# 仅恢复特定表
pg_restore -h localhost -U postgres -d myapp -t orders /backup/myapp-20260613.dump
```

逻辑备份适合小数据量或需要跨版本迁移的场景，但不适合大型数据库（超过 100GB 建议 pgBackRest）。

**备份策略建议：**

| 策略 | 全量 | 差异/增量 | WAL 归档 | 保留期 |
|------|------|-----------|----------|--------|
| 基础 | 每周日 | -- | 持续 | 4 周 |
| 标准 | 每周日 | 每日差异 | 持续 | 全量 4 周，差异 2 周 |
| 高要求 | 每周日 | 每日差异 | 持续 | 全量 8 周，WAL 不删 |

## 常见问题排查

### 问题 1：连接数耗尽

**现象：** 应用报错 `FATAL: sorry, too many clients already`，所有新建连接被拒绝。

```bash
# 查看当前最大连接数配置
psql -c "SHOW max_connections;"

# 查看连接数分布（按数据库和状态）
SELECT datname, usename, client_addr, state, COUNT(*)
FROM pg_stat_activity
GROUP BY datname, usename, client_addr, state
ORDER BY count DESC;

# 紧急释放空闲连接
SELECT pg_terminate_backend(pid)
FROM pg_stat_activity
WHERE state = 'idle in transaction'
  AND query_start < NOW() - INTERVAL '30 minutes';
```

**根因分析与解决：**

- **应用连接泄漏**：检查应用是否在异常路径中忘记释放连接。确保使用连接池（如 HikariCP、PgBouncer）并配置合理的超时参数。
- **慢查询阻塞**：某个慢查询占用连接不释放，后续请求不断创建新连接。排查慢查询并优化。
- **长事务**：事务未提交导致连接无法回收。设置 `idle_in_transaction_session_timeout = '10min'`，自动终止长时间空闲的事务连接。
- **应急处理**：调高 `max_connections` 是临时手段，不推荐长期使用。正确做法是引入 PgBouncer 事务级连接池。

### 问题 2：复制延迟

**现象：** 从库数据落后主库，读查询结果不一致。业务依赖读写分离时，用户可能看不到刚提交的数据。

```sql
-- 在主库查看所有从库的复制状态
SELECT client_addr, application_name, state,
       sent_lsn, write_lsn, flush_lsn, replay_lsn,
       (sent_lsn - replay_lsn) AS lag_bytes,
       replay_lag
FROM pg_stat_replication
ORDER BY replay_lag DESC;

-- 在从库查看自身的接收和回放进度
SELECT pg_is_in_recovery(),
       pg_last_wal_receive_lsn(),
       pg_last_wal_replay_lsn(),
       pg_last_xact_replay_timestamp();
```

**常见原因与对策：**

| 原因 | 排查方法 | 解决 |
|------|----------|------|
| 从库磁盘 IO 慢 | `iostat -x 1` 查看磁盘利用率 | 升级磁盘（SSD）或调整 `wal_receiver_status_interval` |
| 从库长查询阻塞回放 | 查看从库 `pg_stat_activity` 中的长查询 | 优化查询或将报表查询转移到专用从库 |
| 网络带宽不足 | `iftop` 或 `nethogs` 查看网络流量 | 升级网络、启用 WAL 压缩 `wal_compression = on` |
| 主库大批量写入 | 检查主库写入速率和 WAL 生成量 | 分批写入，避免单次大批量操作 |

### 问题 3：查询突然变慢

查询性能突然下降是生产环境中最常见也最棘手的问题，常见原因包括锁等待和执行计划变化。

```sql
-- 查看当前正在执行的慢查询
SELECT pid, datname, usename, state,
       wait_event_type, wait_event,
       NOW() - query_start AS duration,
       LEFT(query, 200) AS query_preview
FROM pg_stat_activity
WHERE state = 'active'
  AND pid != pg_backend_pid()
  AND NOW() - query_start > INTERVAL '5 seconds'
ORDER BY duration DESC;

-- 查看锁等待链（谁阻塞了谁）
SELECT blocked.pid AS blocked_pid,
       LEFT(blocked.query, 100) AS blocked_query,
       blocking.pid AS blocking_pid,
       LEFT(blocking.query, 100) AS blocking_query,
       blocked_locks.locktype,
       blocked_locks.mode AS blocked_mode
FROM pg_stat_activity blocked
JOIN pg_locks blocked_locks ON blocked.pid = blocked_locks.pid
JOIN pg_locks blocking_locks
  ON blocked_locks.locktype = blocking_locks.locktype
  AND blocked_locks.database IS NOT DISTINCT FROM blocking_locks.database
  AND blocked_locks.relation IS NOT DISTINCT FROM blocking_locks.relation
  AND blocked_locks.pid != blocking_locks.pid
JOIN pg_stat_activity blocking ON blocking_locks.pid = blocking.pid
WHERE NOT blocked_locks.granted;
```

**执行计划变化**（plan regression）通常由统计信息不准确引起：

```sql
-- 手动更新统计信息
ANALYZE orders;

-- 查看表的统计信息上次更新时间
SELECT relname, last_analyze, last_autoanalyze
FROM pg_stat_user_tables
WHERE relname = 'orders';

-- 查看查询的实际执行计划
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT * FROM orders WHERE user_id = 12345 ORDER BY created_at DESC LIMIT 20;
```

建议在 `postgresql.conf` 中设置 `log_min_duration_statement = 1000`（记录超过 1 秒的查询），配合 `auto_explain` 扩展自动记录慢查询的执行计划，便于事后分析。

### 问题 4：磁盘空间暴涨

**现象：** 磁盘使用率在短时间内急剧上升，可能触发监控告警。

```sql
-- 查看各数据库占用空间
SELECT datname, pg_size_pretty(pg_database_size(datname)) AS size
FROM pg_database
WHERE datistemplate = false
ORDER BY pg_database_size(datname) DESC;

-- 查看最大的表（含索引）
SELECT schemaname, relname,
       pg_size_pretty(pg_total_relation_size(relid)) AS total_size,
       pg_size_pretty(pg_relation_size(relid)) AS table_size,
       pg_size_pretty(pg_indexes_size(relid)) AS index_size
FROM pg_stat_user_tables
ORDER BY pg_total_relation_size(relid) DESC
LIMIT 20;

-- 查看 WAL 日志堆积
SELECT pg_size_pretty(pg_wal_lsn_diff(pg_current_wal_lsn(), '0/0')::bigint) AS wal_generated;

-- 查看 WAL 目录大小
-- ls -lh $PGDATA/pg_wal/
```

**常见原因：**

- **表膨胀**：VACUUM 未及时回收死元组（见上文 VACUUM 章节）
- **WAL 堆积**：`archive_command` 失败导致 WAL 无法归档，堆积在 `pg_wal/` 目录。检查 `pg_stat_archiver` 视图
- **临时文件**：大查询排序溢出到磁盘。检查 `log_temp_files = 0` 记录所有临时文件使用
- **未清理的旧数据**：分区表未及时清理过期分区，或日志表无限增长

```bash
# 紧急释放 WAL 空间（确认归档正常后）
# 不要直接删除 pg_wal 下的文件，使用：
pg_archivecleanup /var/lib/postgresql/17/main/pg_wal 000000010000000A00000042

# 检查归档是否卡住
psql -c "SELECT * FROM pg_stat_archiver;"
```

## PostgreSQL on Kubernetes

在 Kubernetes 环境中运行 PostgreSQL 是近年来的趋势，主流方案有两个：

### CloudNativePG

CloudNativePG（简称 CNP）是 EDB 公司开源的 Kubernetes Operator，目前是 CNCF 沙箱项目。其设计理念是将 PostgreSQL 的运维知识编码为 Kubernetes 原生资源。

核心特性：

- **声明式管理**：通过 Cluster CRD 定义 PostgreSQL 集群，Operator 自动创建 PVC、StatefulSet、Service
- **自动故障切换**：基于 Raft 共识算法的 Leader 选举，切换时间通常在 30 秒内
- **内置备份**：原生支持 pgBackRest，支持 S3/Azure/GCS 等对象存储
- **滚动更新**：支持 PostgreSQL 大版本升级的滚动更新

```yaml
# CloudNativePG 集群定义示例
apiVersion: postgresql.cnpg.io/v1
kind: Cluster
metadata:
  name: myapp-pg
spec:
  instances: 3

  postgresql:
    parameters:
      shared_buffers: "4GB"
      effective_cache_size: "12GB"
      work_mem: "64MB"
      log_min_duration_statement: "1000"

  bootstrap:
    initdb:
      database: myapp
      owner: appuser

  storage:
    size: 100Gi
    storageClass: local-ssd

  backup:
    barmanObjectStore:
      destinationPath: "s3://my-pg-backup/"
      s3Credentials:
        accessKeyId:
          name: s3-creds
          key: ACCESS_KEY_ID
        secretAccessKey:
          name: s3-creds
          key: ACCESS_SECRET_KEY
      wal:
        compression: gzip
      data:
        compression: gzip
        jobs: 2

  monitoring:
    enablePodMonitor: true
```

### Zalando Postgres Operator

Zalando Operator 是另一个成熟的 K8s PostgreSQL 方案，基于 Spilo（Patroni + PostgreSQL 的 Docker 镜像）。

两者对比：

| 维度 | CloudNativePG | Zalando Operator |
|------|--------------|------------------|
| 核心架构 | 自研 Operator | Patroni + Spilo |
| 备份方案 | 内置 pgBackRest | 需额外配置 WAL-G |
| 证书管理 | 原生支持 | 需额外配置 |
| 社区活跃度 | 高（CNCF 沙箱） | 高（GitHub 4k+ Stars） |
| 学习曲线 | 较平缓 | 稍复杂 |
| 多集群支持 | 支持 | 支持 |

**K8s 部署注意事项：**

- **存储**：必须使用本地 SSD StorageClass（如 `local-volume-provisioner`），不要用网络存储。PostgreSQL 对 IO 延迟极为敏感。
- **资源请求**：务必设置 `requests` 和 `limits` 一致（Guaranteed QoS），避免因 CPU 节流导致性能抖动。
- **反亲和性**：确保同一集群的副本分布在不同节点和可用区。
- **PDB**：配置 PodDisruptionBudget，防止节点维护时同时驱逐多个副本。

## 监控指标

以下表格列出生产环境必须监控的 PostgreSQL 关键指标：

| 指标 | 采集方式 | 告警阈值 | 说明 |
|------|----------|----------|------|
| 活跃连接数 | `pg_stat_activity` | > 80% max_connections | 连接数过高可能导致请求被拒 |
| 缓存命中率 | `pg_stat_database` (blks_hit/(blks_hit+blks_read)) | < 99% | 命中率低说明 shared_buffers 不足或查询缺少索引 |
| 复制延迟 | `pg_stat_replication.replay_lag` | > 30s | 从库数据落后主库，影响读一致性 |
| 死元组数量 | `pg_stat_user_tables.n_dead_tup` | > 表行数的 10% | VACUUM 未及时回收 |
| 锁等待 | `pg_locks WHERE NOT granted` | 等待数 > 10 或持续 > 60s | 存在锁竞争或长事务阻塞 |
| WAL 生成速率 | `pg_stat_wal` | 视业务而定 | 异常升高可能有大批量写入 |
| 表膨胀率 | `pg_stat_user_tables` 计算 | > 30% | 需要考虑 pg_repack |
| 事务提交率 | `pg_stat_database` (xact_commit/(xact_commit+xact_rollback)) | < 99% | 回滚率高可能有应用错误 |
| 慢查询数量 | `pg_stat_statements` | > 1s | 需要优化查询或索引 |
| 磁盘使用率 | 监控系统直接采集 | > 80% | 磁盘满会导致数据库崩溃 |

推荐使用 `postgres_exporter`（Prometheus 生态）采集指标，配合 Grafana 的 PostgreSQL Dashboard 进行可视化展示。

## 总结

PostgreSQL 生产运维的核心要点可归纳为以下几点：

- **版本管理**：保持使用最近 2 个大版本，提前规划升级路径，利用 pg_upgrade --link 减少停机时间
- **架构设计**：根据规模选择合适的高可用方案，小规模用 repmgr，中规模用 Patroni，K8s 环境用 CloudNativePG
- **VACUUM 管理**：理解 MVCC 机制，对大表调整 autovacuum 阈值，定期检查表膨胀率
- **连接管理**：生产环境必须使用 PgBouncer 连接池，设置 idle_in_transaction 超时
- **备份恢复**：pgBackRest 是首选方案，确保 WAL 持续归档，定期演练恢复流程
- **监控告警**：重点关注连接数、缓存命中率、复制延迟、死元组、锁等待五个核心指标
- **K8s 部署**：使用本地 SSD 存储，配置 Guaranteed QoS 和 Pod 反亲和性

PostgreSQL 的运维实践需要深入理解其内部机制（MVCC、WAL、查询规划器），而非仅仅停留在参数调优层面。建议运维团队定期阅读 [PostgreSQL 官方文档](https://www.postgresql.org/docs/)和 [Percona Blog](https://www.percona.com/blog/category/postgresql/)，保持对版本新特性的跟踪。

**参考资源：**

- [PostgreSQL 官方文档](https://www.postgresql.org/docs/)
- [CloudNativePG 文档](https://cloudnative-pg.io/docs/)
- [Patroni GitHub](https://github.com/patroni/patroni)
- [pgBackRest 文档](https://pgbackrest.org/)
- [PostgreSQL 常见错误排查 -- Percona](https://www.percona.com/blog/10-common-postgresql-errors/)
- [K8s 上运行 PostgreSQL 排障 -- Crunchy Data](https://www.crunchydata.com/blog/troubleshooting-postgres-in-kubernetes)
