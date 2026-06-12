---
title: MongoDB 生产运维实战
icon: database
date: 2026-06-13
category:
  - 技术
tag:
  - MongoDB
  - 文档数据库
  - 运维
---

# MongoDB 生产运维实战

MongoDB 是当前最流行的文档数据库，以灵活的 Schema、水平扩展能力和丰富的查询语言在大数据、内容管理、物联网等场景中广泛应用。本文从生产运维视角出发，覆盖架构设计、日常维护、故障排查和容器化部署的完整实践。

<!-- more -->

## 版本现状

| 版本 | 发布时间 | 状态 | 关键特性 |
|------|----------|------|----------|
| **8.0** | 2024-07 | 当前稳定版 | 可查询加密（Queryable Encryption）、批量写入优化、改进的 `$lookup` 性能 |
| **7.0** | 2023-08 | 支持 | 可查询加密预览、列级安全、Bitmap 索引 |
| **6.0** | 2022-07 | LTS | Change Stream 增强、集群到集群同步、时间序列集合改进 |
| **5.0** | 2021-07 | EOS (2024-10) | 时序集合、在线重塑（Resharding） |

生产建议：新项目直接使用 **8.0**，存量集群至少保持在 **6.0 LTS** 以上。MongoDB 的版本策略为每年一个大版本，odd-numbered 版本（如 7.x）为快速迭代版，even-numbered 版本（如 6.x、8.x）更适合长期运行。

## 生产架构

### 副本集（Replica Set）

副本集是 MongoDB 高可用的基础单元，生产环境最低要求三节点。

```
         ┌─────────────────────────────────────────┐
         │           Client (Driver)                │
         │    读偏好: primary / secondaryPreferred  │
         └──────────────┬──────────────────────────┘
                        │
          ┌─────────────┼─────────────────┐
          v             v                 v
┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│   Primary    │ │  Secondary   │ │  Secondary   │
│   PORT:27017 │ │  PORT:27017  │ │  PORT:27017  │
│   读写       │ │  只读        │ │  只读 / 仲裁 │
└──────┬───────┘ └──────┬───────┘ └──────┬───────┘
       │                │                │
       │  Oplog (local.oplog.rs)         │
       └───────► 尾拉同步 ◄──────────────┘
                心跳检测 2s 间隔
```

**Oplog 同步机制**：Primary 将所有写操作记录到 `local.oplog.rs` 固定集合（Capped Collection），Secondary 通过不断尾拉（tailable cursor）Oplog 重放操作实现数据同步。当 Secondary 落后太多导致 Oplog 被覆盖时，需要触发全量重同步（Initial Sync）。

关键配置参数：

```yaml
# mongod.conf
replication:
  oplogSizeMB: 4096          # Oplog 大小，默认磁盘 5%，最小 990MB
  enableMajorityReadConcern: true  # 多数派读关心，推荐开启

# 写关注
# w: "majority"  — 确保数据写入多数节点后才返回确认
# j: true        — 确保数据已刷盘到 journal
```

### 分片集群（Sharded Cluster）

当单机容量或吞吐无法满足需求时，通过分片实现水平扩展。

```
┌─────────────────────────────────────────────────────────────┐
│                        Client                               │
└──────────────────────────┬──────────────────────────────────┘
                           │
               ┌───────────┼───────────┐
               v           v           v
        ┌──────────┐ ┌──────────┐ ┌──────────┐
        │ mongos-1 │ │ mongos-2 │ │ mongos-3 │
        │  路由进程 │ │  路由进程 │ │  路由进程 │
        └─────┬────┘ └─────┬────┘ └─────┬────┘
              │             │             │
              └──────┬──────┴─────────────┘
                     │
         ┌───────────┼────────────┐
         v                         v
┌──────────────────┐    ┌──────────────────┐
│  Config Server   │    │  Config Server   │
│  (3-node RS)     │    │  (元数据: 分片映射│
│  元数据管理       │    │   chunk 信息)    │
└──────────────────┘    └──────────────────┘
         │
    ┌────┼────────────────┐
    v    v                v
┌────────┐  ┌────────┐  ┌────────┐
│Shard 1 │  │Shard 2 │  │Shard 3 │
│ (RS)   │  │ (RS)   │  │ (RS)   │
│P + S×2 │  │P + S×2 │  │P + S×2 │
└────────┘  └────────┘  └────────┘
```

