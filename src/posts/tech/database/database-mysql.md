---
title: MySQL 生产运维实战
icon: database
date: 2026-06-13
category:
  - 技术
tag:
  - MySQL
  - 数据库
  - 运维
---

# MySQL 生产运维实战

MySQL 是全球使用最广泛的开源关系型数据库，从互联网初创公司到大型企业核心业务系统均有大量部署。本文基于生产环境的真实运维经验，系统梳理 MySQL 的架构设计、日常维护、备份恢复、故障排查和容器化部署要点。

<!-- more -->

## 版本现状

| 版本 | 发布时间 | 类型 | 关键特性 |
|------|----------|------|----------|
| **9.x** | 2024-07+ | Innovation | 性能持续优化、向量存储预览、JSON_TABLE 增强 |
| **8.4 LTS** | 2024-04 | 长期支持 | Improved Parser、GTID 增强、持久化运行时配置 |
| **8.0** | 2018-04 | 扩展支持 | 窗口函数、CTE、JSON 增强、InnoDB Cluster、角色管理 |
| **5.7** | 2015-10 | EOS (2023-10) | JSON 基础支持、GTID 复制、多源复制 |

MySQL 从 8.0 起采用了新的版本策略：**Innovation 版本**（如 9.0、9.1）每季度发布，快速引入新特性；**LTS 版本**（如 8.4）提供 8 年支持周期，适合生产长期运行。生产建议：新项目使用 **8.4 LTS**，存量系统至少升级到 **8.0**。

### 主要分支

| 分支 | 维护方 | 特点 |
|------|--------|------|
| **Percona Server** | Percona | 完全兼容 MySQL，增强审计、线程池、慢查询扩展信息、TokuDB 引擎 |
| **MariaDB** | MariaDB Foundation | 从 5.5 分支独立发展，InnoDB 替代为 XtraDB，引入 ColumnStore 分析引擎 |
| **TiDB** | PingCAP | MySQL 协议兼容的分布式数据库，HTAP 架构，适合需要水平扩展的场景 |

### MySQL 8.0 关键特性

- **窗口函数**：`ROW_NUMBER()`、`RANK()`、`LEAD()`/`LAG()` 等分析函数，替代复杂自连接查询
- **公用表表达式 (CTE)**：`WITH RECURSIVE` 支持递归查询，简化树形/层级数据处理
- **JSON 增强**：`JSON_TABLE()` 将 JSON 数组展开为关系表，`->>` 操作符简化 JSON 路径提取
- **InnoDB Cluster**：MySQL Shell + MySQL Router + Group Replication 一体化高可用方案
- **角色管理**：`CREATE ROLE`、`GRANT ... TO role`，简化权限管理
- **通用表达式与函数索引**：支持在生成列上创建索引，间接实现函数索引

## 生产架构

### 主从复制架构

MySQL 复制是数据同步和高可用的基础机制。生产环境常用三种复制模式：

```
                     ┌──────────────────┐
                     │   Application    │
                     │   写 → Primary   │
                     │   读 → Router    │
                     └────────┬─────────┘
                              │
               ┌──────────────┼──────────────┐
               v              v              v
      ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
      │   Primary    │ │  Replica-1   │ │  Replica-2   │
      │   Read/Write │ │  Read Only   │ │  Read Only   │
      │   Binlog Dump│ │  IO Thread   │ │  IO Thread   │
      └──────┬───────┘ └──────┬───────┘ └──────┬───────┘
             │                │                │
             └─── Binlog ───► Relay Log ──────►│
                 (异步/半同步)  SQL Thread       │
```

| 复制模式 | 数据安全性 | 性能影响 | 适用场景 |
|----------|-----------|---------|---------|
| **异步复制** | 主库宕机可能丢数据 | 无额外延迟 | 读扩展、非关键业务 |
| **半同步复制** | 至少一个从库确认接收 | 略增写延迟（~1ms） | 大多数生产环境 |
| **组复制** | 多数派共识，强一致 | 写性能有损耗 | 金融级一致性要求 |

```sql
-- 半同步复制配置（主库）
SET GLOBAL plugin_load = 'rpl_semi_sync_master=semisync_master.so';
SET GLOBAL rpl_semi_sync_master_enabled = ON;
SET GLOBAL rpl_semi_sync_master_timeout = 3000;  -- 3s 超时后降级为异步

-- 半同步复制配置（从库）
SET GLOBAL plugin_load = 'rpl_semi_sync_slave=semisync_slave.so';
SET GLOBAL rpl_semi_sync_slave_enabled = ON;
```

