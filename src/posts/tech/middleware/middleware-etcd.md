---
title: etcd 生产运维与故障排查
icon: cubes
date: 2026-06-13
category:
  - 技术
tag:
  - etcd
  - Kubernetes
  - 分布式存储
  - 运维
---

# etcd 生产运维与故障排查

etcd 是 Kubernetes 控制平面的核心组件，所有集群状态（Pod、Service、ConfigMap 等）都存储在 etcd 中。etcd 出问题，整个 K8s 集群不可用。本文基于生产环境真实故障案例，梳理 etcd 的架构、日常维护和故障排查。

<!-- more -->

## etcd 架构

### 核心概念

| 概念 | 说明 |
|------|------|
| **Member** | etcd 集群的一个节点 |
| **Leader** | 通过 Raft 协议选举的领导节点，处理所有写请求 |
| **Follower** | 接收 Leader 的日志复制，可处理读请求 |
| **Learner** | v3.4+ 新角色，加入集群时不参与选举，先同步数据 |
| **Revision** | 全局单调递增的版本号，每次写操作 +1 |
| **Compaction** | 压缩历史修订版本，释放空间 |
| **Defragmentation** | 对 BoltDB 做碎片整理，回收磁盘空间 |

### 推荐部署

```
生产集群：3 或 5 节点（奇数，Raft 多数派仲裁）

┌─ etcd-1 (Leader) ──┐
│  10.0.0.1:2379      │
│  写 + 读             │
└────────┬─────────────┘
         │ Raft 日志复制
   ┌─────┴──────┐
┌─ etcd-2 ─────┐ ┌─ etcd-3 ─────┐
│ 10.0.0.2:2379│ │ 10.0.0.3:2379│
│  读 + 日志复制│ │  读 + 日志复制│
└───────────────┘ └───────────────┘
```

**关键要求：**

- **磁盘**：必须 SSD，延迟 < 10ms（etcd 对磁盘 IO 极度敏感）
- **网络**：节点间延迟 < 10ms，建议同可用区部署
- **内存**：建议 8GB+，etcd 数据集全量加载在内存
- **CPU**：2 核即可，etcd 非 CPU 密集型

## 日常维护操作

### 1. 集群健康检查

```bash
# 查看成员列表
etcdctl member list -w table

# 查看端点状态
etcdctl endpoint status -w table

# 输出示例：
# ENDPOINT          DB SIZE  IS LEADER  RAFT TERM  RAFT INDEX
# 10.0.0.1:2379     85 MB    true      12         3456789
# 10.0.0.2:2379     85 MB    false     12         3456789
# 10.0.0.3:2379     85 MB    false     12         3456789

# 查看集群健康
etcdctl endpoint health -w table

# 查看告警（重要！）
etcdctl alarm list
# 如果输出 "alarm:NOSPACE" → 数据库已满，需要紧急处理
```

### 2. Compaction（压缩历史版本）

etcd 默认保留所有历史修订版本。每次 `kubectl get pod` 都会产生一个 revision，长期运行后数据库会不断膨胀。

```bash
# 查看当前 revision
etcdctl endpoint status -w json | jq '.[0].Status.header.revision'

# 压缩到当前 revision（保留当前版本，删除历史）
REVISION=$(etcdctl endpoint status -w json | jq '.[0].Status.header.revision')
etcdctl compact "$REVISION"

# 压缩后，旧的 revision 无法再查询
# etcdctl get "" --rev=100  ← 如果 100 已被压缩，会报错
```

**压缩频率：**

- 太频繁（< 5 分钟）：影响写入性能
- 太稀疏（> 24 小时）：数据库膨胀
- **推荐每 5 分钟自动压缩一次**（Kubernetes 默认就是 5 分钟）

```bash
# 在 etcd 启动参数中配置自动压缩
--auto-compaction-retention=5m    # 每 5 分钟压缩一次
--auto-compaction-mode=periodic   # 周期模式
```

### 3. Defragmentation（碎片整理）

**Compaction 只是标记删除历史数据，不会自动回收磁盘空间。** 需要 Defrag 才能真正释放空间。

```bash
# ⚠️ 重要：必须逐个节点执行，不能同时对 Leader 做

# 先对 Follower 做
etcdctl defrag --endpoints=10.0.0.2:2379
etcdctl defrag --endpoints=10.0.0.3:2379

# 最后对 Leader 做
etcdctl defrag --endpoints=10.0.0.1:2379

# 也可以用 --cluster 模式（自动逐个执行）
etcdctl defrag --cluster
```

**为什么必须逐个做？** Defrag 期间 etcd 进程会暂停服务（BoltDB 需要 stop-the-world 整理），如果 Leader 长时间无响应，Follower 会认为 Leader 挂了，触发重新选举。