### 分片键选择原则

分片键直接决定数据分布和查询性能，一旦选定不可更改（6.0+ 支持在线 Resharding，但代价高昂）。

| 原则 | 说明 | 反面案例 |
|------|------|----------|
| **高基数** | 分片键取值范围要足够大，避免数据堆积在少量 chunk | 使用布尔值作为分片键 |
| **低频率** | 单个值不应出现过于频繁，否则形成 jumbo chunk | 用 `userId` 分片但存在大量游客账号 |
| **非单调递增** | 避免 ObjectId、时间戳等递增值导致的热点写入 | 用 `_id` (ObjectId) 做范围分片 |
| **查询隔离** | 常用查询应能命中单个分片，减少分散查询（scatter-gather） | 查询条件不包含分片键 |

推荐的分片键模式：**复合分片键**，如 `{ customerId: 1, createdAt: 1 }`，既能保证查询隔离，又能均匀分布数据。

## 核心维护操作

### Oplog 管理

**调整 Oplog 大小**（5.0+ 支持在线调整，无需停机）：

```bash
# 查看当前 Oplog 大小
use local
db.oplog.rs.stats().maxSize

# 在线扩容（在 Primary 上执行，单位 MB）
db.adminCommand({
  replSetResizeOplog: 1,
  size: 8192    # 扩到 8GB
})

# 缩容需要先设置为较小值，然后执行压缩
db.adminCommand({ compact: "oplog.rs" })
```

**踩坑：大批量数据迁移时 Oplog 被覆盖**。当批量导入或批量更新数据量极大时，Oplog 增长速度快于 Secondary 同步速度，导致 Oplog 空间被覆盖，Secondary 进入 RECOVERING 状态需要全量重同步。

应对措施：
- 迁移前评估 Oplog 增长量，适当扩容（建议预留 3 倍余量）
- 分批次执行写操作，每批之间留出同步间隔
- 监控 `replicationLag`，确保 Secondary 延迟在可控范围

### 索引管理

```bash
# 后台创建索引（4.2+ 默认使用优化的索引构建，不再阻塞数据库）
db.collection.createIndex(
  { userId: 1, createdAt: -1 },
  { background: true, name: "idx_user_created" }
)

# 查看索引构建进度
db.currentOp({
  $or: [
    { op: "command", "command.createIndexes": { $exists: true } },
    { op: "none", ns: /collection/ }
  ]
})

# 检测未使用索引（运行一段时间后）
db.collection.aggregate([
  { $indexStats: {} },
  { $match: { "accesses.ops": 0 } }
])
```

**索引维护建议**：定期审查 `$indexStats`，删除访问次数为零的索引。每个冗余索引都会增加写操作开销和存储空间。TTL 索引适合自动清理过期数据（如日志、会话）。

### 数据平衡（Balancer）

分片集群的 Balancer 负责在分片间迁移 chunk 以保持数据均匀分布。

```bash
# 查看 Balancer 状态
sh.getBalancerState()

# 查看正在进行的迁移
sh.isBalancerRunning()

# 在业务低峰期手动开启 Balancer
sh.startBalancer()

# 在业务高峰期暂停 Balancer
sh.stopBalancer()

# 设置 Balancer 活动窗口
sh.setBalancerState(true)
db.settings.update(
  { _id: "balancer" },
  { $set: { activeWindow: { start: "02:00", stop: "06:00" } } },
  { upsert: true }
)
```

**Jumbo Chunk 处理**：当 chunk 超过默认 64MB 且无法被分割时，会标记为 jumbo，不再参与自动平衡。

```bash
# 确认 jumbo chunk
use config
db.chunks.find({ jumbo: true })

# 手动分裂 jumbo chunk（找到可分割的点）
sh.splitAt("mydb.mycoll", { shardKey: "splitPointValue" })

# 清除 jumbo 标记（4.4+ 自动处理，旧版本需手动）
db.chunks.update(
  { _id: "chunkId", jumbo: true },
  { $unset: { jumbo: "" } }
)
```

### 存储引擎 WiredTiger 调优

WiredTiger 是 MongoDB 默认存储引擎，以下为关键调优参数：

