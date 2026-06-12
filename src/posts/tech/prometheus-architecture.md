---
title: Prometheus 核心架构与原理
icon: fire
date: 2026-06-13
category:
  - 技术
tag:
  - Prometheus
  - 监控
  - TSDB
  - 时序数据库
  - 云原生
---

## 整体架构

Prometheus 是云原生监控的事实标准，采用 Pull 模型采集指标，内置时序数据库（TSDB），配合 Alertmanager 实现告警管理。以下是其完整架构：

```
                          ┌─────────────────────────────────────────┐
                          │            Prometheus Server             │
                          │                                         │
  ┌───────────────┐       │  ┌──────────┐    ┌──────────────────┐   │
  │    Service     │──────>  │ Retrieval│───>│      TSDB        │   │
  │  Discovery    │       │  │ (Scrape) │    │ (Time Series DB) │   │
  │ (K8s/Consul/  │       │  └──────────┘    └───────┬──────────┘   │
  │  DNS/File)    │       │                          │              │
  └───────────────┘       │  ┌──────────┐            │              │
                          │  │  Rules   │<───────────┘              │
                          │  │  Engine  │───┐                        │
                          │  └──────────┘   │                        │
                          │       │         │                        │
                          │       ▼         │                        │
                          │  ┌──────────┐   │   ┌──────────────┐    │
                          │  │  HTTP    │   └──>│ Alertmanager │    │
                          │  │  Server  │       │  (路由/分组/  │    │
                          │  │ (Query/  │       │   抑制/静默)  │    │
                          │  │  API)    │       └──────┬───────┘    │
                          │  └──────────┘              │            │
                          └────────────────────────────┼────────────┘
                                                     │
                           ┌─────────────────────────┼──────────────┐
                           │                         ▼              │
                           │              ┌──────────────┐         │
                           │              │  通知渠道     │         │
                           │              │ Email/Slack/ │         │
                           │              │ WeChat/PagerD│         │
                           │              └──────────────┘         │
                           │        Grafana / API Consumers        │
                           └───────────────────────────────────────┘

  ┌───────────────┐       ┌───────────────┐
  │   Targets     │       │  Pushgateway  │
  │ (/metrics)    │<──────│  (临时任务    │
  │ Exporter/App  │ Pull  │   中转站)     │
  └───────────────┘       └───────────────┘
```

Prometheus Server 是整个系统的核心，由四个主要组件构成：

- **Retrieval**：负责从目标端点拉取（Pull）指标数据，支持多种服务发现机制
- **TSDB**：本地时序数据库，存储采集到的所有样本数据
- **HTTP Server**：提供 PromQL 查询接口和 API，供 Grafana 等可视化工具消费
- **Rules Engine**：定期评估 Recording Rules 和 Alerting Rules

### Pushgateway 的角色

Pushgateway 是一个中转推送网关，适用于**短生命周期任务**（如 Cron Job、批处理任务）。这类任务存在时间短，Prometheus 无法在其运行期间完成 Pull。任务将指标推送到 Pushgateway，Prometheus 再从 Pushgateway 拉取。

使用 Pushgateway 需注意：它不是代理，会成为一个单点和潜在的单点故障源；指标的 `instance` 标签需要手动管理；Pushgateway 上的数据不会自动过期，需要主动清理或使用 `honor_labels`。

### Pull 模型的优势

Prometheus 选择 Pull 而非 Push，核心优势在于：

- **目标健康检测**：每次 Scrape 都是一次健康检查，目标不可达时自动标记 `up == 0`，无需额外心跳机制
- **无 Agent 依赖**：目标只需暴露 `/metrics` HTTP 端点，不需要安装专用 Agent
- **可控的采集频率**：服务端决定采集频率，不会被客户端的数据洪流冲垮
- **调试友好**：直接访问 `/metrics` 端点即可查看原始数据，排查问题直观

## TSDB 存储引擎原理

Prometheus 内置了一个高性能的本地时序数据库，专门为监控场景优化。

### 数据模型

时间序列由 metric 名称和一组标签（labels）唯一标识：

