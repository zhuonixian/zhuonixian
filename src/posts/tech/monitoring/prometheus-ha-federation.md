---
title: Prometheus 高可用与长期存储
icon: server
date: 2026-06-13
category:
  - 技术
tag:
  - Prometheus
  - Thanos
  - 高可用
  - 长期存储
  - Remote Write
---

Prometheus 单实例在可靠性和数据保留周期上都存在先天不足。进程崩溃、磁盘故障、节点宕机都会导致监控数据丢失；本地 TSDB 的存储容量也决定了数据保留时间有限。当监控规模从几十个节点扩展到数千个、合规要求将数据保留周期从 15 天拉长到 1 年甚至更久时，就必须引入高可用和长期存储方案。

## Prometheus 高可用方案对比

目前社区的主流方案各有侧重，选型时需要在复杂度、成本和功能之间做权衡：

| 方案 | 高可用 | 长期存储 | 全局视图 | 多租户 | 复杂度 | 适用规模 |
|------|--------|----------|----------|--------|--------|----------|
| 多副本部署 | 部分（数据重复） | 否 | 否 | 否 | 低 | 中小规模 |
| 联邦（Federation） | 部分 | 否 | 部分 | 否 | 中 | 中等规模 |
| Remote Write | 是（依赖远端） | 是 | 依赖远端 | 依赖远端 | 中 | 中大规模 |
| Thanos | 是 | 是（对象存储） | 是 | 否 | 高 | 大规模 |
| Cortex | 是 | 是 | 是 | 是 | 高 | 大规模/多租户 |
| Grafana Mimir | 是 | 是 | 是 | 是 | 高 | 大规模/多租户 |

关键判断维度：是否需要全局查询视图、是否需要多租户隔离、数据保留周期要求、运维团队的技术储备。

## 多副本部署

多副本是最简单的高可用方案：部署两个或多个完全相同的 Prometheus 实例，各自独立抓取相同的目标。

```
 ┌──────────────────┐
 │  Prometheus-A    │──── 抓取相同的 targets
 │  (replica: "a")  │
 └──────────────────┘

 ┌──────────────────┐
 │  Prometheus-B    │──── 抓取相同的 targets
 │  (replica: "b")  │
 └──────────────────┘
```

每个副本在 `external_labels` 中标记自身的 replica 标识：

```yaml
global:
  external_labels:
    replica: "a"
```

**核心问题：数据重复。** 两个副本各自上报相同的告警到 Alertmanager 时，会收到双份通知。解决方式是在 Alertmanager 配置中按 `group_by` 对 replica 标签做去重：

```yaml
route:
  group_by: ['alertname', 'cluster', 'namespace', 'replica']
```

Alertmanager 默认根据 `group_key` 去重，相同告警在不同 replica 上产生时，最终只会发送一次通知。

**局限与适用场景：**

- 查询时需要指定 `replica` 标签或在 Grafana 中用 `duplicate(x)` 函数手动去重
- 存储成本翻倍，每个副本都保留完整数据
- 不解决长期存储问题，本地 TSDB 保留周期仍然有限
- 适合中小规模（< 100 万活跃时间序列），运维团队人力有限的场景

## 联邦（Federation）

联邦机制允许一个 Prometheus 从另一个 Prometheus 拉取聚合后的指标数据，实现分层或跨服务的监控架构。

### 架构图

```
                          ┌─────────────────────┐
                          │  Global Prometheus   │
                          │  (全局聚合/告警/展示) │
                          └──────┬──────┬───────┘
                                 │      │
                    ┌────────────┘      └────────────┐
                    │                                │
          ┌─────────┴──────┐              ┌──────────┴──────┐
          │  Sub Prometheus │              │  Sub Prometheus  │
          │  (数据中心 A)    │              │  (数据中心 B)     │
          │  抓取本地 targets │              │  抓取本地 targets │
          └────────────────┘              └─────────────────┘
```

### 层级联邦（Hierarchical Federation）

层级联邦按组织或地域划分监控层级。叶子节点 Prometheus 负责抓取本地目标，中间层 Prometheus 从叶子节点拉取聚合数据：