```yaml
storage:
  wiredTiger:
    engineConfig:
      cacheSizeGB: 8            # 缓存大小，建议物理内存的 50%-60%
                                # 留余量给 OS 文件缓存和连接开销
      journalCompressor: snappy  # journal 压缩：snappy/zlib/zstd/none
    collectionConfig:
      blockCompressor: snappy   # 集合数据压缩
    indexConfig:
      prefixCompression: true   # 索引前缀压缩，减少索引内存占用
```

**调优要点**：

- **Cache Size**：不要设置为 100% 内存。MongoDB 依赖 OS 文件缓存读取未在 WT Cache 中的数据，建议留 40%-50% 给操作系统
- **压缩算法选择**：`snappy` 压缩/解压快、CPU 开销低，适合通用场景；`zstd` 压缩率高但 CPU 开销更大，适合冷数据或存储敏感场景
- **检查点（Checkpoint）**：默认每 60s 或 journal 数据达到 2GB 时触发。高频写入场景可适当缩短间隔以减少恢复时间

```bash
# 查看 WiredTiger 缓存命中率
db.serverStatus().wiredTiger.cache
# 重点关注：
#   "bytes currently in the cache" — 当前缓存使用量
#   "pages evicted by application threads" — 应用线程触发驱逐（过高说明缓存不足）
#   "pages read into cache" — 磁盘读入次数（过高说明缓存命中率低）
```

## 备份策略

| 方案 | 适用场景 | 优点 | 缺点 |
|------|----------|------|------|
| **mongodump + oplog** | 小型副本集、单次迁移 | 简单、可跨版本 | 大数据量慢、不保证一致性快照 |
| **文件系统快照** | 中大型集群、云环境 | 快速、一致性 | 需要文件系统支持（LVM、EBS） |
| **Percona Backup for MongoDB (PBM)** | 分片集群、持续备份 | 支持分片一致性、增量备份、S3 存储 | 需要额外部署组件 |
| **MongoDB Cloud Manager / Ops Manager** | 企业环境 | 全自动、支持 Point-in-Time Recovery | 商业收费 |

### mongodump + oplog 备份恢复

```bash
# 备份（带 oplog，用于增量恢复到任意时间点）
mongodump \
  --host "rs0/primary:27017,secondary1:27017,secondary2:27017" \
  --readPreference "secondary" \
  --oplog \
  --gzip \
  --out /backup/mongodb/$(date +%Y%m%d)

# 恢复（应用 oplog 到指定时间戳）
mongorestore \
  --host "rs0/primary:27017" \
  --oplogReplay \
  --oplogLimit "1686634587:1" \   # 恢复到此时间戳之前
  --gzip \
  /backup/mongodb/20260613
```

### 文件系统快照备份

```bash
# 前提：journal 与数据在同一卷上，或使用 --journalCommitIntervalMs 确保一致性

# 1. 锁定从节点（可选，确保一致性）
rs.secondaryOk()
db.fsyncLock()

# 2. 创建 LVM 快照
lvcreate -L 50G -s -n mongo_snap_20260613 /dev/vg0/mongodb

# 3. 解锁
db.fsyncUnlock()

# 4. 挂载并备份快照
mount /dev/vg0/mongo_snap_20260613 /mnt/snap
tar czf /backup/mongo_20260613.tar.gz -C /mnt/snap data/

# 5. 清理快照
umount /mnt/snap
lvremove /dev/vg0/mongo_snap_20260613
```

### Percona Backup for MongoDB (PBM)

PBM 是生产环境推荐方案，特别适合分片集群的一致性备份：

```bash
# 安装 PBM Agent（每个 mongod 节点）
pbm-agent --mongodb-uri "mongodb://localhost:27017/?replicaSet=rs0"

# 配置 S3 存储
pbm config --set storage.type=s3 \
  --set storage.s3.endpointUrl="https://s3.amazonaws.com" \
  --set storage.s3.bucket="mongodb-backup" \
  --set storage.s3.prefix="pbm"

# 执行全量备份
pbm backup

# 查看备份列表
pbm list

# PITR 增量恢复（恢复到指定时间点）
pbm restore --time "2026-06-13T14:30:00Z"
```

## 常见问题排查

### Secondary 陷入 RECOVERING

**现象**：Secondary 状态变为 `RECOVERING`，无法同步数据。通常由 Oplog 被覆盖引起。

**排查与修复**：

