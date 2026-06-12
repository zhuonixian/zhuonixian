---
title: VictoriaMetrics 生产实践
icon: gear
date: 2026-06-13
category:
  - 技术
tag:
  - VictoriaMetrics
  - 生产运维
  - 性能调优
  - 多租户
  - 监控
---

## 生产集群部署

在正式环境中，推荐使用 VictoriaMetrics 集群版（vmcluster）而非单机版。集群版各组件可独立扩缩容，适合大规模指标采集场景。

### 推荐拓扑

一个中等规模（1000 万活跃时间序列）的生产部署推荐拓扑如下：

- 3 x vmagent（采集层）
- 3 x vminsert（写入层）
- 3 x vmstorage（存储层，建议至少 100GB SSD 每节点）
- 2 x vmselect（查询层）
- 2 x vmalert（告警层）

```
                    +-------------------+
                    |   Load Balancer   |
                    | (Nginx / HAProxy) |
                    +--------+----------+
                             |
              +--------------+--------------+
              |                             |
     +--------v--------+          +--------v--------+
     |    vmagent x3   |          |    vmauth       |
     |  (采集 + 远程写)  |          |  (认证 + 路由)   |
     +--------+--------+          +--------+--------+
              |                             |
     +--------v--------+          +--------v--------+
     |  vminsert x3    |          |  vmselect x2    |
     |  (AZ-a, AZ-b,   |          |  (无状态,可扩)    |
     |   AZ-c)         |          +--------+--------+
     +--------+--------+                   |
              |                            |
     +--------v----------------------------v---+
     |           vmstorage x3                  |
     |  +----------+ +----------+ +----------+ |
     |  | node-1   | | node-2   | | node-3   | |
     |  | AZ-a     | | AZ-b     | | AZ-c     | |
     |  | 100GB SSD| | 100GB SSD| | 100GB SSD| |
     |  +----------+ +----------+ +----------+ |
     +-----------------------------------------+
              |
     +--------v--------+
     |  vmalert x2     |
     |  (告警 + 路由到   |
     |   Alertmanager)  |
     +-----------------+
```

跨可用区部署时，vmstorage 节点分布在不同 AZ，通过 `-replicationFactor=2` 实现数据冗余。任意一个 AZ 故障不影响写入和查询。

### Kubernetes 部署

推荐使用 VictoriaMetrics Operator 管理 Kubernetes 中的集群。Operator 会自动处理 Pod 调度、存储挂载和配置更新。

```yaml
# Helm values - values-prod.yaml
cluster:
  enabled: true

vmstorage:
  replicaCount: 3
  resources:
    requests:
      cpu: "4"
      memory: "16Gi"
    limits:
      cpu: "8"
      memory: "32Gi"
  persistence:
    enabled: true
    size: 200Gi
    storageClassName: ssd-replicaset
  affinity:
    podAntiAffinity:
      requiredDuringSchedulingIgnoredDuringExecution:
        - labelSelector:
            matchExpressions:
              - key: app.kubernetes.io/component
                operator: In
                values:
                  - vmstorage
          topologyKey: topology.kubernetes.io/zone
  vmbackup:
    enabled: true
    destination: "s3://vm-backups/vmstorage"
    schedule: "0 */6 * * *"

vminsert:
  replicaCount: 3
  resources:
    requests:
      cpu: "2"
      memory: "4Gi"
    limits:
      cpu: "4"
      memory: "8Gi"

vmselect:
  replicaCount: 2
  resources:
    requests:
      cpu: "2"
      memory: "8Gi"
    limits:
      cpu: "4"
      memory: "16Gi"
  cacheMountPath: "/cache"
  persistence:
    enabled: true
    size: 20Gi

vmagent:
  replicaCount: 3
  resources:
    requests:
      cpu: "1"
      memory: "2Gi"
    limits:
      cpu: "2"
      memory: "4Gi"

vmalert:
  replicaCount: 2
  resources:
    requests:
      cpu: "500m"
      memory: "1Gi"
    limits:
      cpu: "1"
      memory: "2Gi"
```

安装命令：

```bash
helm repo add vm https://victoriametrics.github.io/helm-charts/
helm repo update
helm install vm-cluster vm/victoria-metrics-cluster \
  -n monitoring \
  --create-namespace \
  -f values-prod.yaml
```

## 多租户架构

VictoriaMetrics 集群版原生支持多租户，通过 accountID（租户 ID）实现数据隔离。不同租户的数据写入和查询完全隔离，互不影响。

### 账号 ID 隔离

租户标识通过 URL 路径中的 accountID 传递：

- 写入：`http://vminsert:8480/insert/<accountID>/prometheus/api/v1/write`
- 查询：`http://vmselect:8481/select/<accountID>/prometheus/api/v1/query`