```
  ┌─────────────────────────────────────────────┐
  │             Global Prometheus (L2)           │
  │         保留聚合规则：avg, sum, quantile       │
  └───────────┬───────────┬───────────┬─────────┘
              │           │           │
     ┌────────┴──┐ ┌──────┴────┐ ┌────┴──────┐
     │ DC-East   │ │ DC-West   │ │ DC-South  │   ← L1 层
     │ (叶子节点) │ │ (叶子节点) │ │ (叶子节点) │
     └───────────┘ └───────────┘ └───────────┘
```

全局 Prometheus 的联邦抓取配置：

```yaml
scrape_configs:
  - job_name: 'federate'
    scrape_interval: 15s
    honor_labels: true
    metrics_path: '/federate'
    params:
      'match[]':
        - '{job="mysql"}'
        - '{job="node"}'
        - '{__name__=~"job:.*"}'    # 只拉取 recording rules 产生的聚合指标
    static_configs:
      - targets:
          - 'prometheus-dc-east:9090'
          - 'prometheus-dc-west:9090'
```

### honor_labels 和 match 参数

- **honor_labels: true**：联邦抓取时，上游 Prometheus 已有的 `job`、`instance` 等标签会被保留。如果设为 false（默认），全局 Prometheus 会用自己的标签覆盖，导致来源信息丢失
- **match[]**：通过选择器控制拉取哪些指标。精确匹配减少网络传输，避免全局实例吸入全量数据

### 跨服务联邦（Cross-service Federation）

跨服务联邦用于不同团队或服务之间共享特定指标。例如，网络团队把带宽指标暴露给应用团队的 Prometheus：

```yaml
scrape_configs:
  - job_name: 'network-metrics'
    honor_labels: true
    metrics_path: '/federate'
    params:
      'match[]':
        - '{job="network-switch", __name__=~"bandwidth_.*"}'
    static_configs:
      - targets:
          - 'network-prometheus.infra.svc:9090'
```

### 联邦的局限

- **不转发原始元数据**：联邦拉取的是 `/federate` 端点暴露的聚合后指标，原始的 `scrape_interval`、`scrape_timeout`、原始样本的时间戳精度都会丢失
- **查询放大**：全局实例每次抓取都会触发子实例的查询，当 match 范围过大时会给子实例带来压力
- **不解决长期存储**：联邦只是数据的搬运，不改变数据的保留周期
- **不适合高基数标签**：联邦拉取会放大高基数问题，建议只拉取 recording rules 产出的聚合指标

## Remote Write 机制

Remote Write 是 Prometheus 原生支持的将样本数据实时写入远端存储的机制。Prometheus 本地仍保留短期数据，同时将数据异步发送到远端系统。

### 架构图

```
 ┌──────────────┐     Remote Write      ┌──────────────────┐
 │  Prometheus  │ ─────────────────────> │  远端存储          │
 │              │    (HTTP/Snappy)       │  VictoriaMetrics  │
 │  本地 TSDB   │                        │  Thanos Receive   │
 │  (短期保留)   │                        │  Cortex / Mimir   │
 └──────────────┘                        └──────────────────┘
       │                                        │
       │ 查询本地数据                              │ 查询历史数据
       v                                        v
 ┌──────────────┐                        ┌──────────────────┐
 │   Grafana    │<───────────────────────│  Grafana          │
 │ (数据源 A)    │   通过 PromQL/查询 API  │ (数据源 B)         │
 └──────────────┘                        └──────────────────┘
```

### 远端存储方案

| 方案 | 特点 | 优势 | 劣势 |
|------|------|------|------|
| VictoriaMetrics | 单体或集群部署 | 高性能、低资源消耗、部署简单 | 商业功能需付费 |
| Thanos Receive | Thanos 组件之一 | 与 Thanos Sidecar 模式无缝集成 | 增加 Thanos 组件复杂度 |
| Cortex | 多租户分布式 | 成熟的多租户支持 | 架构复杂、组件多 |
| Grafana Mimir | Cortex 的商业分支 | 性能优于 Cortex、活跃社区 | 架构仍然复杂 |

### Remote Write 配置

```yaml
remote_write:
  - url: 'https://victoriametrics-cluster:8480/insert/0/prometheus/api/v1/write'
    queue_config:
      capacity: 10000               # 队列容量
      max_shards: 50                # 最大并发分片数
      min_shards: 5                 # 最小并发分片数
      max_samples_per_second: 50000 # 每秒最大样本数
      batch_send_deadline: 5s       # 批量发送超时
      min_backoff: 30ms             # 重试最小退避时间
      max_backoff: 5s               # 重试最大退避时间
    metadata_config:
      send_interval: 1m             # 元数据发送间隔
      max_samples_per_send: 500     # 每次发送的最大样本数
```