```
时间序列 = (metric_name, labels) → [(timestamp, value), ...]

示例：
http_requests_total{method="GET", path="/api", status="200"}  1718256000  1024
http_requests_total{method="GET", path="/api", status="200"}  1718256030  1089
```

metric 名称本质上也是一个名为 `__name__` 的标签。PromQL 查询 `http_requests_total` 等价于 `{__name__="http_requests_total"}`。

### 数据写入流程

```
                          数据写入
                             │
                             ▼
                    ┌─────────────────┐
                    │   Head Chunk    │  ← 内存中的追加写入缓冲区
                    │  (Active Series)│     保持最近 ~2h 数据
                    └────────┬────────┘
                             │
                    ┌────────▼────────┐
                    │       WAL       │  ← Write-Ahead Log
                    │  (预写日志)      │     崩溃恢复用，顺序写入
                    └────────┬────────┘
                             │  每 2h 触发持久化
                             ▼
                    ┌─────────────────┐
                    │  Persistent     │
                    │  Block (Chunk)  │  ← 不可变的持久化数据块
                    │  + Index        │     包含 Chunk 文件 + 索引
                    └────────┬────────┘
                             │
                    ┌────────▼────────┐
                    │   Compaction    │  ← 后台合并
                    │  2h → 6h → 18h  │     合并小块、删除过期数据
                    │  → 2d → ...     │
                    └─────────────────┘
```

写入流程分为三阶段：

1. **Head Chunk 写入**：样本数据首先写入内存中的 Head Chunk。每个 Active Series 对应一个内存中的 Chunk（默认容量 120 个样本），Chunk 写满后冻结，创建新 Chunk
2. **WAL 记录**：每次写入同时追加到 WAL（Write-Ahead Log）。WAL 是顺序写入的，性能极高。Prometheus 重启时通过回放 WAL 恢复 Head 中尚未持久化的数据
3. **持久化与 Compaction**：每 2 小时，Head 中冻结的数据被持久化为一个 Block。后台 Compaction 进程将多个小 Block 合并为大 Block（2h → 6h → 18h → 2d → ...），减少 Block 数量，提升查询效率

### 索引结构：倒排索引

Prometheus 使用倒排索引（Inverted Index）来加速查询：

```
查询: http_requests_total{method="GET", status="200"}
                │
                ▼
        ┌───────────────┐
        │  倒排索引      │
        │               │
        │  method="GET" ──> [Series 1, Series 3, Series 5, ...]
        │  status="200" ──> [Series 1, Series 2, Series 5, ...]
        │               │
        │  交集运算 ──────> [Series 1, Series 5]    ← 匹配的时间序列
        └───────┬───────┘
                │
                ▼
        ┌───────────────┐
        │  查询 Samples │
        │  Series 1 ──> [t1,v1], [t2,v2], ...
        │  Series 5 ──> [t1,v1], [t2,v2], ...
        └───────────────┘
```

索引层级为 Label → Postings（匹配的 Series ID 列表）→ Samples。查询时，PromQL 引擎将标签选择器转换为倒排索引查询，对多个标签的结果取交集，最终从对应 Chunk 中读取样本值。

### 本地存储的限制

Prometheus 本地 TSDB 专为单节点设计，存在明确边界：

- **无原生集群**：不支持多副本、分布式查询，需要通过 Thanos、Cortex、Mimir 等方案扩展
- **容量有限**：单机磁盘和内存决定能存储多少数据
- **无长期保留**：默认保留 15 天（`--storage.tsdb.retention.time`），长时间保留依赖远程存储
- **无高可用**：单实例故障即丢失采集能力（但不丢历史数据），需部署多个独立实例

Prometheus 3.x 引入了 **OTLP Write** 支持，允许直接将数据写入兼容 OTLP 的远程后端（如 Mimir、VictoriaMetrics），降低了长期存储的集成门槛。

## 服务发现（Service Discovery）

在动态环境中（如 Kubernetes），监控目标频繁变化，静态配置无法跟上。Prometheus 内置了丰富的服务发现机制。

### 静态配置 vs 动态发现