**真实踩坑：** 运维在 Leader 上执行 `etcdctl defrag`，etcd 暂停 15 秒，超过 `election-timeout`（默认 1000ms），集群重新选举，期间 Kubernetes API Server 无法写入，所有 kubectl 命令超时，持续约 30 秒。

```bash
# 自动碎片整理配置（etcd 3.5+）
--auto-compaction-retention=5m
--snapshot-count=100000
# 定期通过 cron 在低峰期执行 defrag
```

### 4. 空间配额管理

```bash
# 默认配额 2GB，生产建议调大到 8GB
--quota-backend-bytes=8589934592   # 8GB

# 查看当前使用
etcdctl endpoint status -w json | jq '.[].Status.db_size'
```

**配额满了的后果：** etcd 进入 NOSPACE 告警状态，所有写操作被拒绝，Kubernetes 无法创建/更新任何资源。

### 5. 备份

```bash
# 手动备份
etcdctl snapshot save /backup/etcd-$(date +%Y%m%d-%H%M%S).db \
  --cacert=/etc/kubernetes/pki/etcd/ca.crt \
  --cert=/etc/kubernetes/pki/etcd/peer.crt \
  --key=/etc/kubernetes/pki/etcd/peer.key

# 验证备份
etcdctl snapshot status /backup/etcd-backup.db -w table

# 通过 CronJob 自动备份（推荐）
# 每小时备份一次，保留 7 天
```

## 常见故障排查

### 故障 1：mvcc: database space exceeded

**这是 etcd 最常见也是最严重的生产故障。**

**现象：**

```
etcdserver: mvcc: database space exceeded
```

- Kubernetes API Server 报 500 错误
- `kubectl get pods` 超时
- `etcdctl alarm list` 显示 `NOSPACE`

**紧急恢复步骤：**

```bash
# 1. 查看当前数据库大小
etcdctl endpoint status -w table

# 2. 执行压缩
REVISION=$(etcdctl endpoint status -w json | jq '.[0].Status.header.revision')
etcdctl compact "$REVISION"

# 3. 逐节点碎片整理（先 Follower 后 Leader）
etcdctl defrag --endpoints=10.0.0.2:2379
etcdctl defrag --endpoints=10.0.0.3:2379
etcdctl defrag --endpoints=10.0.0.1:2379

# 4. 解除告警
etcdctl alarm disarm

# 5. 验证
etcdctl endpoint status -w table
etcdctl alarm list   # 应为空
```

**预防措施：**

- 确保 `--auto-compaction-retention` 已配置
- 监控 `etcd_mvcc_db_total_size_in_bytes` 指标
- 设置告警：使用量 > 配额的 70% 就告警

### 故障 2：Leader 频繁切换

**现象：** etcd 日志中大量 `etcdserver: leader changed` 记录

**排查：**

```bash
# 查看 Raft 指标
etcdctl endpoint status -w json | jq '.[].Status.raft'

# 查看是否有慢磁盘
iostat -x 1 10 /dev/sda

# 查看 GC 日志（如果 JVM 相关操作引起停顿）
# 检查 etcd 进程的资源使用
top -p $(pgrep etcd)
```

**常见原因：**

| 原因 | 排查 | 解决 |
|------|------|------|
| 磁盘 IO 慢 | `iostat -x`，await > 10ms | 使用 SSD、独立磁盘 |
| 网络延迟 | `ping` 节点间延迟 | 同可用区部署、检查网络 |
| etcd 和其他进程争资源 | `top` 查看 CPU/内存 | etcd 独占节点运行 |
| 请求量过大 | `etcdctl check perf` | 优化客户端请求频率 |
| election-timeout 太短 | 默认 1000ms | 调大到 5000ms |

### 故障 3：Member 无法加入集群

**现象：** 新 Member 启动后一直同步，无法成为 Follower

```bash
# 添加新 Member
etcdctl member add etcd-4 --peer-urls=http://10.0.0.4:2380

# 在新节点启动 etcd（注意 initial-cluster-state=existing）
etcd --name etcd-4 \
  --initial-cluster "etcd-1=http://10.0.0.1:2380,etcd-2=http://10.0.0.2:2380,etcd-3=http://10.0.0.3:2380,etcd-4=http://10.0.0.4:2380" \
  --initial-cluster-state existing \
  --listen-client-urls http://10.0.0.4:2379 \
  --listen-peer-urls http://10.0.0.4:2380
```

**常见原因：**

- 新 Member 数据目录非空（删除后重试）
- 网络不通（Peer URL 端口 2380 被防火墙拦截）
- 数据量太大，全量同步超时（使用 Learner 模式逐步同步）