accountID 为 0 到 2^32 之间的正整数。每个 accountID 对应一个独立的租户命名空间，数据存储在独立的目录中。

### vminsert 多租户路由

vminsert 接收带 accountID 的写入请求后，将数据路由到对应 vmstorage 分片。所有组件无需额外配置即可支持多租户。

vmagent 采集时通过 `-remoteWrite.url` 指定带租户 ID 的地址：

```yaml
# vmagent 远程写入多租户配置
remoteWrite:
  - url: "http://vminsert:8480/insert/1/prometheus/api/v1/write"
    labels:
      tenant: "team-a"
  - url: "http://vminsert:8480/insert/2/prometheus/api/v1/write"
    labels:
      tenant: "team-b"
```

### vmselect 多租户查询

查询时在 URL 中指定 accountID 即可。跨租户查询需要使用特殊的 ` tenants` 参数（以逗号分隔多个 accountID），但通常建议通过 vmauth 统一控制。

### vmauth 认证与授权

vmauth 是 VictoriaMetrics 的认证网关，根据认证信息将请求路由到对应租户。它支持基于 Token 的认证和路由规则配置。

vmauth 配置示例（`vmauth.yml`）：

```yaml
users:
  - username: "team-a"
    password: "secret-token-a"
    url_prefix:
      - "http://vminsert:8480/insert/1/"
      - "http://vmselect:8481/select/1/"
    max_concurrent_requests: 100
    labels:
      team: "a"

  - username: "team-b"
    password: "secret-token-b"
    url_prefix:
      - "http://vminsert:8480/insert/2/"
      - "http://vmselect:8481/select/2/"
    max_concurrent_requests: 50
    labels:
      team: "b"

  - username: "admin"
    password: "admin-super-secret"
    url_prefix:
      - "http://vminsert:8480/insert/"
      - "http://vmselect:8481/select/"
    tenants: ["0", "1", "2"]
```

### 租户资源配额

通过 vminsert 和 vmselect 的启动参数限制租户资源使用：

- `-maxLabelsPerSeries`：限制每个 series 的标签数（默认 30）
- `-maxLabelNamesPerSeries`：限制每个 series 的标签名数
- `-tenant.cacheSize`：限制每个租户的缓存大小

vmauth 层面可限制并发请求数（`max_concurrent_requests`）和请求速率。对于更细粒度的限速，可以在前面的负载均衡器（如 Nginx）中配置 rate limiting。

## 高可用与故障恢复

VictoriaMetrics 集群版通过组件冗余和数据复制实现高可用。

### vmstorage 多副本

vmstorage 是有状态组件，通过 `-replicationFactor` 参数实现数据复制。当设置为 2 时，每个数据点写入到 2 个 vmstorage 节点。任一节点故障，数据不丢失。

```
          vmstorage-1      vmstorage-2      vmstorage-3
          (AZ-a)           (AZ-b)           (AZ-c)
               +---------------+---------------+
               |                               |
     vminsert  |  写入 RF=2:                   |
     ------+-->|  shard + replica              |
           |   |  node-1 + node-2 (primary)    |
           +-->|  node-2 + node-3 (secondary)  |
               |                               |
               +---------------+---------------+
                               |
     vmselect                  |  查询时自动合并
     ----------->+-------------+
                 | 任意存活节点可响应
                 +-------------+
```

### vmselect / vminsert 水平扩展

vmselect 和 vminsert 都是无状态的，可以直接通过增加副本数来扩展容量。vmselect 支持查询结果的缓存共享（通过挂载共享存储或启用 `-search.cachePath`）。

### vmagent 双写采集高可用

为保证采集链路高可用，部署多个 vmagent 实例同时采集相同 targets。VictoriaMetrics 会自动去重（通过 `-dedup.minScrapeInterval` 参数）：

```yaml
# vmagent 双写配置
remoteWrite:
  - url: "http://vminsert-1:8480/insert/1/prometheus/api/v1/write"
  - url: "http://vminsert-2:8480/insert/1/prometheus/api/v1/write"

# vmselect 去重参数
# -dedup.minScrapeInterval=30s
```

### 数据备份与恢复

vmbackup 支持增量备份到 S3 兼容的对象存储：

```bash
# 增量备份
vmbackup \
  -storageDataPath=/vm-data \
  -snapshotCreateInterval=1h \
  -dst=s3://vm-backups/cluster/ \
  -s3.accessKey=YOUR_KEY \
  -s3.secretKey=YOUR_SECRET

# 恢复数据
vmrestore \
  -storageDataPath=/vm-data \
  -src=s3://vm-backups/cluster/ \
  -s3.accessKey=YOUR_KEY \
  -s3.secretKey=YOUR_SECRET
```

vmbackup 可以配合 vmstorage 的 `-snapshotCreateInterval` 参数，定期创建快照并上传。快照期间不影响读写性能。