关键参数调优要点：

- **max_shards**：控制并发写入的连接数。过高会压垮远端存储，过低会导致队列积压
- **batch_send_deadline**：即使未达到批量大小，超过此时间也会强制发送。低延迟场景设小（1-2s），高吞吐场景设大（10-30s）
- **max_samples_per_second**：限流保护，防止突发流量打垮远端

### Remote Read

Remote Read 允许 Prometheus 从远端存储读取历史数据，配合 Remote Write 可实现透明的长期存储：

```yaml
remote_read:
  - url: 'https://victoriametrics-cluster:8480/select/0/prometheus/api/v1/read'
    read_recent: true               # 同时从远端读取近期数据
    required_matchers: []           # 无过滤，读取所有匹配数据
```

使用场景：Grafana 只配置一个 Prometheus 数据源，Prometheus 自动从远端存储补全历史数据。但这会增加 Prometheus 的查询负载，在大量并发查询时容易成为瓶颈。

## Thanos 架构详解

Thanos 是 Prometheus 长期存储领域最广泛使用的方案，通过对象存储实现低成本的历史数据保存，同时提供全局查询视图。

### 架构图

```
                          ┌──────────────────────────────────────────┐
                          │              Grafana / 用户              │
                          └──────────────┬───────────────────────────┘
                                         │
                                         v
                          ┌──────────────────────────┐
                          │     Thanos Query          │
                          │  (全局查询入口, Dedup)      │
                          └───┬────┬────┬────┬───────┘
                              │    │    │    │
                 ┌────────────┘    │    │    └────────────┐
                 v                 │    │                  v
        ┌──────────────┐           │    │          ┌──────────────┐
        │ Thanos Sidecar│          │    │          │ Thanos Store  │
        │ (Prometheus   │          │    │          │ Gateway       │
        │  数据上传)     │          │    │          │ (查询对象存储) │
        └──────┬───────┘          │    │          └──────┬───────┘
               │                  │    │                 │
               v                  │    │                 v
     ┌─────────────────┐          │    │     ┌──────────────────┐
     │  Prometheus      │          │    │     │  Object Storage  │
     │  (本地 TSDB)      │          │    │     │  (S3/MinIO/GCS)  │
     └─────────────────┘          │    │     └──────────────────┘
                                  │    │            ^
            ┌──────────────┐      │    │            │
            │ Thanos        │      │    │     ┌──────┴───────┐
            │ Compactor     │──────┘    │     │ Thanos        │
            │ (压缩历史数据) │           │     │ Compactor     │
            └──────────────┘           │     │ (压缩+降采样)   │
                                       │     └──────────────┘
                            ┌──────────┴──────────┐
                            │  Thanos Receive      │
                            │  (Remote Write 接收)  │
                            └──────────┬──────────┘
                                       │
                              Prometheus
                             (Remote Write)
```

### 核心组件

- **Sidecar**：与 Prometheus 部署在同一个 Pod 中，每 2 小时将 TSDB block 上传到对象存储，同时代理 StoreAPI 查询（查询近期数据）
- **Query**：全局查询入口，实现 Dedup（去重）和数据源聚合。支持 HA 模式下自动选择一个 replica 的数据
- **Store Gateway**：从对象存储中查询历史数据块，暴露 StoreAPI 供 Query 调用
- **Compactor**：对对象存储中的历史 block 进行压缩（合并小 block）和降采样（原始数据 -> 5m -> 1h 聚合），减少存储空间和查询开销
- **Receive**：接收 Prometheus 的 Remote Write 数据，直接写入对象存储，适用于无法部署 Sidecar 的场景

### Sidecar 模式 vs Receiver 模式

| 维度 | Sidecar 模式 | Receiver 模式 |
|------|-------------|--------------|
| 部署方式 | Sidecar 与 Prometheus 同 Pod | 独立部署，Prometheus Remote Write |
| 数据路径 | Prometheus 本地写 TSDB -> Sidecar 上传 | Prometheus -> Remote Write -> Receiver -> 对象存储 |
| Prometheus 依赖 | 需要 Prometheus 完成 TSDB block 持久化（默认 2 小时） | 不依赖 Prometheus 本地存储 |
| 写入延迟 | 2 小时后数据才出现在对象存储 | 准实时写入对象存储 |
| 适用场景 | 标准 Kubernetes 部署 | 跨网络/跨集群、无法部署 Sidecar |