```yaml
# 静态配置 —— 适用于固定目标
scrape_configs:
  - job_name: 'my-app'
    static_configs:
      - targets: ['10.0.0.1:9090', '10.0.0.2:9090']

# 动态发现 —— 适用于云原生环境
scrape_configs:
  - job_name: 'kubernetes-pods'
    kubernetes_sd_configs:
      - role: pod
```

### Kubernetes SD 角色

Kubernetes 服务发现支持四种角色，对应不同的 API 资源：

| 角色 | 发现对象 | 典型场景 |
|------|---------|---------|
| `endpoints` | Service 的 Endpoints | 监控应用暴露的指标端点 |
| `pod` | 所有 Pod | 监控 Pod 级别指标 |
| `service` | 所有 Service | 监控 Service 黑盒探测 |
| `node` | 所有 Node | 监控节点级别指标（node-exporter） |

完整配置示例：

```yaml
scrape_configs:
  - job_name: 'kubernetes-pods'
    kubernetes_sd_configs:
      - role: pod
    relabel_configs:
      # 仅采集带有注解的 Pod
      - source_labels: [__meta_kubernetes_pod_annotation_prometheus_io_scrape]
        action: keep
        regex: true
      # 从注解中读取指标路径
      - source_labels: [__meta_kubernetes_pod_annotation_prometheus_io_path]
        action: replace
        target_label: __metrics_path__
        regex: (.+)
      # 从注解中读取端口
      - source_labels: [__address__, __meta_kubernetes_pod_annotation_prometheus_io_port]
        action: replace
        regex: ([^:]+)(?::\d+)?;(\d+)
        replacement: $1:$2
        target_label: __address__
      # 将 Pod 名称写入 instance 标签
      - source_labels: [__meta_kubernetes_pod_name]
        action: replace
        target_label: instance
```

Pod 只需添加注解即可被自动发现：

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: my-app
  annotations:
    prometheus.io/scrape: "true"
    prometheus.io/port: "9090"
    prometheus.io/path: "/metrics"
```

### relabel_configs 的作用

`relabel_configs` 在服务发现之后、采集之前执行，是 Prometheus 的标签处理引擎。核心用途：

- **过滤**：`action: keep` / `action: drop`，决定哪些目标需要采集
- **标签改写**：将元标签（`__meta_*`）映射为业务标签
- **地址改写**：动态修改采集地址和路径

### 其他发现机制

- **Consul SD**：与 Consul 集成，适合非 Kubernetes 的微服务架构
- **DNS SD**：通过 DNS SRV 记录发现目标，适合传统基础设施
- **File SD**：读取 JSON/YAML 文件中的目标列表，适合外部系统管理目标清单

## 抓取（Scrape）机制

### Pull 模型的采集流程

```
Prometheus                          Target
   │                                  │
   │  ──── HTTP GET /metrics ────────>│
   │                                  │
   │  <── 200 OK + Exposition ─────── │
   │      (text/plain)                │
   │                                  │
   │  记录 scrape_duration_seconds    │
   │  记录 up = 1 (成功) / 0 (失败)   │
   │  写入 TSDB                       │
```

每次 Scrape 后，Prometheus 自动生成元指标：

- `up{job="<job>", instance="<instance>"}`：1 表示成功，0 表示失败
- `scrape_duration_seconds`：本次采集耗时
- `scrape_samples_scraped`：采集到的样本数
- `scrape_samples_post_metric_relabeling`：经过 relabel 后保留的样本数

### 核心时间参数

```yaml
global:
  scrape_interval: 15s       # 采集间隔，默认 15s
  scrape_timeout: 10s        # 采集超时，默认 10s（不超过 scrape_interval）
  evaluation_interval: 1m    # 规则评估间隔
```

`scrape_timeout` 不应超过 `scrape_interval` 的 50%，为数据处理和规则评估预留时间。

### 样本量估算

规划容量时需要估算样本总量：

```
总样本数 = Active Series 数 × (保留时间 / scrape_interval)

示例：
- Active Series: 500,000
- 保留时间: 15 天
- scrape_interval: 15s