```
  vmstorage                 S3 / MinIO
  +---------+              +---------+
  | data    |--snapshot--->| backup/ |
  | /vmsnap |   vmbackup   |  hourly |
  +---------+   (cron)     +---------+
       |                        |
       |   vmrestore            |
       +<-----------------------+
         (故障恢复时)
```

## 性能调优实战

### 写入优化

**批量写入**：调整 vminsert 的 `-maxInsertRequestSize`（默认 32MB），增大批次大小减少网络往返：

```
# vminsert 启动参数
-maxInsertRequestSize=67108864   # 64MB
-maxConcurrentInserts=8         # 并发写入数
```

**压缩参数**：vmstorage 自动使用 LZ4 压缩。可通过 `-storageDataPath` 挂载高性能 SSD 减少压缩延迟。不建议关闭压缩。

**减少高基数标签**：每个唯一的标签组合都会产生一个新的时间序列。写入前通过 vmagent relabel 规则丢弃不必要的标签。

### 查询优化

**使用 /api/v1/export 离线导出**：大量数据导出用 export 接口，避免内存溢出：

```bash
curl "http://vmselect:8481/select/1/prometheus/api/v1/export" \
  -d 'match[]={__name__=~"node_.*"}' \
  -d 'start=1700000000' \
  -d 'end=1700100000' \
  -o export.jsonl
```

**避免宽范围查询**：单次查询范围控制在 7 天以内。超过 30 天的查询考虑预聚合或降采样。

**优先使用 /api/v1/query**：对于即时查询用 `/api/v1/query`，避免不必要的 `/query_range` 调用。

### 存储优化

**自动压缩**：vmstorage 会自动对历史数据进行合并压缩（merge/sort），减少磁盘占用：

```
# vmstorage 启动参数
-snapshotCreateInterval=1h      # 每小时创建快照（用于备份）
-retentionPeriod=6m             # 数据保留 6 个月
-storageDataPath=/data/vm       # 使用独立 SSD 挂载
```

**冷热数据分离**：使用 vmagent 的 `stream_aggr` 或 recording rules 将高频指标预聚合为低频指标，减少长期存储的数据量。

**对象存储降本**：历史数据通过 vmbackup 迁移到 S3 后，可考虑降低本地存储的 `-retentionPeriod`，仅在本地保留热数据。

## 高基数问题治理

高基数（High Cardinality）是时序数据库的头号性能杀手。一个标签如果有数万个不同值，就会产生数万条时间序列。

### 高基数的危害

- 内存暴涨：每个时间序列都需要维护索引和元数据
- 查询超时：全量扫描大量 series 导致响应缓慢
- 写入吞吐下降：索引更新竞争加剧

### 检测高基数标签

使用 VictoriaMetrics 的内置 API 检测：

```bash
# 查看总 series 数
curl "http://vmselect:8481/select/0/prometheus/api/v1/series/count"

# 查看所有标签及其值的数量
curl "http://vmselect:8481/select/0/prometheus/api/v1/labels"
```

使用 PromQL 找出高基数指标：

```promql
# 按 metric name 统计 series 数量，取 top 10
topk(10, count by(__name__) ({__name__=~".*"}))
```

### relabel 规则丢弃标签

通过 vmagent 的 relabel 配置，在写入前丢弃高基数标签：

```yaml
# vmagent relabel 配置
relabel:
  - source_labels: [__name__]
    regex: 'http_request_duration_.*'
    action: drop   # 直接丢弃不需要的 histogram bucket 指标

  - source_labels: [pod_name]
    target_label: pod
    action: replace
    # 将高基数的 pod_uid 丢弃，仅保留 pod_name

  - regex: 'pod_uid|container_id|docker_id'
    action: labeldrop   # 丢弃指定的标签
```

### 使用 stream_aggr 预聚合

vmagent 支持流式预聚合，在采集端就将高基数指标合并：

```yaml
# vmagent stream_aggr 配置
stream_aggr:
  rules:
    - match: 'http_requests_total'
      interval: 30s
      without:
        - instance
        - pod
      outputs:
        - total
        - count_samples
  drop_input: true   # 聚合后丢弃原始数据
```

预聚合后，原本每个 instance/pod 一条 series 变成按 service 聚合的一条，series 数量可降低 1-2 个数量级。

## 监控 VictoriaMetrics 自身

VictoriaMetrics 所有组件都暴露了 `vm_*` 前缀的 Prometheus 指标，可以直接被 vmagent 采集。

### 关键指标

