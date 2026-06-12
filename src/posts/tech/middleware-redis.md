---
title: Redis 生产运维与问题排查
icon: bolt
date: 2026-06-13
category:
  - 技术
tag:
  - Redis
  - 缓存
  - 运维
  - 问题排查
---

# Redis 生产运维与问题排查

Redis 是目前最流行的内存数据库，广泛用于缓存、会话管理、消息队列、排行榜等场景。然而在生产环境中，Redis 的内存管理、持久化、集群稳定性都有不少坑。本文基于 19 次线上 Redis 告警的实战经验，系统梳理运维要点。

<!-- more -->

## 版本与架构

### 版本现状

| 版本 | 发布时间 | 关键特性 |
|------|----------|----------|
| **8.0** | 2025 | 多线程 I/O 增强、函数特性改进 |
| **7.4** | 2024 | Clients Cache、更好的内存效率 |
| **7.2** | 2023 | ACL v2、Function 替代 Lua 脚本 |

### 部署架构选择

| 架构 | 适用场景 | 优缺点 |
|------|----------|--------|
| **单机** | 开发/测试、小规模缓存 | 简单，无高可用 |
| **主从 + Sentinel** | 中等规模、读多写少 | 自动故障切换，手动扩缩容 |
| **Cluster** | 大规模、高并发 | 自动分片、水平扩展，运维复杂 |

```
Redis Cluster（推荐生产架构）：

┌─ Master 1 ─┐  ┌─ Master 2 ─┐  ┌─ Master 3 ─┐
│ Slot 0-5460 │  │ Slot 5461-  │  │ Slot 10923- │
│             │  │ 10922       │  │ 16383       │
└──────┬──────┘  └──────┬──────┘  └──────┬──────┘
       │                │                │
┌─ Slave 1 ──┐  ┌─ Slave 2 ──┐  ┌─ Slave 3 ──┐
│ 复制 Master1│  │ 复制 Master2│  │ 复制 Master3│
└─────────────┘  └─────────────┘  └─────────────┘
```

## 内存管理

### 内存限制与淘汰策略

```bash
# redis.conf — 必须设置最大内存
maxmemory 4gb

# 淘汰策略（根据业务选择）
maxmemory-policy allkeys-lru    # 通用缓存：LRU 淘汰所有 key
# maxmemory-policy volatile-lru  # 只淘汰有 TTL 的 key
# maxmemory-policy allkeys-lfu   # LFU（最近最少频率使用）
# maxmemory-policy noeviction    # 不淘汰，写满报错（适合队列场景）
```

**策略选择指南：**

| 场景 | 推荐策略 | 理由 |
|------|----------|------|
| 纯缓存 | `allkeys-lru` | 缓存 miss 可接受，自动淘汰旧数据 |
| 缓存 + 热点数据 | `allkeys-lfu` | LFU 更好地保留热点 key |
| 会话存储 | `volatile-lru` | 只淘汰过期的会话 |
| 消息队列 | `noeviction` | 数据不能丢失 |

### 内存碎片

```bash
# 查看内存使用详情
INFO memory

# 关键指标：
# used_memory:      Redis 分配的总内存
# used_memory_rss:  操作系统实际分配的内存（含碎片）
# mem_fragmentation_ratio: rss / used_memory

# 碎片率解读：
# < 1.0   → Redis 使用了 swap，性能严重下降
# 1.0-1.5 → 正常
# > 1.5   → 碎片较多，需要关注
# > 2.0   → 严重碎片，需要处理
```

**处理碎片：**

```bash
# Redis 4.0+ 自动碎片整理
activedefrag yes

# 手动触发（会短暂阻塞）
MEMORY PURGE
```

### 大 Key 问题

**真实踩坑：** 一个 Hash 类型 key 存了 500 万条用户数据，`HGETALL` 命令执行 8 秒，期间阻塞整个 Redis 实例，导致所有请求超时。

```bash
# 扫描大 Key
redis-cli --bigkeys -i 0.1

# 查看指定 Key 的大小
MEMORY USAGE user:session:hash
HLEN user:session:hash
SCARD large:set:key
LLEN large:list:key
```

**解决方案：**

```bash
# 大 Hash 拆分为小 Hash
# 原来：user:all -> 500万字段
# 改为：user:{userId%1000} -> 5000字段/个

# 无阻塞删除大 Key（Redis 4.0+）
UNLINK large:key       # 替代 DEL，异步删除
```

### 无 TTL 的 Key

**真实踩坑：** 缓存 key 未设置 TTL，积压 6 个月后内存使用率从 30% 涨到 95%，触发淘汰策略开始删除有效数据。

