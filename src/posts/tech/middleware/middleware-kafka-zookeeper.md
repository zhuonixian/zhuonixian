---
title: Kafka 生产运维与 ZooKeeper 迁移实践
icon: arrows-spin
date: 2026-06-13
category:
  - 技术
tag:
  - Kafka
  - ZooKeeper
  - KRaft
  - 消息队列
  - 运维
---

# Kafka 生产运维与 ZooKeeper 迁移实践

Apache Kafka 是分布式流处理平台的事实标准。Kafka 4.0（2025 年 3 月发布）彻底移除了 ZooKeeper 依赖，全面转向 KRaft 模式。本文涵盖 Kafka 生产运维核心操作、ZooKeeper 运维要点，以及从 ZooKeeper 到 KRaft 的迁移实战。

<!-- more -->

## Kafka 架构

### KRaft 模式架构（Kafka 4.0+）

```
┌─ KRaft Controller ──────────────────┐
│  基于 Raft 协议的元数据管理           │
│  替代 ZooKeeper，内置在 Kafka 中     │
│  3 节点仲裁（推荐奇数）               │
└────────────┬────────────────────────┘
             │
┌─ Broker 1 ──────┐ ┌─ Broker 2 ──────┐ ┌─ Broker N ──────┐
│  Topic Partitions │ │  Topic Partitions │ │  Topic Partitions │
│  数据读写         │ │  数据读写         │ │  数据读写         │
└──────────────────┘ └──────────────────┘ └──────────────────┘
```

### 核心概念

| 概念 | 说明 |
|------|------|
| **Broker** | Kafka 服务实例，负责消息存储和转发 |
| **Topic** | 消息的逻辑分类 |
| **Partition** | Topic 的物理分片，是并行度的基本单位 |
| **Consumer Group** | 消费者组，组内消费者分摊 Partition |
| **Offset** | 消息在 Partition 中的位置，消费进度的标记 |
| **Replica** | 每个 Partition 有多个副本（Leader + Follower） |

### 版本演进

| 版本 | 发布时间 | 关键变化 |
|------|----------|----------|
| **4.0** | 2025-03 | **完全移除 ZooKeeper**，KRaft 唯一模式 |
| **3.9** | 2024-10 | KRaft 模式默认，ZooKeeper 标记废弃 |
| **3.7** | 2024-02 | KRaft 模式可用于生产 |
| **3.3** | 2022-10 | KRaft 模式早期可用 |

## Kafka 运维操作

### Topic 管理

```bash
# 创建 Topic
kafka-topics.sh --create \
  --bootstrap-server broker1:9092 \
  --topic orders \
  --partitions 12 \
  --replication-factor 3 \
  --config retention.ms=604800000 \     # 7天保留
  --config segment.bytes=1073741824 \   # 1GB segment
  --config cleanup.policy=delete        # 过期删除

# 查看 Topic 列表
kafka-topics.sh --list --bootstrap-server broker1:9092

# 查看 Topic 详情
kafka-topics.sh --describe \
  --bootstrap-server broker1:9092 \
  --topic orders

# 增加 Partition（只能增不能减）
kafka-topics.sh --alter \
  --bootstrap-server broker1:9092 \
  --topic orders \
  --partitions 24
```

**注意：Partition 数量只能增加不能减少。** 设置前要规划好，建议按预估吞吐量 × 2 设置。

### 消费者组管理

```bash
# 查看所有消费者组
kafka-consumer-groups.sh --list --bootstrap-server broker1:9092

# 查看消费者组详情（Lag 是关键指标）
kafka-consumer-groups.sh --describe \
  --bootstrap-server broker1:9092 \
  --group order-service

# 输出示例：
# TOPIC   PARTITION  CURRENT-OFFSET  LOG-END-OFFSET  LAG
# orders  0          12345           12500           155
# orders  1          11800           11800           0

# 重置消费者组 Offset（慎用）
kafka-consumer-groups.sh --reset-offsets \
  --bootstrap-server broker1:9092 \
  --group order-service \
  --topic orders \
  --to-earliest \    # 从头开始消费
  --execute

# 删除消费者组
kafka-consumer-groups.sh --delete \
  --bootstrap-server broker1:9092 \
  --group old-service
```