### InnoDB Cluster

MySQL 官方推荐的高可用方案，由三个组件协同工作：

- **MySQL Shell**：管理工具，用于创建集群、配置实例、执行管理员操作
- **MySQL Router**：轻量级中间件，自动路由读写请求，对应用透明
- **Group Replication**：基于 Paxos 的多主复制协议，自动故障检测和切换

```bash
# MySQL Shell 创建集群
mysqlsh root@primary:3306

# 在 MySQL Shell 中执行
dba.configureInstance('root@replica1:3306')
dba.configureInstance('root@replica2:3306')

var cluster = dba.createCluster('prodCluster')
cluster.addInstance('root@replica1:3306')
cluster.addInstance('root@replica2:3306')

# 查看集群状态
cluster.status()
```

```
{
    "clusterName": "prodCluster",
    "defaultReplicaSet": {
        "name": "default",
        "ssl": "REQUIRED",
        "status": "OK",
        "statusText": "Cluster is ONLINE and can tolerate up to ONE failure.",
        "topology": {
            "primary:3306": {
                "address": "primary:3306",
                "mode": "R/W",
                "readReplicas": {},
                "role": "HA",
                "status": "ONLINE"
            },
            "replica1:3306": {
                "address": "replica1:3306",
                "mode": "R/O",
                "readReplicas": {},
                "role": "HA",
                "status": "ONLINE"
            },
            "replica2:3306": {
                "address": "replica2:3306",
                "mode": "R/O",
                "readReplicas": {},
                "role": "HA",
                "status": "ONLINE"
            }
        }
    }
}
```

### 高可用方案对比

| 方案 | 自动故障切换 | 数据一致性 | 运维复杂度 | 适用阶段 |
|------|------------|-----------|-----------|---------|
| **MHA** | 是（30s 内） | 可能丢数据 | 中等，需管理脚本 | 遗留系统，逐步淘汰 |
| **Orchestrator** | 是，可视化拓扑 | 取决于复制模式 | 较低，Web UI 管理 | 中大型环境 |
| **InnoDB Cluster** | 是，内建于协议 | 强一致（多数派） | 较低，官方工具链 | 新项目首选 |

### 读写分离方案

| 工具 | 特点 | 适用场景 |
|------|------|---------|
| **ProxySQL** | 规则灵活、查询缓存、连接复用、支持读写分离和分片 | 复杂路由需求、多租户 |
| **MySQL Router** | 官方出品、与 InnoDB Cluster 深度集成、配置简单 | InnoDB Cluster 环境 |
| **应用层路由** | 代码级别控制、无中间件依赖 | 简单读写分离、对延迟敏感 |

## MySQL 高可用与集群部署

### 高可用方案对比

| 方案 | 自动切换 | 一致性 | 部署复杂度 | 适用规模 |
|------|---------|--------|-----------|---------|
| **MHA** | 是（10-30s） | 强一致 | 中 | 传统主从 |
| **Orchestrator** | 是（秒级） | 强一致 | 中 | 大规模 MySQL 集群 |
| **InnoDB Cluster** | 是（秒级） | 强一致 | 中 | MySQL 8.0+ 推荐 |
| **InnoDB ReplicaSet** | 否（手动） | 强一致 | 低 | 简单主从 |
| **Vitess** | 是 | 最终一致 | 高 | K8s 大规模分片 |
| **MyCat/ShardingSphere** | 否 | 依赖后端 | 高 | 分库分表 |

### InnoDB Cluster 详解（MySQL 官方推荐）

InnoDB Cluster = MySQL Shell + MySQL Router + Group Replication，是 MySQL 官方的高可用方案：