```bash
# 扫描没有 TTL 的 key
redis-cli --scan --pattern "cache:*" | while read key; do
  ttl=$(redis-cli TTL "$key")
  if [ "$ttl" -eq -1 ]; then
    echo "$key (no TTL)"
  fi
done

# 批量设置 TTL
redis-cli --scan --pattern "cache:*" | while read key; do
  redis-cli EXPIRE "$key" 86400
done
```

**规则：** 所有缓存 key 必须设置 TTL，业务 key 的 TTL 不超过 7 天。

## 持久化

### RDB vs AOF

| 维度 | RDB（快照） | AOF（追加日志） |
|------|-------------|-----------------|
| 数据安全 | 可能丢失最近几分钟数据 | 最多丢失 1 秒 |
| 文件大小 | 紧凑（二进制压缩） | 较大（可重写压缩） |
| 恢复速度 | 快 | 慢 |
| 性能影响 | fork() 可能导致延迟 | 写入开销 |
| 适用场景 | 备份、灾备 | 数据安全优先 |

### 生产配置建议

```bash
# 同时开启 RDB + AOF（推荐）
save 900 1           # 900秒内有1次变更就快照
save 300 10          # 300秒内有10次变更
save 60 10000        # 60秒内有10000次变更

appendonly yes
appendfsync everysec  # 每秒刷盘（性能和安全平衡）
# appendfsync always  # 每次写入刷盘（最安全但最慢）
# appendfsync no      # 由 OS 决定（最快但最不安全）

# AOF 重写配置
auto-aof-rewrite-percentage 100
auto-aof-rewrite-min-size 64mb
```

**真实踩坑：** RDB save 触发时，Redis fork() 子进程做快照。如果 Redis 使用了 10GB 内存，fork 需要复制页表，在内存碎片率高时 fork 耗时可达数秒，期间 Redis 无法处理请求。

解决方案：

```bash
# 关闭自动 save，改为定时手动 bgsave
# save ""   # 注释掉所有 save

# 使用 cron 在低峰期触发
# crontab: 0 3 * * * redis-cli BGSAVE
```

## 集群运维

### Cluster 健康检查

```bash
# 查看集群状态
redis-cli cluster info
# cluster_state:ok          ← 必须是 ok
# cluster_slots_ok:16384    ← 所有槽位分配完成

# 查看节点分布
redis-cli cluster nodes

# 查看各节点内存
redis-cli -h node1 INFO memory | grep used_memory_human
redis-cli -h node2 INFO memory | grep used_memory_human

# 检查迁移中的 slot
redis-cli cluster slots
```

### 扩容与缩容

```bash
# 添加新节点
redis-cli --cluster add-node new-node:6379 existing-node:6379

# 迁移 slot 到新节点
redis-cli --cluster reshard existing-node:6379
# 输入要迁移的 slot 数量和目标节点

# 添加从节点
redis-cli --cluster add-node --cluster-slave \
  new-slave:6379 existing-master:6379
```

### Slot 迁移问题

**真实踩坑：** Slot 迁移过程中，如果有大批量 pipeline 写入目标 slot，`ASK` 重定向会导致客户端报 `MOVED` 错误。

```bash
# 查看迁移状态
redis-cli --cluster check node:6379

# 如果迁移卡住，手动完成
redis-cli cluster setslot <slot> NODE <target-node-id>
```

## 哨兵（Sentinel）运维

```bash
# 查看 Sentinel 状态
redis-cli -p 26379 SENTINEL master mymaster
redis-cli -p 26379 SENTINEL replicas mymaster
redis-cli -p 26379 SENTINEL sentinels mymaster

# 手动故障切换（维护窗口用）
redis-cli -p 26379 SENTINEL failover mymaster

# Sentinel 配置
sentinel monitor mymaster 10.0.0.1 6379 2     # 2 个 Sentinel 同意才切换
sentinel down-after-milliseconds mymaster 30000 # 30秒无响应判定主观下线
sentinel failover-timeout mymaster 180000       # 切换超时
sentinel parallel-syncs mymaster 1              # 切换后同时同步的从节点数
```

## 常见问题排查

### 问题 1：Redis 响应变慢

```bash
# 1. 查看慢日志
redis-cli SLOWLOG GET 20

# 2. 查看延迟
redis-cli --latency -h <host>
redis-cli --latency-history -h <host>  # 每秒采样

# 3. 检查是否在 fork/持久化
redis-cli INFO stats | grep rdb_last_bgsave_status
redis-cli INFO stats | grep aof_last_bgrewrite_status

# 4. 查看连接数
redis-cli INFO clients
# connected_clients: 1500
# blocked_clients: 0
```