| 指标 | 含义 | 关注点 |
|------|------|--------|
| `vm_rows` | 存储的时间序列行数 | 超过内存承载能力时需要扩容 |
| `vm_free_disk_space_bytes` | 剩余磁盘空间 | 低于阈值立即告警 |
| `vm_request_duration_seconds` | 请求延迟 P99 | 反映查询性能 |
| `vm_concurrent_inserts` | 当前并发写入数 | 接近上限时需扩容 |
| `vm_active_time_series` | 活跃时间序列数 | 反映写入压力 |
| `vm_cache_entries` | 缓存条目数 | 监控索引缓存命中率 |

### 告警规则

```yaml
groups:
  - name: victoriametrics-alerts
    rules:
      - alert: VMRowsHigh
        expr: vm_rows > 1e9
        for: 10m
        labels:
          severity: warning
        annotations:
          summary: "vmstorage 行数超过 10 亿"
          description: >
            instance={{ $labels.instance }} 当前行数={{ $value }}，
            请考虑扩容或清理旧数据。

      - alert: VMFreeDiskSpaceLow
        expr: vm_free_disk_space_bytes < 10 * 1024 ^ 3
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "磁盘剩余空间不足 10GB"
          description: >
            instance={{ $labels.instance }} 剩余={{ $value | humanize }}B

      - alert: VMRequestDurationHigh
        expr: >
      histogram_quantile(0.99,
        sum(rate(vm_request_duration_seconds_bucket[5m]))
        by (le, instance)
      ) > 10
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "查询 P99 延迟超过 10 秒"

      - alert: VMConcurrentInsertsHigh
        expr: vm_concurrent_inserts / vm_concurrent_inserts_capacity > 0.8
        for: 10m
        labels:
          severity: warning
        annotations:
          summary: "并发写入数达到容量的 80%"
```

### Grafana Dashboard

VictoriaMetrics 官方提供了一组开箱即用的 Grafana Dashboard：

- **VictoriaMetrics cluster overview**（Dashboard ID: `11176`）：集群整体视图
- **VictoriaMetrics vmagent**（Dashboard ID: `12683`）：采集器状态
- **VictoriaMetrics vmalert**（Dashboard ID: `14959`）：告警引擎状态

导入方式：Grafana -> Dashboards -> Import -> 输入 Dashboard ID。

## 从 Prometheus 迁移

从现有 Prometheus 部署迁移到 VictoriaMetrics 集群版，可以做到零停机平滑迁移。

### 迁移步骤

**第一步：部署 vmagent 指向现有 targets**

将 vmagent 配置为与现有 Prometheus 相同的采集目标：

```yaml
# vmagent 配置（与 prometheus.yml 中的 scrape_configs 一致）
scrape_configs:
  - job_name: 'node-exporter'
    static_configs:
      - targets: ['node-1:9100', 'node-2:9100', 'node-3:9100']
```

**第二步：配置 Remote Write 到 VictoriaMetrics**

vmagent 同时写入 Prometheus（保持原链路）和 VictoriaMetrics（新链路）：

```yaml
remoteWrite:
  - url: "http://prometheus:9090/api/v1/write"           # 旧链路
  - url: "http://vminsert:8480/insert/0/prometheus/api/v1/write"  # 新链路
```

**第三步：双写验证数据一致性**

双写运行至少 24 小时后，在 Grafana 中对比两个数据源的查询结果。重点验证：

- 指标名称和标签是否一致
- 指标值是否在允许误差范围内（采样时间差异可忽略）
- 告警规则在新旧系统中的触发是否一致

**第四步：切换 Grafana 数据源**

验证通过后，将 Grafana 数据源从 Prometheus 切换到 VictoriaMetrics。建议以 Dashboard 为单位逐步切换，而不是一次性全部切换。

**第五步：下线旧 Prometheus**

确认所有 Dashboard 和告警规则正常运行后，逐步关闭旧 Prometheus 实例。

### vmctl 数据迁移

对于 Prometheus 的历史数据，使用 vmctl 工具迁移：

```bash
# 从 Prometheus TSDB 直接迁移
vmctl prometheus \
  --prom-snapshot=/data/prometheus/snapshots/20260601 \
  --vm-addr=http://vminsert:8480/insert/0 \
  --vm-account-id=0 \
  --concurrency=8 \
  --batch-size=5000

# 从 Prometheus remote read 迁移
vmctl prometheus \
  --prom-addr=http://prometheus:9090 \
  --vm-addr=http://vminsert:8480/insert/0 \
  --start=2026-01-01 \
  --end=2026-06-01
```

vmctl 支持断点续传。迁移过程中如果中断，重新执行相同命令即可从上次位置继续。

对于超大历史数据（TB 级别），建议分时间段迁移，避免对集群造成瞬时写入压力：

```bash
# 分月迁移
for month in 01 02 03 04 05; do
  vmctl prometheus \
    --prom-snapshot=/data/prometheus/snapshots/2026${month} \
    --vm-addr=http://vminsert:8480/insert/0 \
    --concurrency=4
done
```