### 对象存储的必要性

对象存储（S3、MinIO、GCS、Azure Blob）是 Thanos 长期存储的基石。相比块存储和文件存储：

- **成本**：S3 Standard 约 $0.023/GB/月，比 EBS（$0.08-0.10/GB/月）便宜 3-4 倍
- **容量**：几乎无限，不需要提前规划容量
- **持久性**：11 个 9 的数据持久性，远超本地磁盘
- **降采样后的成本更低**：1h 降采样后的数据量仅为原始数据的约 1/60

### 数据保留策略（Hot/Warm/Cold）

```
 Hot（热数据）                Warm（温数据）              Cold（冷数据）
┌─────────────────┐    ┌──────────────────┐    ┌────────────────────┐
│ Prometheus 本地   │    │ 对象存储          │    │ 对象存储            │
│ TSDB (最近 2h)   │──> │ 原始数据 (2h~30d) │──> │ 降采样数据 (>30d)    │
│ 完整精度          │    │ 完整精度           │    │ 5m / 1h 聚合        │
│ 高速查询          │    │ 标准查询           │    │ 低精度、低成本查询    │
└─────────────────┘    └──────────────────┘    └────────────────────┘
```

Compactor 的降采样配置：

```yaml
# thanos-compactor 参数
--retention.resolution-raw=30d       # 原始数据保留 30 天
--retention.resolution-5m=180d       # 5 分钟聚合保留 180 天
--retention.resolution-1h=365d       # 1 小时聚合保留 365 天
--downsample.concurrency=4           # 降采样并发数
```

## Grafana Mimir

Grafana Mimir 是 Cortex 的下游分支，由 Grafana Labs 主导开发，是 Grafana Cloud 的核心存储后端。它继承了 Cortex 的多租户分布式架构，同时在性能和易用性上做了大量改进。

### 与 Thanos 的对比

| 维度 | Thanos | Grafana Mimir |
|------|--------|---------------|
| 架构模式 | 附加式（不改变 Prometheus 部署模型） | 替换式（替代 Prometheus 的存储后端） |
| 多租户 | 不原生支持 | 原生支持（X-Scope-OrgID） |
| 写入路径 | Sidecar 上传或 Receiver 接收 | Distributor -> Ingester 直接写入 |
| 存储后端 | 对象存储 | 对象存储 |
| 查询性能 | 依赖 Store Gateway 的缓存 | Ingester 内存 + 存储缓存 + 查询结果缓存 |
| 社区活跃度 | 高（CNCF 孵化项目） | 高（Grafana Labs 主导） |
| 运维复杂度 | 中高（组件可独立部署） | 高（微服务组件多） |

### Mimir 架构图

```
                              ┌─────────────────────────────┐
                              │        Grafana / 用户        │
                              └──────────────┬──────────────┘
                                             │
                                             v
                              ┌──────────────────────────┐
                              │     Nginx/Gateway        │
                              │  (路由 + 认证 + 限流)      │
                              └──────┬──────────┬────────┘
                                     │          │
                              写入路径│          │查询路径
                                     v          v
                         ┌──────────────┐  ┌──────────────┐
                         │ Distributor  │  │   Querier    │
                         │ (写入路由+    │  │ (查询入口+    │
                         │  验证+分发)   │  │  路由+聚合)   │
                         └──────┬───────┘  └──────┬───────┘
                                │                  │
                      ┌─────────┴───────┐   ┌──────┴───────┐
                      │                 │   │              │
               ┌──────┴──────┐   ┌──────┴──┐ │  ┌──────────┴───┐
               │  Ingester   │   │Ingester │ │  │Store Gateway │
               │  (写入+内存  │   │(写入+   │ │  │ (查询对象存储) │
               │   缓存)      │   │ 内存缓存)│ │  └──────┬───────┘
               └──────┬──────┘   └────┬────┘ │         │
                      │               │      │         │
                      v               v      │         v
               ┌────────────────────────────┐│  ┌──────────────┐
               │      Object Storage        ││  │ Object Storage│
               │      (长期持久化)            │└─>│ (历史数据)     │
               └────────────────────────────┘   └──────────────┘
```

核心组件职责：