### 配置优化

```properties
# server.properties — 生产环境关键配置

# Broker 基础
broker.id=1
listeners=PLAINTEXT://0.0.0.0:9092
advertised.listeners=PLAINTEXT://broker1:9092
num.network.threads=8
num.io.threads=16

# 存储
log.dirs=/data/kafka/logs1,/data/kafka/logs2
num.partitions=6                    # 默认分区数
default.replication.factor=3       # 默认副本数
min.insync.replicas=2              # 最小同步副本（配合 acks=all）

# 保留策略
log.retention.hours=168            # 7天
log.retention.bytes=107374182400   # 100GB per partition
log.segment.bytes=1073741824       # 1GB per segment

# 性能
log.flush.interval.messages=10000
log.flush.interval.ms=1000
num.recovery.threads.per.data.dir=4

# KRaft 模式（Kafka 4.0+）
node.id=1
process.roles=broker,controller
controller.quorum.voters=1@broker1:9093,2@broker2:9093,3@broker3:9093
```

### 生产者关键配置

```properties
acks=all                    # 所有 ISR 副本确认后才返回成功
retries=3                   # 重试次数
retry.backoff.ms=100        # 重试间隔
max.in.flight.requests.per.connection=5
enable.idempotence=true     # 幂等生产（防止重复）
compression.type=lz4        # 压缩（lz4 平衡速度和压缩率）
batch.size=16384            # 批量发送大小
linger.ms=5                 # 等待时间（增加吞吐量）
```

### 消费者关键配置

```properties
group.id=order-service
auto.offset.reset=earliest      # 无 offset 时从头消费
enable.auto.commit=false        # 手动提交（推荐）
max.poll.records=500            # 单次拉取最大消息数
max.poll.interval.ms=300000     # 两次 poll 最大间隔（5分钟）
session.timeout.ms=30000        # 会话超时（30秒）
heartbeat.interval.ms=10000     # 心跳间隔
```

## Kafka 高可用与集群部署

### 分区副本与 ISR 机制

Kafka 高可用的核心是分区副本（Replica）机制：

```
Topic: orders, Partitions: 3, Replication Factor: 3

Partition 0:
┌─ Broker 1 (Leader) ─────┐
│  读写请求                 │
│  ISR 成员                 │
└──────────┬───────────────┘
     ┌─────┴──────┐
┌─ Broker 2 ──┐ ┌─ Broker 3 ──┐
│ Follower     │ │ Follower     │
│ ISR（同步中）│ │ ISR（同步中）│
│ 拉取 Leader  │ │ 拉取 Leader  │
│ 数据         │ │ 数据         │
└──────────────┘ └──────────────┘

ISR（In-Sync Replicas）：与 Leader 保持同步的副本集合
- Follower 定期从 Leader 拉取数据
- 落后太多的 Follower 被踢出 ISR
- 只有 ISR 成员可以被选举为新 Leader
- 配合 acks=all 确保数据不丢失
```

### Partition Leader 选举流程

```
Broker 1（Leader of Partition 0）宕机：

  ┌───────────────────────────┐
  │ 1. Controller 检测到       │
  │    Broker 1 心跳超时       │
  │    （session.timeout.ms）  │
  └──────────────┬────────────┘
                 ▼
  ┌───────────────────────────┐
  │ 2. Controller 找到        │
  │    Partition 0 的 ISR 列表 │
  │    [Broker 2, Broker 3]   │
  └──────────────┬────────────┘
                 ▼
  ┌───────────────────────────┐
  │ 3. 从 ISR 中选择第一个     │
  │    存活的副本作为新 Leader │
  │    → 选择 Broker 2        │
  └──────────────┬────────────┘
                 ▼
  ┌───────────────────────────┐
  │ 4. 更新元数据             │
  │    Leader = Broker 2      │
  │    通知所有 Broker         │
  │    客户端刷新元数据        │
  └───────────────────────────┘

特殊情况：
- ISR 为空且 unclean.leader.election.enable=false
  → Partition 不可用（等待原 Leader 恢复）
- ISR 为空且 unclean.leader.election.enable=true
  → 允许非 ISR 副本成为 Leader（可能丢数据，不推荐）
```