```
架构：
┌─ MySQL Router × 2+ ──────────────────┐
│  读写分离路由                           │
│  端口 6446（读写）→ Primary             │
│  端口 6447（只读）→ Secondary           │
│  自动感知集群拓扑变化                   │
└───────────────┬────────────────────────┘
                │
┌─ Group Replication（单主模式）──────────┐
│                                         │
│ ┌─ Primary (R/W) ───────┐              │
│ │  接受所有写操作         │              │
│ │  Paxos 协议广播事务     │              │
│ └───────────┬────────────┘              │
│      ┌──────┴───────┐                   │
│ ┌─ Secondary ─┐ ┌─ Secondary ─┐         │
│ │ 只读         │ │ 只读         │        │
│ │ Paxos 投票   │ │ Paxos 投票   │        │
│ │ 可自动提升   │ │ 可自动提升   │        │
│ └──────────────┘ └──────────────┘        │
│                                         │
│ Group Replication 内置：                 │
│ - 自动故障检测（心跳 + Paxos）           │
│ - 自动 Primary 选举                     │
│ - 防脑裂（多数派仲裁）                   │
└─────────────────────────────────────────┘
```

### Group Replication 故障切换流程

```
正常状态（单主模式）：
┌─ node1 (PRIMARY) ─┐
│  读写              │  ← MySQL Router 路由写流量到这里
└────────┬───────────┘
    ┌────┴────┐
┌─ node2 ─┐ ┌─ node3 ─┐
│ SECONDARY│ │ SECONDARY│  ← MySQL Router 路由读流量
│ ONLINE   │ │ ONLINE   │
└──────────┘ └──────────┘

故障切换（node1 宕机）：
  ┌─────────────────────┐
  │ 1. node1 宕机        │
  │    心跳超时           │
  └──────────┬──────────┘
             ▼
  ┌──────────────────────────────┐
  │ 2. Group Replication 检测到   │
  │    成员离开                   │
  │    检查是否满足多数派          │
  │    (2/3 存活，满足)           │
  └──────────┬───────────────────┘
             ▼
  ┌──────────────────────────────┐
  │ 3. 自动选举新 Primary         │
  │    基于选举算法选择 node2      │
  │    node2 提升为 PRIMARY       │
  │    node3 继续作为 SECONDARY   │
  └──────────┬───────────────────┘
             ▼
  ┌──────────────────────────────┐
  │ 4. MySQL Router 感知拓扑变化  │
  │    自动更新路由               │
  │    写流量 → node2             │
  │    读流量 → node2 + node3     │
  │    客户端无需修改连接配置      │
  └──────────────────────────────┘

选举条件：
- 必须满足多数派（N/2 + 1 节点存活）
- 优先选举 server_uuid 最小或权重最高的节点
- GTID 事务最完整的节点优先

防脑裂：
- Group Replication 使用 Paxos 协议
- 网络分区时，少数派自动退出组（变成 ERROR 状态）
- 只有多数派分区能继续服务
```

### 半同步复制 vs 异步复制

```
异步复制（默认）：
Primary → 写入 Binlog → 返回成功 → 异步发送到 Secondary
                          ↑
                     不等待 Secondary 确认
                     Primary 宕机可能丢数据

半同步复制（推荐生产）：
Primary → 写入 Binlog → 等待至少 1 个 Secondary 确认 → 返回成功
                          ↑
                     等待 Secondary 收到 Binlog
                     不丢失数据（最多丢失 1 个事务）

配置：
# 在所有节点执行
INSTALL PLUGIN rpl_semi_sync_master SONAME 'semisync_master.so';
INSTALL PLUGIN rpl_semi_sync_slave SONAME 'semisync_slave.so';

# Primary
SET GLOBAL rpl_semi_sync_master_enabled = 1;
SET GLOBAL rpl_semi_sync_master_timeout = 1000;  # 1秒超时后降级为异步

# Secondary
SET GLOBAL rpl_semi_sync_slave_enabled = 1;
```

### MySQL Router 自动路由

```ini
# MySQL Router 配置（自动从 Group Replication 获取拓扑）
[metadata_cache:cluster]
type=router
router_id=1
bootstrap_server_addresses=mysql://node1:3306,mysql://node2:3306,mysql://node3:3306
user=router_user
metadata_cluster=cluster
ttl=5

[routing:rw]
bind_address=0.0.0.0
bind_port=6446
destinations=metadata-cache://cluster/?role=PRIMARY
routing_strategy=first-available

[routing:ro]
bind_address=0.0.0.0
bind_port=6447
destinations=metadata-cache://cluster/?role=SECONDARY
routing_strategy=round-robin
```

### 多数据中心 InnoDB Cluster