```bash
# 1. 确认副本集状态
rs.status()
# 关注各个成员的 stateStr、optimeDate、lagTime

# 2. 检查 Oplog 窗口
use local
db.oplog.rs.find().sort({ $natural: 1 }).limit(1)   # 最早记录
db.oplog.rs.find().sort({ $natural: -1 }).limit(1)  # 最新记录
# 两者时间差即为 Oplog 时间窗口

# 3. 全量重同步（在故障节点执行）
# 方法一：清除数据目录，自动触发 Initial Sync
systemctl stop mongod
rm -rf /data/mongodb/*    # 清除数据目录
systemctl start mongod
# Secondary 会自动从 Primary 拉取全量数据

# 方法二：使用指定节点同步（减少 Primary 压力）
# 在 mongod.conf 中配置
# replication:
#   initialSyncSourceReadPreference: "secondary"
```

### 慢查询分析

```bash
# 开启慢查询记录（阈值 100ms）
db.setProfilingLevel(1, { slowms: 100 })

# 查看慢查询
db.system.profile.find().sort({ ts: -1 }).limit(10).pretty()

# 分析特定查询的执行计划
db.collection.explain("executionStats").find({
  userId: "12345",
  status: "active"
}).sort({ createdAt: -1 }).limit(20)

# 实时查看正在执行的操作
db.currentOp({
  active: true,
  secs_running: { $gte: 5 }   # 运行超过 5 秒
})

# 终止长时间运行的查询
db.killOp(opId)
```

**常见优化方向**：检查 `explain()` 输出中的 `totalDocsExamined` 与 `nReturned` 的比值，理想情况为 1:1。比值过高说明索引未覆盖查询条件，需要添加合适的复合索引或使用 covered query。

### Chunk 迁移导致性能下降

**现象**：分片集群在 Balancer 活跃期间出现延迟飙升。

```bash
# 查看当前迁移任务
use config
db.migrations.find()

# 检查 Balancer 是否在运行
sh.isBalancerRunning()

# 临时停止 Balancer
sh.stopBalancer()

# 调整迁移参数（减少并发、降低速率）
sh.setBalancerState(true)
db.settings.update(
  { _id: "balancer" },
  {
    $set: {
      "chunkMigrationConcurrency": 2,         # 降低并发迁移数
      "maxChunkSizeBytes": NumberLong(67108864) # 64MB，默认值
    }
  }
)

# 查看 chunk 分布是否均匀
sh.status()
```

**建议**：将 Balancer 运行窗口设置在业务低峰期，并确保分片键选择合理以减少不必要的 chunk 迁移。

### 连接数耗尽

```bash
# 查看当前连接数
db.serverStatus().connections
# { "current" : 950, "available" : 50, "totalCreated" : 12000 }

# 查看连接来源分布
db.currentOp(true).inprog.reduce(
  (acc, op) => {
    let host = op.client || "internal";
    acc[host] = (acc[host] || 0) + 1;
    return acc;
  }, {}
)

# 调整最大连接数（mongod.conf）
net:
  maxIncomingConnections: 65536

# 推荐使用连接池（应用侧配置示例，Node.js）
const client = new MongoClient(uri, {
  maxPoolSize: 100,        // 连接池大小
  minPoolSize: 10,         // 最小保持连接数
  maxIdleTimeMS: 30000,    // 空闲超时
  waitQueueTimeoutMS: 5000 // 获取连接超时
});
```

**生产建议**：不应单纯增大连接数上限，应配合连接池使用。每个连接约占用 1MB 内存，2 万连接将消耗约 20GB 内存。推荐在应用侧引入 `mongos` 路由层做连接收敛。

## MongoDB on Kubernetes

使用 MongoDB Operator 部署生产级副本集或分片集群。

### MongoDB Operator 部署要点

```bash
# 安装 MongoDB Community Operator
kubectl apply -f https://raw.githubusercontent.com/mongodb/mongodb-kubernetes-operator/master/config/crd/bases/mongodbcommunity.mongodb.com_mongodbcommunity.yaml
kubectl apply -k github.com/mongodb/mongodb-kubernetes-operator/config/default?ref=master

# 或使用 MongoDB Enterprise Operator（支持 Ops Manager 集成）
# helm repo add mongodb https://mongodb.github.io/helm-charts
# helm install enterprise-operator mongodb/enterprise-operator
```

副本集 CR 示例：