### KRaft Controller 高可用

```
Kafka 4.0+ 的 KRaft Controller Quorum（替代 ZooKeeper）：

┌─ Controller 1 (Leader) ────────┐
│  管理集群元数据                  │
│  处理 Partition Leader 选举     │
│  基于 Raft 协议                 │
└───────────┬────────────────────┘
            │ Raft 日志复制
      ┌─────┴──────────┐
┌─ Controller 2 ──┐ ┌─ Controller 3 ──┐
│ Follower        │ │ Follower        │
│ 投票 + 元数据同步│ │ 投票 + 元数据同步│
└─────────────────┘ └─────────────────┘

KRaft 优势：
- 无需维护 ZooKeeper（减少一套系统）
- Controller 可水平扩展
- 元数据变更更快（直接 Raft 复制）
- 故障恢复更快（无 ZK 依赖）
```

### Consumer Group Rebalance

```
消费者组 Rebalance 流程（Consumer 加入或离开时）：

  ┌──────────────────────────┐
  │ 1. 触发 Rebalance        │
  │    - 新 Consumer 加入     │
  │    - Consumer 心跳超时    │
  │    - 订阅 Topic 变化      │
  └──────────────┬───────────┘
                 ▼
  ┌──────────────────────────────────┐
  │ 2. 选举 Group Leader             │
  │    第一个加入组的 Consumer        │
  └──────────────┬───────────────────┘
                 ▼
  ┌──────────────────────────────────┐
  │ 3. 分配 Partition                │
  │    Group Leader 执行分配策略：    │
  │    - RangeAssignor（默认）        │
  │    - RoundRobinAssignor          │
  │    - StickyAssignor（推荐）       │
  └──────────────┬───────────────────┘
                 ▼
  ┌──────────────────────────────────┐
  │ 4. 通知所有 Consumer             │
  │    各 Consumer 开始消费新分配     │
  │    的 Partition                  │
  └──────────────────────────────────┘

Rebalance 期间所有 Consumer 暂停消费（Stop-The-World）
避免频繁 Rebalance：
- 调大 session.timeout.ms 和 max.poll.interval.ms
- 减少 max.poll.records
- 使用 StickyAssignor 减少分区移动
```

### 生产环境推荐配置

```
# 高可用关键配置
min.insync.replicas=2           # 最少同步副本数
default.replication.factor=3    # 默认副本数
unclean.leader.election.enable=false  # 禁止非 ISR 选举

# Producer 端
acks=all                        # 所有 ISR 确认
enable.idempotence=true         # 幂等
retries=3                       # 重试

# Consumer 端
max.poll.interval.ms=300000     # 防止 Rebalance
session.timeout.ms=30000
heartbeat.interval.ms=10000

# 集群规模建议
- < 1TB/天：3 Broker
- 1-10TB/天：5-7 Broker
- > 10TB/天：10+ Broker，按吞吐量线性扩展
```

## 常见问题排查

### 问题 1：消费者 Lag 持续增长

**现象：** `LOG-END-OFFSET` 远大于 `CURRENT-OFFSET`，消费跟不上生产

```bash
# 查看 Lag 详情
kafka-consumer-groups.sh --describe \
  --bootstrap-server broker1:9092 \
  --group order-service

# 查看 Broker 是否有压力
# JMX 指标：kafka.server:type=BrokerTopicMetrics,name=BytesInPerSec
```

**常见原因与解决：**

| 原因 | 排查 | 解决 |
|------|------|------|
| 消费逻辑慢 | 看消费端日志/监控 | 优化消费逻辑、增加消费者实例 |
| Partition 太少 | 消费者数 > Partition 数无意义 | 增加 Partition |
| 消费者频繁 Rebalance | `max.poll.interval.ms` 太短 | 增大超时、减少单次处理量 |
| Broker 磁盘 IO 高 | iostat 查看 | 增加 Broker、使用 SSD |