```
┌─ DC-A ──────────────────────┐    ┌─ DC-B ──────────────────────┐
│ Primary (R/W)                │    │ Secondary (R)                │
│ Secondary (R)                │    │                              │
│                              │    │                              │
│ 2 票（多数派）               │    │ 1 票                        │
│ GTID 确保数据一致            │    │ 异步/半同步复制              │
└──────────────────────────────┘    └──────────────────────────────┘
DC-A 故障时需要手动提升 DC-B 的节点
```

## 核心维护操作

### InnoDB Buffer Pool 调优

Buffer Pool 是 InnoDB 性能的核心，缓存数据页和索引页，命中率直接决定查询性能。

```ini
# my.cnf 关键配置
[mysqld]
# Buffer Pool 大小，建议物理内存的 70%-80%
# 专用数据库服务器 64GB 内存可设为 48GB-52GB
innodb_buffer_pool_size = 48G

# 多实例减少锁争用，每个实例不低于 1GB
# 建议：总大小 / 1GB，上限为 64
innodb_buffer_pool_instances = 48

# 预热：MySQL 重启时自动加载之前缓存的热数据页
innodb_buffer_pool_dump_at_shutdown = ON
innodb_buffer_pool_load_at_startup = ON

# 在线调整大小（5.7.5+ 支持，无需重启）
# SET GLOBAL innodb_buffer_pool_size = 53687091200;
```

```sql
-- 查看 Buffer Pool 命中率
SELECT
  VARIABLE_VALUE AS reads,
  (SELECT VARIABLE_VALUE
   FROM performance_schema.global_status
   WHERE VARIABLE_NAME = 'Innodb_buffer_pool_read_requests') AS requests,
  ROUND(
    (1 - VARIABLE_VALUE / (
      SELECT VARIABLE_VALUE
      FROM performance_schema.global_status
      WHERE VARIABLE_NAME = 'Innodb_buffer_pool_read_requests'
    )) * 100, 4
  ) AS miss_rate_pct
FROM performance_schema.global_status
WHERE VARIABLE_NAME = 'Innodb_buffer_pool_reads';
-- miss_rate_pct 应低于 1%，否则需要增大 Buffer Pool
```

### 慢查询分析

```ini
# 开启慢查询日志
[mysqld]
slow_query_log = ON
long_query_time = 1          -- 超过 1s 记录，生产建议 0.5-1s
log_queries_not_using_indexes = ON
slow_query_log_file = /var/log/mysql/slow.log
```

```bash
# 使用 pt-query-digest 分析慢查询
pt-query-digest /var/log/mysql/slow.log --since '24h ago'

# 输出示例：
# Rank Query ID         Response time  Calls R/Call V/M
# ==== ================ ============== ===== ====== ====
#    1 0x3F8E1A2B...    1523.4 62.4%   3421  0.45  0.01
#    2 0x7B4C9D0E...     876.2 35.9%    891  0.98  0.02
```

```sql
-- MySQL 8.0 使用 EXPLAIN ANALYZE 获取真实执行统计
EXPLAIN ANALYZE
SELECT o.order_id, c.customer_name, SUM(oi.amount)
FROM orders o
JOIN customers c ON o.customer_id = c.customer_id
JOIN order_items oi ON o.order_id = oi.order_id
WHERE o.created_at >= '2026-01-01'
GROUP BY o.order_id, c.customer_name
ORDER BY SUM(oi.amount) DESC
LIMIT 100;

-- 输出包含实际行数、循环次数、执行时间
-- 重点关注：实际扫描行数 vs 估算行数差异大的操作
```

### Binlog 管理

```ini
[mysqld]
# Binlog 格式，生产环境必须使用 ROW
binlog_format = ROW

# 过期时间（8.0 使用 binlog_expire_logs_seconds）
# 8.0 之前用 expire_logs_days
binlog_expire_logs_seconds = 604800    -- 7 天

# 单个 Binlog 文件大小
max_binlog_size = 512M

# 开启 GTID（全局事务标识）
gtid_mode = ON
enforce_gtid_consistency = ON

# Sync 策略：1 = 每次事务提交刷盘（最安全）
sync_binlog = 1
```

```bash
# 查看 Binlog 文件列表
mysql -e "SHOW BINARY LOGS;"

# 手动清理过期 Binlog（谨慎操作）
mysql -e "PURGE BINARY LOGS BEFORE '2026-06-06 00:00:00';"

# 使用 mysqlbinlog 解析 Binlog 内容
mysqlbinlog --base64-output=DECODE-ROWS -v \
  --start-datetime='2026-06-13 10:00:00' \
  --stop-datetime='2026-06-13 10:30:00' \
  mysql-bin.000123
```