**常见慢的原因：**

| 原因 | 排查方法 | 解决 |
|------|----------|------|
| 大 Key 操作 | `redis-cli --bigkeys` | 拆分或异步删除 |
| 持久化 fork | `INFO Persistence` | 控制内存使用、调整 save 策略 |
| 网络延迟 | `--latency` | 检查网络、同机房部署 |
| 内存不足 swap | `INFO memory` 看 `mem_fragmentation_ratio < 1` | 增加 maxmemory 或扩容 |
| 阻塞命令 | `SLOWLOG` | 避免 KEYS *、HGETALL 大 Hash |

### 问题 2：内存使用持续增长

```bash
# 1. 查看哪些 key 占空间大
redis-cli --memkeys      # Redis 7.4+

# 2. 分析 key 分布
redis-cli --scan --pattern "*" | head -100

# 3. 检查是否有未设置 TTL 的 key
# （见上文"无 TTL 的 Key"）
```

### 问题 3：主从同步断开

```bash
# 在主库查看复制状态
redis-cli INFO replication

# 关键指标：
# connected_slaves: 2
# slave0: ip=10.0.0.2,port=6379,state=online,offset=12345678,lag=0
# repl_backlog_size: 1048576

# 如果 lag 持续增大：
# 1. 检查从库网络
# 2. 增大 repl-backlog-size
# 3. 检查从库是否在做 AOF 重写
```

## 监控告警配置

```yaml
# 关键告警规则
groups:
  - name: redis-alerts
    rules:
      # 内存使用率 > 80%
      - alert: RedisMemoryHigh
        expr: redis_memory_used_bytes / redis_memory_max_bytes > 0.8
        for: 5m
        labels:
          severity: warning

      # 内存使用率 > 95%
      - alert: RedisMemoryCritical
        expr: redis_memory_used_bytes / redis_memory_max_bytes > 0.95
        for: 2m
        labels:
          severity: critical

      # 连接数 > maxclients 的 80%
      - alert: RedisConnectionsHigh
        expr: redis_connected_clients > redis_config_maxclients * 0.8
        for: 5m
        labels:
          severity: warning

      # 复制延迟 > 60 秒
      - alert: RedisReplicationLag
        expr: redis_replication_offset_diff_seconds > 60
        for: 5m
        labels:
          severity: warning

      # 实例宕机
      - alert: RedisDown
        expr: redis_up == 0
        for: 1m
        labels:
          severity: critical
```

## Redis on Kubernetes 注意事项

```yaml
# StatefulSet 部署 Redis Cluster
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: redis-cluster
spec:
  replicas: 6  # 3 master + 3 slave
  template:
    spec:
      containers:
        - name: redis
          resources:
            requests:
              cpu: "1"
              memory: "4Gi"
            limits:
              cpu: "2"
              memory: "4Gi"   # 内存 limit = maxmemory
          volumeMounts:
            - name: data
              mountPath: /data
  volumeClaimTemplates:
    - metadata:
        name: data
      spec:
        accessModes: ["ReadWriteOnce"]
        resources:
          requests:
            storage: 20Gi
```

关键注意：

- **必须使用 StatefulSet**（不能 Deployment），保证稳定网络标识
- **PDB（Pod Disruption Budget）** 保证一次只驱逐一个 Pod
- **内存 limit 等于 maxmemory**，避免 OOM Kill 后数据丢失
- **优先用本地 SSD**，避免网络存储 IO 延迟

## 总结

Redis 生产运维的核心原则：

1. **必须设 maxmemory**：不设等于允许 Redis 吃光系统内存
2. **所有缓存 key 必须设 TTL**：防止内存泄漏式增长
3. **监控碎片率**：大于 2.0 需要处理
4. **避免大 Key**：单个 value 控制在 10KB 以内
5. **持久化选型**：RDB + AOF 同时开启，数据安全有保障
6. **Cluster 扩容提前规划**：slot 迁移在低峰期执行

**参考资源：**

- [Redis 官方文档](https://redis.io/docs/)
- [Redis 集群规范](https://redis.io/docs/latest/operate/oss_and_stack/reference/cluster-spec/)
- [Redis 生产踩坑实录](https://blog.stackademic.com/the-brutal-reality-of-running-redis-in-production-in-2026-19-on-call-pages-later-heres-1495b105a670)
- [K8s 上部署 Redis Cluster](https://www.plural.sh/blog/redis-cluster-on-kubernetes/)