**真实踩坑：** 消费者 `max.poll.interval.ms=300000`（5 分钟），但单条消息处理涉及远程 API 调用，偶尔超过 5 分钟，触发 Rebalance。所有消费者重新分配 Partition，期间消费暂停。调整为 `max.poll.interval.ms=600000` 并减少 `max.poll.records=100`。

### 问题 2：Broker 宕机后 ISR 缩小

**现象：** `kafka-topics.sh --describe` 显示 `Replicas: 1,2,3  ISR: 1,2`，Broker 3 掉了

```bash
# 查看 Broker 状态
kafka-broker-api-versions.sh --bootstrap-server broker3:9092

# 检查 Controller 日志
# KRaft: kafka/logs/controller.log
# ZooKeeper: kafka/logs/controller.log
```

**恢复步骤：**

1. 如果 Broker 3 是临时故障，重启后自动追上 ISR
2. 如果 Broker 3 无法恢复：

```bash
# 重新分配 Partition 到新 Broker
kafka-reassign-partitions.sh --generate \
  --bootstrap-server broker1:9092 \
  --topics-to-move-json-file topics.json \
  --broker-list "1,2,4"    # 排除 Broker 3，加入 Broker 4

# 执行迁移
kafka-reassign-partitions.sh --execute \
  --bootstrap-server broker1:9092 \
  --reassignment-json-file reassign.json

# 查看进度
kafka-reassign-partitions.sh --verify \
  --bootstrap-server broker1:9092 \
  --reassignment-json-file reassign.json
```

### 问题 3：磁盘空间不足

```bash
# 查看 Topic 占用空间
kafka-log-dirs.sh --describe \
  --bootstrap-server broker1:9092 \
  --topic-list orders

# 紧急清理：调整保留时间
kafka-configs.sh --alter \
  --bootstrap-server broker1:9092 \
  --topic orders \
  --add-config retention.ms=86400000   # 缩短到 1 天

# 手动删除 segment（不建议，优先调整 retention）
```

## ZooKeeper 运维（旧集群维护）

虽然 Kafka 4.0 已移除 ZooKeeper，但许多生产环境仍在运行 3.x 版本。以下是 ZooKeeper 的关键运维点。

### 架构

```
┌─ ZK1 (Leader) ──┐
│  读写处理         │
└───────┬──────────┘
        │
┌─ ZK2 (Follower) ─┐ ┌─ ZK3 (Follower) ─┐
│  只读 + 转发写请求 │ │  只读 + 转发写请求 │
│  Leader 选举投票   │ │  Leader 选举投票   │
└───────────────────┘ └───────────────────┘

奇数节点（3 或 5），多数派仲裁
```

### 关键运维命令

```bash
# 四字命令（Four Letter Words）
echo ruok | nc zk1 2181     # imok → 服务正常
echo stat | nc zk1 2181     # 详细状态
echo mntr | nc zk1 2181     # 监控指标
echo cons | nc zk1 2181     # 连接信息
echo dump | nc zk1 2181     # 会话和临时节点

# Kafka 在 ZK 中的数据路径
/kafka/brokers/ids          # Broker 注册
/kafka/brokers/topics       # Topic 元数据
/kafka/controller           # Controller 信息
/kafka/consumers            # 旧版消费者信息
```

### 常见问题

#### ZK 日志/快照膨胀

```bash
# zoo.cfg 配置
autopurge.snapRetainCount=5     # 保留 5 个快照
autopurge.purgeInterval=1       # 每小时清理一次

# 手动清理
java -cp zookeeper.jar:lib/* org.apache.zookeeper.server.PurgeTxnLog \
  -n 5 /var/lib/zookeeper/data /var/lib/zookeeper/log
```

#### ZK Leader 切换频繁

**现象：** 日志中大量 `Leader election` 记录，Kafka Controller 频繁变更

**常见原因：**

- GC 停顿过长（ZK 对 GC 敏感）
- 网络抖动
- 磁盘 IO 高（ZK 写事务日志是同步操作）