### 连接管理

```ini
[mysqld]
# 最大连接数，根据业务需求设定
max_connections = 2000

# 线程缓存，减少线程创建开销
thread_cache_size = 64

# 连接超时
wait_timeout = 28800             -- 非交互连接 8 小时
interactive_timeout = 28800      -- 交互连接 8 小时
max_connect_errors = 100000      -- 防止因 DNS 解析问题封禁
```

```sql
-- 查看当前连接状态
SHOW PROCESSLIST;

-- 查看连接来源统计
SELECT SUBSTRING_INDEX(HOST, ':', 1) AS host, COUNT(*) AS connections
FROM information_schema.PROCESSLIST
GROUP BY host
ORDER BY connections DESC;

-- 查看线程缓存命中率
SHOW STATUS LIKE 'Threads_created';
SHOW STATUS LIKE 'Connections';
-- 命中率 = 1 - Threads_created / Connections，应接近 1
```

### 关键参数配置参考

| 参数 | 推荐值 | 说明 |
|------|--------|------|
| `innodb_buffer_pool_size` | 物理内存 70%-80% | InnoDB 缓存池，最关键参数 |
| `innodb_buffer_pool_instances` | Buffer Pool / 1GB | 多实例减少锁争用 |
| `innodb_log_file_size` | 1G-2G | Redo Log 大小，影响写入性能 |
| `innodb_flush_log_at_trx_commit` | 1 | 每次事务刷盘，保证持久性 |
| `sync_binlog` | 1 | 每次事务同步 Binlog |
| `innodb_io_capacity` | SSD: 10000-20000 | InnoDB 后台刷新速率 |
| `innodb_io_capacity_max` | SSD: 20000-40000 | 刷新速率上限 |
| `innodb_flush_method` | O_DIRECT | 避免双重缓存 |
| `max_connections` | 1000-3000 | 根据业务需求 |
| `thread_cache_size` | 64-128 | 线程复用 |
| `table_open_cache` | 4000-8000 | 打开表缓存 |
| `sort_buffer_size` | 2M-4M | 排序缓冲，不宜过大 |
| `join_buffer_size` | 2M-4M | 连接缓冲 |
| `binlog_format` | ROW | 生产必须 ROW 格式 |
| `gtid_mode` | ON | 开启 GTID 复制 |

## 备份与恢复

### mysqldump 逻辑备份

```bash
# 全库备份
mysqldump \
  --single-transaction \       # InnoDB 一致性快照，不锁表
  --routines \                 # 包含存储过程和函数
  --triggers \                 # 包含触发器
  --events \                   # 包含事件
  --set-gtid-purged=ON \       # GTID 环境必需
  --all-databases \
  --result-file=/backup/mysql/full_$(date +%Y%m%d).sql

# 单库备份
mysqldump --single-transaction mydb > /backup/mysql/mydb_$(date +%Y%m%d).sql

# 压缩备份（节省 70% 以上空间）
mysqldump --single-transaction mydb | gzip > /backup/mysql/mydb_$(date +%Y%m%d).sql.gz

# 恢复
mysql < /backup/mysql/full_20260613.sql
gunzip < /backup/mysql/mydb_20260613.sql.gz | mysql mydb
```

### Percona XtraBackup 物理热备

物理备份直接复制 InnoDB 数据文件，速度远快于逻辑备份，适合大型数据库。

```bash
# 全量备份
xtrabackup --backup \
  --target-dir=/backup/mysql/full/20260613 \
  --user=root --password=xxxx

# 准备备份（应用 redo log 使备份一致）
xtrabackup --prepare \
  --target-dir=/backup/mysql/full/20260613

# 增量备份（基于上次全量）
xtrabackup --backup \
  --target-dir=/backup/mysql/incr/20260613 \
  --incremental-basedir=/backup/mysql/full/20260610 \
  --user=root --password=xxxx

# 恢复全量备份
# 1. 先 prepare 全量
xtrabackup --prepare --target-dir=/backup/mysql/full/20260613
# 2. 恢复到数据目录
xtrabackup --copy-back --target-dir=/backup/mysql/full/20260613
# 3. 修改权限
chown -R mysql:mysql /var/lib/mysql
# 4. 启动 MySQL
systemctl start mysql
```