每秒写入 = 500,000 / 15 = 33,333 samples/s
总样本数 = 33,333 × 15 × 86400 ≈ 43.2 亿
```

Prometheus 3.x 的 **Native Histograms**（原生直方图）将整个直方图存储为单个样本，相比经典的 Sum/Count/Bucket 方式大幅减少了 Series 数量。一个 Native Histogram 只占用一个 Series，而非 N+2 个（N 个 bucket + sum + count）。

## Recording Rules 与 Alerting Rules

### Recording Rules

Recording Rules 用于预计算高频或复杂的 PromQL 查询，将结果保存为新的时间序列。这能显著降低 Dashboard 的查询负载。

```yaml
groups:
  - name: http_requests
    interval: 30s
    rules:
      # 预计算每秒请求率，避免 Dashboard 重复计算
      - record: job:http_requests:rate5m
        expr: sum(rate(http_requests_total[5m])) by (job)

      # 预计算错误率
      - record: job:http_error_ratio:rate5m
        expr: |
          sum(rate(http_requests_total{status=~"5.."}[5m])) by (job)
          /
          sum(rate(http_requests_total[5m])) by (job)
```

Recording Rules 的命名惯例：`level:metric:operations`，例如 `job:http_requests:rate5m` 表示按 job 维度对 http_requests 做 5 分钟速率计算。

### Alerting Rules

Alerting Rules 定义告警条件，当条件满足并持续指定时间后触发告警：

```yaml
groups:
  - name: api-alerts
    rules:
      # 错误率告警
      - alert: HighErrorRate
        expr: |
          job:http_error_ratio:rate5m > 0.05
        for: 5m
        labels:
          severity: critical
          team: backend
        annotations:
          summary: "{{$labels.job}} 错误率过高"
          description: >
            Job {{$labels.job}} 的 5xx 错误率为
            {{ $value | printf "%.2f" }}，已超过 5% 阈值持续 5 分钟

      # Pod 重启告警
      - alert: PodRestartTooMany
        expr: |
          increase(kube_pod_container_status_restarts_total[1h]) > 5
        for: 10m
        labels:
          severity: warning
```

`for` 字段指定条件必须持续满足的时间。在 `for` 期间告警处于 Pending 状态，超过后转为 Firing 并推送给 Alertmanager。

### 规则评估流程

```
每隔 evaluation_interval:
     │
     ▼
┌──────────────────────────────────┐
│  遍历所有 Rule Group             │
│  (按 group 内 interval 评估)     │
└─────────────┬────────────────────┘
              │
              ▼
┌──────────────────────────────────┐
│  对每条 rule 执行 PromQL 表达式   │
│  Recording → 结果写入 TSDB       │
│  Alerting  → 检查 for 持续时间   │
└─────────────┬────────────────────┘
              │
     ┌────────┴────────┐
     ▼                 ▼
 Recording          Alerting
 写入新 Series      Pending → Firing
                    推送至 Alertmanager
```

## Prometheus 在 Kubernetes 中的部署

### Prometheus Operator

Prometheus Operator 是 Kubernetes 上部署和管理 Prometheus 的标准方案，通过 CRD（Custom Resource Definition）声明式管理监控配置：

```
┌──────────────────────────────────────────────────────────┐
│                   Kubernetes Cluster                      │
│                                                          │
│  ┌───────────────────┐     Watch      ┌───────────────┐ │
│  │   Prometheus      │<───────────────│  CRD 资源      │ │
│  │   Operator        │                │               │ │
│  │                   │  Reconcile     │ Prometheus    │ │
│  │  - 生成配置       │──────────>     │ ServiceMonitor│ │
│  │  - 管理 StatefulSet│               │ PodMonitor    │ │
│  │  - 管理 RBAC      │                │ PrometheusRule│ │
│  └───────┬───────────┘                └───────────────┘ │
│          │                                               │
│          ▼                                               │
│  ┌───────────────┐    ┌──────────────┐                  │
│  │  Prometheus   │    │ Alertmanager │                  │
│  │  StatefulSet  │    │  StatefulSet │                  │
│  │  (自动生成     │    │  (自动生成    │                  │
│  │   配置和挂载)  │    │   配置)      │                  │
│  └───────────────┘    └──────────────┘                  │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