**解决：**

```bash
# 优化 ZK JVM
ZK_SERVER_HEAP="-Xms2g -Xmx2g"
ZK_SERVER_GC_OPTS="-XX:+UseG1GC -XX:MaxGCPauseMillis=200"

# 使用独立磁盘存放事务日志
dataDir=/disk1/zookeeper/data
dataLogDir=/disk2/zookeeper/log   # 事务日志放在独立磁盘
```

## 从 ZooKeeper 迁移到 KRaft

### 迁移前评估

| 条件 | 要求 |
|------|------|
| Kafka 版本 | 3.6+ 支持迁移，4.0+ 必须迁移 |
| 集群规模 | 任何规模，但大集群建议分批 |
| 停机时间 | 可在线迁移，不停机 |
| 回滚 | 迁移过程中可以回滚，完成后不可回滚 |

### 迁移步骤

```
阶段 1：准备
├── 升级 Kafka 到 3.6+（所有 Broker）
├── 验证集群健康（无离线 Partition、ISR 完整）
└── 备份 ZK 数据

阶段 2：启动 KRaft Controller
├── 部署 3 个 KRaft Controller 节点
├── 配置 migration.enabled=true
└── Controller 从 ZK 同步元数据

阶段 3：Broker 迁移
├── 逐个 Broker 切换到 KRaft 模式
├── 重启后 Broker 连接 KRaft Controller
└── 观察是否正常工作

阶段 4：完成迁移
├── 所有 Broker 迁移完成
├── 关闭 ZK Ensemble
└── 清理 ZK 依赖配置
```

```properties
# Broker 迁移配置变更
# 原来（ZooKeeper 模式）：
zookeeper.connect=zk1:2181,zk2:2181,zk3:2181

# 迁移后（KRaft 模式）：
controller.quorum.voters=1@ctrl1:9093,2@ctrl2:9093,3@ctrl3:9093
# 删除 zookeeper.connect
```

**迁移注意事项：**

- 迁移期间不要做 Partition 重分配
- 每个 Broker 迁移后观察 30 分钟再继续下一个
- 保留 ZK 数据直到全部迁移完成并稳定运行一周
- 监控 `kafka.controller:type=KafkaController,name=ActiveControllerCount` 确保始终有活跃 Controller

## 监控指标

| 类别 | 关键指标 | 告警阈值 |
|------|----------|----------|
| **Lag** | 消费者组 Lag | > 100000 或持续增长 |
| **吞吐** | BytesIn/Out Per Sec | 根据容量规划 |
| **延迟** | Produce/Consume Latency P99 | > 100ms |
| **ISR** | UnderReplicatedPartitions | > 0 |
| **离线** | OfflinePartitionsCount | > 0（严重） |
| **请求** | RequestQueueSize | 持续 > 100 |
| **磁盘** | LogSizePerDisk | > 85% |
| **ZK/KRaft** | Controller 活跃状态 | 无活跃 Controller |

## 总结

| 维度 | ZooKeeper 模式 | KRaft 模式（Kafka 4.0+） |
|------|----------------|--------------------------|
| 元数据存储 | 外部 ZK Ensemble | 内置 Raft 协议 |
| 运维复杂度 | 维护两套系统（Kafka + ZK） | 只维护 Kafka |
| 扩展性 | ZK 是瓶颈 | Controller 可水平扩展 |
| 部署 | ZK 3-5 节点 + Kafka Broker | Controller + Broker（可合并） |
| 迁移建议 | — | 尽快迁移，Kafka 4.0 已不支持 ZK |

**参考资源：**

- [Kafka 4.0 Release — Confluent](https://www.confluent.io/blog/latest-apache-kafka-release/)
- [Kafka KRaft 迁移指南](https://byteiota.com/kafka-4-zookeeper-kraft-migration-guide-2/)
- [Kafka 官方文档](https://kafka.apache.org/documentation/)
- [ZooKeeper 运维指南](https://zookeeper.apache.org/doc/current/zookeeperAdmin.html)