### mysqlbinlog 增量恢复 (PITR)

利用 Binlog 实现基于时间点的恢复（Point-in-Time Recovery）：

```bash
# 1. 先恢复全量备份
xtrabackup --copy-back --target-dir=/backup/mysql/full/20260610
systemctl start mysql

# 2. 查看全量备份对应的 Binlog 位点
cat /backup/mysql/full/20260610/xtrabackup_binlog_info
# 输出：mysql-bin.000120  4567890

# 3. 从该位点开始应用 Binlog，恢复到指定时间点
mysqlbinlog \
  --start-position=4567890 \
  --stop-datetime='2026-06-13 14:30:00' \
  mysql-bin.000120 mysql-bin.000121 mysql-bin.000122 \
  | mysql

# 使用 GTID 恢复更精确
mysqlbinlog \
  --include-gtids='3e11fa47-71ca-11e1-9e33-c80aa9429562:1-56789' \
  mysql-bin.000120 mysql-bin.000121 \
  | mysql
```

### 备份策略建议

| 策略 | 方案 | 频率 | 保留周期 |
|------|------|------|---------|
| **全量备份** | XtraBackup 物理备份 | 每日凌晨 | 保留 7 天 |
| **增量备份** | XtraBackup 增量 | 每 6 小时 | 保留 3 天 |
| **Binlog 备份** | 定时复制到备份存储 | 实时 / 每 5 分钟 | 与全量备份配合 |
| **逻辑备份** | mysqldump（小库） | 每周 | 保留 4 周 |
| **异地容灾** | 备份文件同步到异地 | 每日 | 保留 30 天 |

## 常见问题排查

### 主从延迟

主从延迟是生产环境最常见的问题之一。延迟原因复杂，需要系统性排查。

```sql
-- 在从库检查延迟状态
SHOW SLAVE STATUS\G
-- 重点关注：
--   Seconds_Behind_Master: 延迟秒数
--   Exec_Master_Log_Pos vs Read_Master_Log_Pos: 执行位点差距
--   Slave_SQL_Running_State: SQL 线程状态
```

**常见原因与处理方案**：

| 原因 | 现象 | 处理 |
|------|------|------|
| 大事务 | 单次延迟突增 | 拆分大事务，避免批量 DELETE/UPDATE |
| 从库硬件差 | 持续延迟 | 升级从库硬件，尤其是磁盘 IO |
| 无主键表 DML | Relay Log 执行慢 | 所有表必须有主键 |
| 单线程回放延迟 | Binlog 量大但从库跟不上 | 开启多线程并行复制 |

```ini
# 并行复制配置（从库）
[mysqld]
# 基于组提交的并行复制（推荐）
slave_parallel_type = LOGICAL_CLOCK
slave_parallel_workers = 8          # 并行 worker 数量，建议 4-16
slave_preserve_commit_order = ON    # 保证提交顺序
```

```sql
-- GTID 跳过错误（数据不一致时的应急处理）
-- 查看当前失败的 GTID
SHOW SLAVE STATUS\G
--   Retrieved_Gtid_Set: 3e11fa47...:1-56789
--   Executed_Gtid_Set:  3e11fa47...:1-56784

-- 跳过下一个事务
SET GTID_NEXT='3e11fa47-71ca-11e1-9e33-c80aa9429562:56785';
BEGIN;
COMMIT;
SET GTID_NEXT='AUTOMATIC';
START SLAVE;
```

### 锁等待超时

```sql
-- 查看当前锁等待
SELECT * FROM performance_schema.data_lock_waits\G

-- 查看最近的死锁信息
SHOW ENGINE INNODB STATUS\G
-- 在 LATEST DETECTED DEADLOCK 部分

-- 查看锁等待超时设置
SHOW VARIABLES LIKE 'innodb_lock_wait_timeout';
-- 默认 50 秒，可根据业务调整

-- 开启死锁检测（默认开启）
SET GLOBAL innodb_deadlock_detect = ON;
```

**真实踩坑**：某业务高峰期频繁出现 `Lock wait timeout exceeded` 报错。排查发现一条 UPDATE 语句缺少索引，导致行锁升级为表锁，阻塞了其他事务。解决方式是为 WHERE 条件列添加索引。

### 磁盘空间不足