```bash
# 使用 Learner 模式添加（etcd 3.4+）
# Learner 不参与选举，先同步数据再提升为 Follower
etcdctl member add etcd-4 --peer-urls=http://10.0.0.4:2380 --learner=true

# 同步完成后提升
etcdctl member promote <member-id>
```

### 故障 4：K8s etcd 对象过多

```bash
# 查看 etcd 中各类型对象数量
etcdctl get / --prefix --keys-only | \
  awk -F'/' '{print $2}' | sort | uniq -c | sort -rn

# 查看总对象数
etcdctl get / --prefix --keys-only | wc -l
```

**常见元凶：**

- Event 对象过多（默认保留 1 小时）
- 已删除的 namespace 残留 Finalizer
- CRD 资源泄漏

```bash
# 清理 Event（超过 1 小时的）
kubectl get events --all-namespaces -o json | \
  jq -r '.items[] | select(.lastTimestamp < (now - 3600 | strftime("%Y-%m-%dT%H:%M:%SZ"))) | .metadata.name'

# 检查 namespace 卡在 Terminating
kubectl get ns | grep Terminating

# 强制清理 Finalizer
kubectl patch ns <stuck-ns> -p '{"metadata":{"finalizers":[]}}' --type=merge
```

## etcd 高可用与 Raft 共识

### Raft 共识协议

etcd 使用 Raft 协议保证分布式一致性，所有写请求必须经过 Leader：

```
Raft 角色与转换：

  ┌─────────────┐   超时未收到心跳    ┌─────────────┐
  │  Follower   │ ─────────────────→ │  Candidate  │
  │  接收日志    │                    │  发起选举    │
  │  响应心跳    │ ←───────────────── │  请求投票    │
  └─────────────┘   发现更高 Term     └──────┬──────┘
       ↑                                     │
       │                     获得多数派投票    │
       │         ┌───────────────────────────┘
       │         ▼
       │    ┌─────────────┐
       └────│   Leader    │
            │  处理写请求  │
            │  日志复制    │
            │  发送心跳    │
            └─────────────┘
```

### Leader 选举流程

```
Leader 故障时的选举过程（通常 1-5 秒）：

  ┌──────────────────────────────┐
  │ 1. Follower 心跳超时          │
  │    election-timeout 到期      │
  │    （默认 1000ms，推荐 5000ms）│
  └──────────────┬───────────────┘
                 ▼
  ┌──────────────────────────────┐
  │ 2. Follower → Candidate      │
  │    自增 Term                  │
  │    投自己一票                 │
  │    向其他节点请求投票（RV）    │
  └──────────────┬───────────────┘
                 ▼
  ┌──────────────────────────────────────┐
  │ 3. 其他节点收到 RequestVote          │
  │    检查条件：                        │
  │    - Term 是否更新？                │
  │    - 候选者日志是否比自己新？        │
  │    - 本 Term 是否已投过票？          │
  │    条件满足 → 投票给候选者           │
  └──────────────┬───────────────────────┘
                 ▼
  ┌──────────────────────────────┐
  │ 4. 获得多数派票 (N/2+1)      │
  │    Candidate → Leader        │
  │    开始发送心跳               │
  │    开始接受写请求             │
  │    其余节点回到 Follower      │
  └──────────────────────────────┘

etcd 3 节点集群：需 2 票胜出
etcd 5 节点集群：需 3 票胜出
可容忍 (N-1)/2 个节点故障
```

### 写请求处理流程

```
客户端写请求通过 Leader 处理：

  Client ──── PUT key=value ────→ Leader
                                     │
                                 1. 写入本地 WAL 日志
                                 2. 日志标记为 committed（待确认）
                                     │
                              ┌──────┼──────┐
                              ▼      ▼      ▼
                         Follower Follower Follower
                         写WAL    写WAL    写WAL
                         确认     确认     确认
                              │      │      │
                              └──────┼──────┘
                                     │
                                 3. 收到多数派确认
                                    (含自身 = 2/3)
                                 4. 标记日志 committed
                                 5. 应用到状态机（BoltDB）
                                 6. 返回成功给客户端

关键保证：
- 所有已提交的日志不会丢失
- 所有节点最终应用相同的日志序列
- 线性一致性读（ReadIndex 机制）
```

### Learner 模式（安全扩容）

```
新增节点使用 Learner 模式（etcd 3.4+）：

  ┌─ etcd-1 (Leader) ──┐
  │  正常服务           │
  └────────┬────────────┘
  ┌─ etcd-2 (Follower) ─┐ ┌─ etcd-3 (Follower) ─┐
  └──────────────────────┘ └──────────────────────┘
           ┌─ etcd-4 (Learner) ──────────┐
           │  不参与选举，不投票           │
           │  只同步 Leader 数据          │
           │  追上后再 promote 为 Follower │
           └──────────────────────────────┘

优势：
- 不影响集群仲裁（3 节点集群仍只需 2 票）
- 新节点先全量同步再加入，避免拖慢集群
- 数据追上后通过 member promote 提升为投票成员
```