### ServiceMonitor CRD

ServiceMonitor 声明式定义如何发现和采集一组 Service 背后的 Pod 指标：

```yaml
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: my-app
  namespace: production
  labels:
    release: prometheus  # 匹配 Prometheus 的 serviceMonitorSelector
spec:
  selector:
    matchLabels:
      app: my-app
  namespaceSelector:
    matchNames:
      - production
  endpoints:
    - port: http-metrics
      path: /metrics
      interval: 15s
```

Operator 会自动将其转换为 Prometheus 的 `scrape_configs`，包括 Kubernetes SD 和 relabel 规则。

### PrometheusRule CRD

将 Recording Rules 和 Alerting Rules 也声明式管理：

```yaml
apiVersion: monitoring.coreos.com/v1
kind: PrometheusRule
metadata:
  name: api-rules
  labels:
    release: prometheus
spec:
  groups:
    - name: api.rules
      rules:
        - record: job:http_requests:rate5m
          expr: sum(rate(http_requests_total[5m])) by (job)
        - alert: HighErrorRate
          expr: job:http_error_ratio:rate5m > 0.05
          for: 5m
          labels:
            severity: critical
```

kube-prometheus-stack 将 Prometheus Operator、Alertmanager、Grafana、Node Exporter 及常用 Rules/ServiceMonitor 打包成一个完整的监控栈，一条 Helm 命令即可部署。

## 容量规划与性能调优

### 内存估算

Prometheus 的内存消耗主要来自 Active Series 的 Head Chunk：

```
估算公式: 内存 ≈ Active Series × ~3KB

示例:
- 100 万 Active Series ≈ 3GB 内存
- 500 万 Active Series ≈ 15GB 内存

建议: 分配估算值的 1.5~2 倍，为查询和规则评估预留缓冲
```

内存中主要包含：Head Chunk 数据、Series 索引（Label → Series 映射）、WAL 缓冲区、查询执行的工作内存。

### 磁盘估算

```
磁盘 ≈ samples/s × bytes/sample × 保留时间

经验值:
- 每个样本约 1~2 字节（压缩后）
- 实际占用受 Chunk 编码影响，平均约 1.5 bytes/sample

示例:
- 33,333 samples/s × 1.5 bytes × 86400s/天 × 30天
  ≈ 129 GB

建议: 预留 2~3 倍余量（考虑 Compaction、WAL、索引开销）
```

### 基数爆炸（Cardinality Explosion）

基数爆炸是 Prometheus 运维中最常见、最严重的问题。当某个标签的取值范围不受控制时，Series 数量急剧膨胀：

```
# 危险：user_id 有百万级取值
http_requests_total{method="GET", user_id="<百万种值>"}

# 每种 user_id × 每种 method = 200万 Series
# 内存消耗: 200万 × 3KB ≈ 6GB（仅一个指标）
```

常见原因：

- 用户 ID、请求 ID、IP 地址等高基数标签进入指标
- 未聚合的容器/Pod 指标在集群规模扩大时失控
- Histogram 的 Bucket 数量 × Label 组合数失控

### 高基数检测

Prometheus 提供内置工具检测高基数问题：

```promql
# 查看每个指标的时间序列数量
topk(20, count by (__name__)({__name__=~".+"}))

# 查看某个指标中哪个标签的基数最高
topk(10, count by (user_id) (http_requests_total))

# 查看标签值数量最多的指标
topk(20, count by (__name__) (http_requests_total))
```

Prometheus 3.x 提供了 `prometheus_tsdb_head_series` 和 `prometheus_tsdb_head_chunks` 等指标，可以实时监控 Head 中的 Series 和 Chunk 数量。同时 `/api/v1/status/tsdb` 端点提供了详细的基数统计，按指标和标签维度列出最高基数的 Series。

预防基数爆炸的原则：**在指标暴露阶段就控制标签取值范围**，而非在采集后处理。对于无法避免的高基数场景（如按用户维度分析），应考虑使用 VictoriaMetrics 或 Mimir 等支持高基数的后端，或通过 Native Histograms 将多 Series 收敛为单 Series。