```bash
# 检查磁盘使用
df -h /var/lib/mysql

# 查看 MySQL 各部分占用
du -sh /var/lib/mysql/*

# Binlog 占用空间
mysql -e "SHOW BINARY LOGS;" | awk '{sum+=$2} END {print sum/1024/1024 " GB"}'
```

```sql
-- 清理过期 Binlog
PURGE BINARY LOGS BEFORE DATE_SUB(NOW(), INTERVAL 3 DAY);

-- 查看大表
SELECT table_schema, table_name,
       ROUND(data_length/1024/1024/1024, 2) AS data_gb,
       ROUND(index_length/1024/1024/1024, 2) AS index_gb,
       table_rows
FROM information_schema.tables
ORDER BY data_length DESC
LIMIT 20;
```

```bash
# 使用 pt-archiver 安全归档大表数据
# 将 90 天前的数据归档到归档表，每次 1000 行
pt-archiver \
  --source h=localhost,D=mydb,t=order_log \
  --dest h=localhost,D=mydb_archive,t=order_log \
  --where "created_at < DATE_SUB(NOW(), INTERVAL 90 DAY)" \
  --limit 1000 \
  --commit-each \
  --progress 10000
```

### 连接数耗尽

```sql
-- 查看当前连接数
SHOW STATUS LIKE 'Threads_connected';
SHOW STATUS LIKE 'Max_used_connections';

-- 查看各用户连接数
SELECT USER, COUNT(*) AS connections
FROM information_schema.PROCESSLIST
GROUP BY USER;

-- 查看当前最大连接数设置
SHOW VARIABLES LIKE 'max_connections';

-- 临时增加最大连接数（不重启）
SET GLOBAL max_connections = 3000;

-- 查看连接错误
SHOW STATUS LIKE 'Connection_errors%';
```

**应急处理**：当出现 `Too many connections` 时，MySQL 预留了一个 `super` 权限连接用于管理员登录。使用 `root` 账号登录后 `KILL` 掉空闲连接释放资源，然后排查连接泄漏的应用。

## MySQL on K8s

### Vitess

Vitess 是 PlanetScale 开源的 MySQL 数据库集群管理系统，原生支持 Kubernetes 部署。

```
┌────────────────────────────────────────────────────┐
│                  Kubernetes Cluster                 │
│                                                     │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐         │
│  │ vtgate-1 │  │ vtgate-2 │  │ vtgate-3 │         │
│  │ 查询路由  │  │ 查询路由  │  │ 查询路由  │         │
│  └─────┬────┘  └─────┬────┘  └─────┬────┘         │
│        └──────────────┼─────────────┘               │
│                       v                             │
│              ┌────────────────┐                     │
│              │   vtctld       │                     │
│              │   集群管理 API  │                     │
│              └───────┬────────┘                     │
│           ┌──────────┼──────────┐                   │
│           v          v          v                   │
│     ┌──────────┐ ┌──────────┐ ┌──────────┐        │
│     │ Shard -80│ │ Shard 80-│ │ Shard C0-│        │
│     │ primary  │ │ primary  │ │ primary  │        │
│     │ replica  │ │ replica  │ │ replica  │        │
│     │ rdonly   │ │ rdonly   │ │ rdonly   │        │
│     └──────────┘ └──────────┘ └──────────┘        │
└────────────────────────────────────────────────────┘
```

部署要点：

- **VTGate** 无状态，通过 Service 对应用暴露 MySQL 协议兼容端点，可水平扩展
- **VTTablet** 以 StatefulSet 部署，每个 Pod 运行一个 mysqld 和 vttablet 进程
- **分片管理** 通过 Vitess 的 VReplication 实现，支持在线分片分裂和合并
- **适合场景**：大规模分库分表、多租户 SaaS、需要在线 Schema 变更的环境

### MySQL Operator

Oracle 官方提供的 MySQL Operator for Kubernetes，支持 InnoDB Cluster 的自动化部署。

```yaml
# InnoDB Cluster 部署示例
apiVersion: mysql.oracle.com/v2
kind: InnoDBCluster
metadata:
  name: mysql-cluster
  namespace: database
spec:
  secretName: mysql-root-secret
  instances: 3
  tlsUseSelfSigned: true
  router:
    instances: 2
  datadirVolumeClaimTemplate:
    accessModes: ["ReadWriteOnce"]
    resources:
      requests:
        storage: 100Gi
    storageClassName: ssd-storage
  mycnf: |
    [mysqld]
    innodb_buffer_pool_size = 8G
    innodb_log_file_size = 1G
    max_connections = 1000
    binlog_format = ROW
    gtid_mode = ON
    enforce_gtid_consistency = ON
```