### Kubernetes etcd 高可用最佳实践

```
推荐架构：3 或 5 节点，独立部署（不与 K8s Worker 共存）

┌─ etcd-1 (10.0.1.1) ────┐
│  AZ-a, SSD, 独占机器    │
└────────┬────────────────┘
┌─ etcd-2 (10.0.2.1) ────┐
│  AZ-b, SSD, 独占机器    │
└────────┬────────────────┘
┌─ etcd-3 (10.0.3.1) ────┐
│  AZ-c, SSD, 独占机器    │
└─────────────────────────┘

关键参数：
--election-timeout=5000           # 选举超时（推荐 5000ms）
--heartbeat-interval=100          # 心跳间隔（推荐 100ms）
--quota-backend-bytes=8589934592  # 8GB 配额
--auto-compaction-retention=5m    # 自动压缩
--snapshot-count=100000           # 快照频率

监控指标：
- etcd_server_has_leader（必须有）
- etcd_server_leader_changes_seen_total（频繁变更告警）
- etcd_disk_wal_fsync_duration_seconds（磁盘延迟 < 10ms）
- etcd_mvcc_db_total_size_in_bytes（空间使用 < 70%）
```

## 性能调优

```bash
# etcd 性能测试
etcdctl check perf --load="s"   # 小规模测试
etcdctl check perf --load="m"   # 中规模测试
etcdctl check perf --load="l"   # 大规模测试

# 关键启动参数
--heartbeat-interval=100         # 心跳间隔（默认 100ms）
--election-timeout=5000          # 选举超时（默认 1000ms，建议 5000ms）
--snapshot-count=100000          # 快照阈值（写多少条日志做一次快照）
--max-request-bytes=10485760     # 单个请求最大 10MB（默认 1.5MB 可能不够）
--max-txn-ops=128                # 事务最大操作数
```

**Kubernetes 特殊调优：**

```bash
# API Server 与 etcd 的连接
--etcd-servers-overrides=/events#https://etcd-events:2379  # Event 单独存储
--etcd-prefix=/registry          # K8s 数据前缀
```

## 监控告警

```yaml
groups:
  - name: etcd-alerts
    rules:
      # 数据库空间 > 70%
      - alert: EtcdDatabaseSpaceLow
        expr: etcd_mvcc_db_total_size_in_bytes / (8 * 1024 * 1024 * 1024) > 0.7
        for: 5m
        labels:
          severity: warning

      # 数据库空间 > 90%
      - alert: EtcdDatabaseSpaceCritical
        expr: etcd_mvcc_db_total_size_in_bytes / (8 * 1024 * 1024 * 1024) > 0.9
        for: 2m
        labels:
          severity: critical

      # 无 Leader
      - alert: EtcdNoLeader
        expr: etcd_server_has_leader == 0
        for: 1m
        labels:
          severity: critical

      # Leader 变更频繁
      - alert: EtcdLeaderChanges
        expr: increase(etcd_server_leader_changes_seen_total[1h]) > 3
        labels:
          severity: warning

      # 磁盘 WAL 写入延迟
      - alert: EtcdDiskSlow
        expr: histogram_quantile(0.99, etcd_disk_wal_fsync_duration_seconds_bucket) > 0.01
        for: 5m
        labels:
          severity: warning
```

## 总结

etcd 运维的核心原则：

1. **SSD 是必须的**：etcd 对磁盘延迟极其敏感
2. **自动 Compaction + 定期 Defrag**：防止数据库空间耗尽
3. **逐节点操作**：Defrag/升级必须逐个 Follower 先做，最后做 Leader
4. **监控配额使用率**：超过 70% 就告警，不要等到 100%
5. **定期备份**：每小时备份，异地保存
6. **独立部署**：etcd 不要和 K8s Worker 共享节点

**参考资源：**

- [etcd 官方运维文档](https://etcd.io/docs/v3.5/op-guide/maintenance/)
- [etcd 故障排查 — CNCF Blog](https://www.cncf.io/blog/2026/03/12/making-etcd-incidents-easier-to-debug-in-production-kubernetes/)
- [EKS etcd 碎片整理 — AWS](https://aws.amazon.com/blogs/containers/explore-etcd-defragmentation-in-amazon-eks/)
- [etcd 维护笔记 — Gojek Engineering](https://medium.com/gojekengineering/a-few-notes-on-etcd-maintenance-c06440011cbe)