- **Distributor**：接收 Remote Write 请求，验证数据合法性，按租户和哈希环将数据分发到 Ingester
- **Ingester**：将数据写入内存 WAL，定期刷到对象存储。是写入路径的核心，多副本部署保证数据持久性
- **Querier**：查询入口，同时查询 Ingester（近期数据）和 Store Gateway（历史数据），合并结果返回
- **Store Gateway**：从对象存储查询历史 block，缓存索引以加速重复查询
- **Compactor**：合并和压缩对象存储中的 block，支持多租户隔离
- **Ruler**：评估记录规则和告警规则，支持多租户

### 多租户支持

Mimir 通过 `X-Scope-OrgID` HTTP Header 实现多租户隔离。每个租户有独立的：

- 数据存储路径
- 限流配置（写入速率、查询速率、存储配额）
- 告警规则和记录规则

租户配置示例：

```yaml
overrides:
  tenant-a:
    ingestion_rate: 50000          # 每秒最大样本数
    max_series_per_user: 5000000   # 最大活跃时间序列数
    max_query_length: 720h         # 最大查询时间范围
    retention_period: 400d         # 数据保留周期
  tenant-b:
    ingestion_rate: 200000
    max_series_per_user: 50000000
    max_query_length: 2160h
    retention_period: 400d
```

## 长期存储选型建议

### 方案对比

| 维度 | Thanos | Grafana Mimir | VictoriaMetrics | Cortex |
|------|--------|---------------|-----------------|--------|
| 部署模式 | 单体/微服务 | 微服务 | 单体/集群 | 微服务 |
| 多租户 | 不支持 | 原生支持 | 商业版支持 | 原生支持 |
| 全局查询 | Query 组件 | Querier | vmselect | Querier |
| 对象存储 | 必须 | 必须 | 可选（推荐） | 必须 |
| 降采样 | Compactor | Compactor | vmrollup | Compactor |
| Grafana 集成 | PromQL | PromQL | PromQL + MetricsQL | PromQL |
| 资源消耗 | 中 | 高 | 低 | 高 |
| 运维复杂度 | 中高 | 高 | 低 | 高 |
| 社区成熟度 | 高 | 高 | 高 | 中 |

### 按规模推荐

**小规模（< 100 万活跃时间序列，< 50 台服务器）**

推荐方案：VictoriaMetrics 单节点 + 本地磁盘

- 部署简单，单二进制即可运行
- 数据保留 30-90 天，通过 `retentionPeriod` 配置
- 成本最低，单台 8C16G 虚拟机即可支撑
- 如需更长保留周期，挂载大容量云盘即可

**中等规模（100 万 - 1000 万活跃时间序列，50-500 台服务器）**

推荐方案：Thanos Sidecar + 对象存储 或 VictoriaMetrics 集群

- Thanos 方案优势：不改变现有 Prometheus 部署，平滑迁移
- VictoriaMetrics 集群方案优势：运维更简单，性能更好
- 数据保留 90 天 - 1 年
- 对象存储成本预估：1000 万时间序列保留 1 年约 2-5 TB，S3 费用约 $50-120/月

**大规模（> 1000 万活跃时间序列，> 500 台服务器）**

推荐方案：Grafana Mimir 或 Thanos Receive + 全套微服务

- 需要多租户隔离时选 Mimir
- 已有成熟运维团队、偏好 CNCF 生态时选 Thanos
- 数据保留 1 年以上，需要降采样控制查询成本
- 对象存储成本预估：1 亿时间序列保留 1 年约 20-50 TB，S3 费用约 $500-1200/月

### 成本估算参考

以 1000 万活跃时间序列、15s 采集间隔为例：

| 成本项 | 说明 | 月费用估算 |
|--------|------|-----------|
| Prometheus 实例（3 副本） | 3 x 8C32G，含 Sidecar | $300-600 |
| 对象存储（原始 + 降采样，保留 1 年） | 约 3-5 TB | $70-120 |
| Query / Store Gateway | 2 x 4C16G | $100-200 |
| Compactor | 1 x 4C8G | $50-80 |
| 网络（跨可用区/区域传输） | 联邦或 Remote Write 流量 | $50-200 |
| **合计** | | **$570-1200/月** |

对比传统时序数据库（InfluxDB Enterprise、TimescaleDB 等）每百万时间序列 $200-500/月的授权费用，基于对象存储的方案在长期成本上有显著优势。