部署要点：

- 使用 **Local PV 或高性能 StorageClass**，避免网络存储带来 IO 延迟
- 为每个 MySQL 实例设置 **反亲和性**（anti-affinity），确保 Pod 分布在不同节点
- 配置 **PodDisruptionBudget**，保证滚动更新时始终有足够的可用实例
- 设置合理的 **resources.limits**，避免 MySQL 实例争抢节点资源
- 配置 **readinessProbe** 确保流量只路由到真正就绪的实例

## 监控指标

| 指标 | 说明 | 告警阈值建议 |
|------|------|-------------|
| `Threads_connected` | 当前连接数 | > max_connections 的 80% |
| `Threads_running` | 活跃线程数 | > CPU 核数的 2 倍 |
| `Innodb_buffer_pool_reads` | 磁盘读取次数 | 配合命中率，命中率 < 99% 告警 |
| `Innodb_row_lock_waits` | 行锁等待次数 | > 100/min |
| `Innodb_deadlocks` | 死锁次数 | > 0 告警 |
| `Slow_queries` | 慢查询数量 | > 50/min |
| `Seconds_Behind_Master` | 从库延迟秒数 | > 30s 告警，> 300s 严重 |
| `Binlog_cache_disk_use` | Binlog 缓存溢出到磁盘 | > 0 建议增大 binlog_cache_size |
| `Created_tmp_disk_tables` | 磁盘临时表数量 | > 100/min，检查 query 或增大 tmp_table_size |
| `Table_locks_waited` | 表锁等待次数 | > 0 建议排查（应使用 InnoDB） |
| `Innodb_log_waits` | Redo Log 等待次数 | > 0 建议增大 innodb_log_file_size |
| `Com_select/Com_insert/Com_update/Com_delete` | QPS/TPS | 监控趋势，异常波动告警 |

```bash
# Prometheus + mysqld_exporter 采集
# docker-compose.yml
services:
  mysqld-exporter:
    image: prom/mysqld-exporter:latest
    environment:
      DATA_SOURCE_NAME: "exporter:password@(mysql:3306)/"
    ports:
      - "9104:9104"
```

```yaml
# Prometheus 告警规则示例
groups:
  - name: mysql_alerts
    rules:
      - alert: MySQLReplicationLag
        expr: mysql_slave_seconds_behind_master > 30
        for: 2m
        labels:
          severity: warning
        annotations:
          summary: "MySQL 从库延迟超过 30s ({{ $value }}s)"

      - alert: MySQLTooManyConnections
        expr: mysql_global_status_threads_connected / mysql_global_variables_max_connections > 0.8
        for: 1m
        labels:
          severity: warning
        annotations:
          summary: "MySQL 连接数使用率超过 80%"

      - alert: MySQLBufferPoolHitRateLow
        expr: rate(mysql_global_status_innodb_buffer_pool_reads[5m]) / rate(mysql_global_status_innodb_buffer_pool_read_requests[5m]) > 0.01
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "MySQL Buffer Pool 命中率低于 99%"
```

## 总结

MySQL 生产运维的核心在于以下几点：

- **版本选择**：新项目使用 8.4 LTS，存量系统至少 8.0，开启 GTID 复制
- **架构设计**：InnoDB Cluster 是官方推荐的高可用方案，适合大多数场景；大规模分库分表考虑 Vitess
- **参数调优**：Buffer Pool 是最关键参数，务必根据物理内存合理设置；sync_binlog 和 innodb_flush_log_at_trx_commit 保证数据安全
- **备份策略**：物理备份 (XtraBackup) + Binlog 归档实现完整的 PITR 能力，定期验证恢复流程
- **监控告警**：连接数、复制延迟、Buffer Pool 命中率、慢查询是四个最核心的监控维度
- **故障应急**：主从延迟优先开启并行复制，锁问题排查索引，磁盘空间不足先清理 Binlog 再处理大表

运维没有银弹，建立完善的监控体系、制定清晰的应急预案、定期进行故障演练，才能在关键时刻从容应对。