```yaml
apiVersion: mongodbcommunity.mongodb.com/v1
kind: MongoDBCommunity
metadata:
  name: mongo-rs
  namespace: database
spec:
  members: 3
  type: ReplicaSet
  version: "8.0.4"
  security:
    authentication:
      modes: ["SCRAM"]
  users:
    - name: admin
      db: admin
      passwordSecretRef:
        name: mongo-admin-secret
      roles:
        - name: clusterAdmin
          db: admin
        - name: userAdminAnyDatabase
          db: admin
      scramCredentialsSecretName: mongo-admin-scram
  additionalMongodConfig:
    storage.wiredTiger.engineConfig.cacheSizeGB: 4
    storage.wiredTiger.engineConfig.journalCompressor: snappy
  resources:
    requests:
      cpu: "2"
      memory: "8Gi"
    limits:
      cpu: "4"
      memory: "12Gi"
  volumeClaimTemplate:
    spec:
      storageClassName: ssd
      accessModes: ["ReadWriteOnce"]
      resources:
        requests:
          storage: 100Gi
```

**K8s 部署注意事项**：

- **反亲和性**：确保副本集成员分布在不同节点，避免单节点故障导致丢多数派
- **PodDisruptionBudget**：设置 `maxUnavailable: 1`，防止节点维护时同时驱逐多个成员
- **存储**：使用本地 SSD（Local PV）而非网络存储，避免 IOPS 成为瓶颈
- **资源限制**：WiredTiger Cache 大小应小于 container memory limit 的 50%
- **备份**：配合 PBM 或使用 Velero + 快照实现自动化备份
- **Secret 管理**：证书和密码使用 K8s Secret 或外部 Secret Manager（如 Vault）管理

```yaml
# 反亲和性配置示例
affinity:
  podAntiAffinity:
    requiredDuringSchedulingIgnoredDuringExecution:
      - labelSelector:
          matchLabels:
            app: mongo-rs
        topologyKey: "kubernetes.io/hostname"
```

## 监控指标

| 指标 | 采集方式 | 告警阈值 | 说明 |
|------|----------|----------|------|
| `connections.current` | `serverStatus` | > 80% max | 连接数使用率 |
| `opcounters.insert/query/update/delete` | `serverStatus` | 趋势异常 | 操作计数器，监控 QPS |
| `opLatencies.latencies` | `serverStatus` | P99 > 200ms | 操作延迟分布 |
| `wiredTiger.cache.bytesCurrentlyInCache` | `serverStatus` | > 85% cacheSize | 缓存使用率 |
| `wiredTiger.cache.pagesReadIntoCache` | `serverStatus` | 持续增长 | 磁盘读取频率，反映缓存命中率 |
| `replicationLag` | `rs.status()` | > 10s | Secondary 同步延迟 |
| `replication.oplog.window` | `local.oplog.rs` | < 1h | Oplog 可用时间窗口 |
| `metrics.cursor.open.total` | `serverStatus` | > 1000 | 打开游标数，泄漏风险 |
| `dbStats.dataSize / fileSizeSize` | `db.stats()` | 磁盘 > 80% | 存储使用率 |
| `asserts.regular / warning` | `serverStatus` | > 0 持续出现 | 内部断言错误，需排查 |
| `globalLock.currentQueue.total` | `serverStatus` | > 100 | 等待锁的请求数 |
| `balancer.migrations` | `sh.status()` | 低峰期频繁 | 分片迁移活跃度 |

**监控工具选型**：

- **MongoDB Cloud Manager / Ops Manager**：官方方案，功能最全面
- **Prometheus + Grafana**：使用 `mongodb_exporter` 采集指标，社区 Dashboard 丰富
- **Percona PMM**：集成 MongoDB 监控，开箱即用

## 总结

MongoDB 的生产运维核心在于以下几点：

**架构层面**：理解副本集和分片集群的工作原理，合理选择分片键，确保数据均匀分布和高可用。

**日常维护**：Oplog 大小预留充足、定期审查索引使用情况、控制 Balancer 运行窗口、根据负载调优 WiredTiger 参数。

**故障预防**：建立完善的备份体系（PBM + 快照双重保障），设置合理的监控告警，定期演练故障恢复流程。

**容器化部署**：K8s 环境下注意反亲和性、PDB、本地存储和资源限制，使用 Operator 简化生命周期管理。

运维没有银弹，关键是建立对系统行为的深入理解，结合监控数据和实际负载持续调优。
