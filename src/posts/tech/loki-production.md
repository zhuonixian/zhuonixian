---
title: Loki 与 Promtail 生产实践
icon: gears
date: 2026-06-13
category:
  - 技术
tag:
  - Loki
  - Promtail
  - LogQL
  - 日志
  - 生产运维
---

# Loki 与 Promtail 生产实践

当你的集群有上百个服务、每天产生数 TB 日志时，Elasticsearch 的存储账单可能会让你怀疑人生。Loki 的设计哲学很简单：**只索引标签，不索引日志正文**。这意味着存储成本可以降到 Elasticsearch 的 1/10 甚至更低，但前提是你得用对。本文从采集、查询、告警到高可用部署，覆盖 Loki 在生产环境中的完整实践路径。

<!-- more -->

## 采集端：Promtail

### Promtail 架构

Promtail 是 Grafana Loki 官方推荐的日志采集 Agent，专为 Loki 设计。其内部处理流程如下：

```
┌──────────────┐    ┌──────────┐    ┌──────────────┐    ┌────────────┐
│   Service    │    │          │    │              │    │            │
│  Discovery   │───→│ Relabel  │───→│  Pipeline    │───→│   Loki     │
│              │    │          │    │  Stages      │    │   Client   │
└──────────────┘    └──────────┘    └──────────────┘    └────────────┘
  发现日志目标        过滤/重写         解析/提取/转换       批量写入 Loki
  (K8s/Journal/                       (regex/json/        (HTTP API)
   静态文件)                            labels/ts)
```

- **Service Discovery**：自动发现采集目标，支持 Kubernetes Pod、systemd Journal、静态文件路径
- **Relabel**：在采集前对标签进行过滤和重写，控制哪些标签最终发送给 Loki
- **Pipeline Stages**：对日志内容进行解析、提取、转换，是 Promtail 最核心的能力
- **Client**：通过 HTTP API 将处理后的日志批量推送到 Loki

### 日志发现

Promtail 支持三种主要的日志发现方式：

**Kubernetes Pod 日志**是云原生场景下最常见的模式。Promtail 通过 Kubernetes API 发现节点上的 Pod，自动挂载宿主机的 `/var/log/pods` 目录读取容器日志。每个 Pod 的 namespace、pod_name、container_name 会自动提取为标签。

**Journal** 用于采集 systemd 日志，适合物理机或需要采集系统级日志的场景。配置中指定 `journal` 类型即可。

**静态文件** 适用于传统部署模式，通过 `static_configs` 指定日志文件路径，配合 `__path__` 标签标记文件位置。

### Pipeline Stages 详解

Pipeline 是 Promtail 的核心能力，每个 Stage 按顺序对日志行进行处理。掌握这些 Stage 是用好 Promtail 的关键。

**docker / cri 日志格式解析**：Kubernetes 容器运行时会在日志行前添加时间戳和流类型前缀。CRI 格式（containerd 默认）形如 `2016-10-06T00:17:09.669794202Z stdout P content...`，需要用 `cri` stage 剥离前缀。Docker 格式则是 JSON 包装，用 `docker` stage 处理。

**regex / json / logfmt 解析**：这三种 Stage 用于从日志正文中提取结构化字段。`json` stage 自动解析 JSON 日志，`logfmt` 处理 key=value 格式，`regex` 用于任意格式的正则提取。提取出的字段可以在后续 Stage 中引用。

**labels**：将提取出的字段提升为 Loki 标签。注意，标签值 Cardinality 直接影响 Loki 性能，只应将低基数字段（如 hostname、log_level）设为标签。

**timestamp**：指定日志行的时间戳来源。如果不设置，Loki 使用收到日志的时间，这在日志延迟到达时会导致时间线错乱。

**metrics**：在采集端直接从日志生成 Prometheus 指标。适合做实时的日志计数和统计，无需在查询时再计算。

**drop / keep**：基于条件过滤日志行。`drop` 丢弃匹配的行，`keep` 只保留匹配的行。常用于过滤健康检查日志或 DEBUG 级别的噪音日志。

### 配置示例：K8s CRI 日志采集 + JSON 解析

以下是一个完整的 Promtail 配置，采集 Kubernetes CRI 格式的 Nginx access log，并解析 JSON 格式的日志内容：

```yaml
server:
  http_listen_port: 9080
  grpc_listen_port: 0

positions:
  filename: /tmp/positions.yaml

clients:
  - url: http://loki-gateway:80/loki/api/v1/push
    tenant_id: team-platform
    external_labels:
      cluster: prod-east

scrape_configs:
  - job_name: kubernetes-pods
    kubernetes_sd_configs:
      - role: pod
    pipeline_stages:
      # 1. 解析 CRI 日志格式，提取 timestamp 和 content
      - cri: {}

      # 2. 从 Pod annotation 中获取 pipeline 配置
      #    或直接在这里定义固定 pipeline
      - match:
          selector: '{app="nginx"}'
          stages:
            # 解析 JSON 格式的 access log
            - json:
                expressions:
                  remote_addr: remote_addr
                  request_method: request_method
                  request_uri: request_uri
                  status: status
                  body_bytes_sent: body_bytes_sent
                  request_time: request_time
                  upstream_response_time: upstream_response_time

            # 提取标签（仅低基数字段）
            - labels:
                status:
                request_method:

            # 设置时间戳
            - timestamp:
                source: timestamp
                format: RFC3339

            # 从日志生成指标
            - metrics:
                http_requests_total:
                  type: Counter
                  description: "Total HTTP requests"
                  config:
                    action: inc

            # 过滤健康检查
            - drop:
                expression: '.*kube-probe.*'

    relabel_configs:
      - source_labels:
          - __meta_kubernetes_pod_label_app
        target_label: app
      - source_labels:
          - __meta_kubernetes_namespace
        target_label: namespace
      - source_labels:
          - __meta_kubernetes_pod_name
        target_label: pod
      - source_labels:
          - __meta_kubernetes_pod_container_name
        target_label: container
```

### 多行日志处理

Java 堆栈跟踪、Python Traceback 等多行日志是日志采集的经典难题。Promtail 提供 `multiline` stage 来处理：

```yaml
- multiline:
    # 第一行以时间戳开头
    firstline: '^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}'
    max_wait_time: 3s
    max_lines: 128
```

`firstline` 是一个正则表达式，匹配新日志条目的第一行。所有不匹配的后续行会被合并到前一个条目中。`max_wait_time` 设置超时，防止最后一条日志被长时间阻塞。`max_lines` 限制单个条目的最大行数，避免异常巨大的堆栈撑爆内存。

## 其他采集客户端

Promtail 不是唯一选择。根据场景不同，其他采集客户端可能更合适。

### Fluent Bit

Fluent Bit 用 C 语言编写，内存占用极低（通常 5-10 MB），是嵌入式设备和资源受限环境的理想选择。它原生支持 Kubernetes，可以通过 `fluent-bit-loki` 输出插件直接将日志发送到 Loki。配置简洁，但 Pipeline 处理能力不如 Promtail 丰富。

### Vector

Vector 由 Datadog 开源，Rust 编写，性能出色。它的 Transform 组件提供了强大的日志处理能力，支持 remap（基于 VRL 脚本语言）、filter、route 等操作。如果你的日志处理逻辑复杂，Vector 的 VRL 脚本比 Promtail 的 YAML pipeline 灵活得多。输出端通过 `loki` sink 直接写入。

### OTEL Collector

OpenTelemetry Collector 提供了统一的采集框架，通过 `lokiexporter` 可以将日志发送到 Loki。如果你的团队已经在使用 OTEL 采集 Traces 和 Metrics，统一用 OTEL Collector 采集日志可以减少 Agent 数量。但 OTEL Collector 的日志处理 Pipeline 相对年轻，部分高级功能尚在完善中。

### 对比

| 维度 | Promtail | Fluent Bit | Vector |
|------|----------|------------|--------|
| **语言** | Go | C | Rust |
| **内存占用** | 中（30-80 MB） | 低（5-10 MB） | 中（30-60 MB） |
| **日志处理能力** | 丰富（Pipeline Stages） | 基础 | 最强（VRL 脚本） |
| **Loki 集成** | 原生最佳 | 插件支持 | Sink 支持 |
| **Kubernetes 支持** | 原生 | 原生 | 原生 |
| **性能吞吐** | 中 | 高（低资源） | 最高 |
| **适用场景** | Loki 首选方案 | 资源受限/嵌入式 | 复杂日志处理 |
| **社区活跃度** | 高（Grafana 官方） | 高（CNCF 毕业） | 高（Datadog 开源） |

选择建议：**与 Loki 深度集成选 Promtail，资源受限选 Fluent Bit，复杂处理逻辑选 Vector**。

## LogQL 查询语言

LogQL 是 Loki 的查询语言，语法借鉴了 PromQL，但专门为日志场景设计。理解 LogQL 是高效使用 Loki 的核心能力。

### 基本查询

LogQL 查询由两部分组成：**日志流选择器**和**过滤表达式**。

```
{app="nginx", namespace="production"} |= "error" | json | line_format "{{.request_method}} {{.request_uri}}"
```

- `{app="nginx", namespace="production"}` 是日志流选择器，通过标签筛选目标日志流
- `|= "error"` 是过滤表达式，保留包含 "error" 的日志行
- `| json` 解析 JSON 格式的日志
- `| line_format` 格式化输出

### 过滤操作符

| 操作符 | 含义 | 示例 |
|--------|------|------|
| `\|=` | 包含字符串 | `\|= "error"` |
| `!=` | 不包含字符串 | `!= "debug"` |
| `\|~` | 匹配正则 | `\|~ "error\|warn"` |
| `!~` | 不匹配正则 | `!~ "health"` |
| `\|json` | 解析 JSON | `\| json` |
| `\|logfmt` | 解析 logfmt | `\| logfmt` |
| `\|line_format` | 格式化输出 | `\| line_format "{{.msg}}"` |
| `\|label_format` | 重命名标签 | `\| label_format new=old` |

过滤操作符可以链式组合。一个好的实践是：**先写标签选择器缩小范围，再用 `|=` 做精确匹配，最后用 `|~` 做正则匹配**。操作符的顺序直接影响查询性能。

### 聚合查询

LogQL 支持与 PromQL 类似的聚合操作：

**count_over_time** 统计时间窗口内的日志条数：

```logql
count_over_time({app="nginx"} |= "error" [5m])
```

**rate** 计算日志速率（每秒条数）：

```logql
rate({app="nginx"} |= "error" [5m])
```

**聚合操作符** 对结果进行分组聚合：

```logql
# 按 status 统计错误日志总数
sum by (status) (count_over_time({app="nginx"} | json | status >= 500 [5m]))

# 按 pod 统计日志速率
sum by (pod) (rate({app="nginx"} [5m]))

# 按 namespace 统计独立 IP 数量
count by (namespace) (count_over_time({app="nginx"} | json | remote_addr [1h]))
```

### 指标查询

LogQL 的强大之处在于可以直接从非结构化日志中提取指标。这对于没有暴露 Prometheus 指标的服务尤其有用。

```logql
# Nginx 5xx 错误率
sum(rate({app="nginx"} | json | status >= 500 [5m]))
/
sum(rate({app="nginx"} | json [5m]))

# 按 URI 统计 P95 延迟
quantile_over_time(0.95, {app="nginx"} | json | request_time > 0 | unwrap request_time [5m]) by (request_uri)

# 异常日志 Top N（按 pod 排序）
topk(10, sum by (pod) (count_over_time({app="nginx"} |~ "(?i)error|exception|panic" [1h])))
```

### 实际场景示例

**场景一：统计 5xx 错误率**

```logql
(
  sum(rate({app="nginx", namespace="production"} | json | status >= 500 [5m]))
  /
  sum(rate({app="nginx", namespace="production"} | json [5m]))
) * 100
```

在 Grafana 中将此查询配置为面板，设置阈值：> 1% 为 Warning，> 5% 为 Critical。

**场景二：P95 延迟（从 access log 提取）**

```logql
quantile_over_time(0.95,
  {app="nginx"} | json
  | request_time > 0
  | unwrap request_time
  [5m]
) by (request_uri)
```

`unwrap` 关键字告诉 Loki 使用提取出的数值（request_time）进行计算，而不是简单地计算日志行数。

**场景三：异常日志 Top N**

```logql
topk(10,
  sum by (pod) (
    count_over_time(
      {namespace="production"}
      |~ "(?i)error|exception|panic|fatal"
      != "kube-probe"
      [1h]
    )
  )
)
```

这个查询先用正则匹配所有异常关键字，排除健康检查噪音，再按 Pod 统计并取 Top 10。

## 多租户与认证

Loki 从设计之初就考虑了多租户。在生产环境中，合理的租户隔离和认证机制是必须的。

### X-Scope-OrgID Header

Loki 通过 HTTP Header `X-Scope-OrgID` 来标识租户。每个写入和查询请求都必须携带这个 Header。Loki 内部根据这个 Header 将不同租户的数据完全隔离——不同的标签、不同的日志流、不同的存储路径。

```
# 写入时指定租户
curl -H "X-Scope-OrgID: team-platform" \
     -H "Content-Type: application/json" \
     -d '{"streams":[{"stream":{"app":"nginx"},"values":[["1609459200","log line"]]}}]' \
     http://loki:3100/loki/api/v1/push
```

### Loki Gateway (Nginx) 认证

Loki 本身不处理认证，官方推荐通过 Nginx Gateway 层代理实现：

```nginx
upstream loki {
    server loki-read:3100;
    server loki-write:3100;
}

server {
    listen 80;
    server_name loki.internal.example.com;

    # 认证配置
    auth_request /auth;

    location /auth {
        internal;
        proxy_pass http://auth-service:8080/verify;
        proxy_pass_request_body off;
        proxy_set_header Content-Length "";
        proxy_set_header X-Original-URI $request_uri;
    }

    # 写入路径
    location /loki/api/v1/push {
        proxy_pass http://loki-write:3100$request_uri;
        proxy_set_header X-Scope-OrgID $http_x_scope_orgid;
    }

    # 查询路径
    location /loki/api/v1/query_range {
        proxy_pass http://loki-read:3100$request_uri;
        proxy_set_header X-Scope-OrgID $http_x_scope_orgid;
    }
}
```

### 与 Grafana 多租户集成

在 Grafana 的数据源配置中，可以指定 Loki 的租户 ID：

```yaml
apiVersion: 1
datasources:
  - name: Loki-Team-Platform
    type: loki
    url: http://loki-gateway:80
    jsonData:
      httpHeaderName1: X-Scope-OrgID
    secureJsonData:
      httpHeaderValue1: team-platform
```

每个团队配置独立的 Loki 数据源，指向同一个 Loki 集群但使用不同的 `X-Scope-OrgID`，实现租户级的数据隔离。

## Loki 告警

### Loki Ruler

Loki Ruler 组件持续评估 LogQL 规则，当条件满足时触发告警。它支持两种模式：

- **路径一**：直接将告警发送给 Alertmanager（推荐）
- **路径二**：将规则评估委托给 Cortex/Mimir 的 Ruler

### Recording Rules

Recording Rules 将频繁执行的 LogQL 查询预计算为 Prometheus 指标，存储在 Loki 内部或推送到远程 Prometheus。这样可以避免每次在 Grafana 面板中重复执行昂贵的查询：

```yaml
groups:
  - name: nginx_metrics
    interval: 1m
    rules:
      - record: nginx:requests:rate5m
        expr: sum(rate({app="nginx"} | json [5m]))

      - record: nginx:errors:rate5m
        expr: sum(rate({app="nginx"} | json | status >= 500 [5m]))

      - record: nginx:error_ratio:rate5m
        expr: |
          sum(rate({app="nginx"} | json | status >= 500 [5m]))
          /
          sum(rate({app="nginx"} | json [5m]))
```

### 告警规则配置示例

```yaml
groups:
  - name: nginx_alerts
    interval: 1m
    rules:
      - alert: HighErrorRate
        expr: |
          (
            sum(rate({app="nginx"} | json | status >= 500 [5m]))
            /
            sum(rate({app="nginx"} | json [5m]))
          ) > 0.05
        for: 5m
        labels:
          severity: critical
          team: platform
        annotations:
          summary: "Nginx 5xx error rate exceeds 5%"
          description: >
            Nginx 5xx error rate is {{ $value | printf "%.2f" }}%
            on cluster {{ $labels.cluster }}.
            Check logs: {app="nginx"} | json | status >= 500

      - alert: HighLogLatency
        expr: |
          quantile_over_time(0.95,
            {app="nginx"} | json
            | unwrap request_time
            [5m]
          ) > 2
        for: 10m
        labels:
          severity: warning
          team: platform
        annotations:
          summary: "Nginx P95 latency exceeds 2s"
```

### 与 Alertmanager 集成

Loki Ruler 的告警通过 Alertmanager 进行路由、去重和通知。在 Loki 配置中指定 Alertmanager 地址：

```yaml
ruler:
  alertmanager_url: http://alertmanager:9093
  enable_alertmanager_v2: true
  storage:
    type: s3
    s3:
      bucketnames: loki-rules
      endpoint: s3.amazonaws.com
  rule_path: /loki/rules
```

Alertmanager 收到告警后，根据路由规则分发到 Slack、PagerDuty、邮件等接收器。

## 性能调优

Loki 的性能很大程度上取决于你如何使用它。以下是从写入、查询、存储三个维度的调优经验。

### 写入优化

**控制标签基数** 是最重要的优化。Loki 的性能与 label 的唯一组合数（stream 数量）成正比。每多一个高基数标签（如 user_id、request_id），stream 数量可能从几百暴涨到百万级。

```
# 错误做法：将 request_id 作为标签
{app="nginx", request_id="abc123"}  ← 每个 request_id 创建一个 stream

# 正确做法：request_id 留在日志正文中，用 |json 在查询时提取
{app="nginx"} | json | request_id="abc123"
```

一般原则：**stream 数量控制在每个租户 10 万以内**。超过这个数值，Ingester 的内存和写入延迟会显著上升。

**日志流水线优化**：减少不必要的 Pipeline Stage。每个 Stage 都有 CPU 开销，特别是 `regex` Stage。能用 `json` 或 `logfmt` 解析的就不要用 `regex`。在 `match` Stage 中用 `selector` 提前过滤，避免对不相关的日志执行 Stage。

**批量写入和压缩**：Promtail 默认批量大小为 100 条或 1 MB，可以通过 `batch_size` 和 `batch_wait` 调整。在日志量大的场景下，适当增大批量可以减少 HTTP 请求次数：

```yaml
clients:
  - url: http://loki:3100/loki/api/v1/push
    batch_size: 1048576    # 1 MB
    batch_wait: 5s         # 最多等待 5s
    compress_labels: true  # 启用标签压缩
```

### 查询优化

**限制查询范围**：最有效的优化就是缩小查询范围。总是指定时间范围和尽可能多的标签。避免全表扫描：

```logql
# 差：全范围扫描
{namespace=~".+"} |= "error"

# 好：精确标签 + 时间限制
{app="nginx", namespace="production"} |= "error"
```

**Query Frontend 缓存**：Query Frontend 可以缓存查询结果，相同的查询在缓存有效期内直接返回。配置 `query_range.results_cache.cache` 启用。

**split_queries_by_interval**：将长时间范围的查询拆分为多个短时间范围的子查询并行执行。配置 `split_queries_by_interval = 30m` 会将 24 小时的查询拆分为 48 个 30 分钟的子查询，在 Querier 间并行处理，大幅降低尾延迟。

### 存储优化

**Compactor 压缩策略**：Compactor 将小 chunk 合并为大 chunk，减少存储对象数量并加速查询。建议配置：

```yaml
compactor:
  working_directory: /loki/compactor
  compaction_interval: 10m
  retention_enabled: true
  retention_delete_delay: 2h
  delete_request_cancel_period: 24h
```

**保留策略（Retention）**：根据业务需求设置不同租户的日志保留时间：

```yaml
limits_config:
  retention_period: 30d          # 全局默认 30 天
  per_tenant_override_config: /etc/loki/overrides.yaml
```

```yaml
# overrides.yaml
overrides:
  team-audit:
    retention_period: 365d       # 审计日志保留一年
  team-dev:
    retention_period: 7d         # 开发环境保留一周
```

**S3 生命周期管理**：配合 S3 的生命周期策略，对过期数据自动降级存储或删除：

```json
{
  "Rules": [
    {
      "ID": "LokiChunkTransition",
      "Status": "Enabled",
      "Transitions": [
        {
          "Days": 30,
          "StorageClass": "STANDARD_IA"
        },
        {
          "Days": 90,
          "StorageClass": "GLACIER"
        }
      ]
    }
  ]
}
```

30 天后转低频存储，90 天后转 Glacier。配合 Compactor 的 Retention，热数据走快速查询，冷数据低成本归档。

## 高可用部署

生产环境的 Loki 需要处理写入失败、查询超时、节点故障等场景。以下是推荐的 HA 架构。

### 架构图

```
                         ┌──────────────┐
                         │   Grafana    │
                         │  (查询入口)   │
                         └──────┬───────┘
                                │
                         ┌──────▼───────┐
                         │    Nginx     │
                         │   Gateway    │
                         │  (认证/路由)  │
                         └──┬───────┬───┘
                            │       │
                 ┌──────────▼─┐  ┌──▼──────────┐
                 │   Query     │  │   Write     │
                 │  Frontend   │  │   Path      │
                 │  (排队/缓存) │  │             │
                 └──────┬──────┘  └──────┬──────┘
                        │                │
              ┌─────────▼──┐      ┌──────▼─────────┐
              │  Querier   │      │  Distributor   │
              │  (x N)     │      │  (x 2)         │
              └──────┬─────┘      └──────┬─────────┘
                     │                   │
                     │    ┌──────────────▼──────────────┐
                     │    │        Ingester             │
                     └────│    (x 3, RF=3, Quorum=2)    │
                          │   ┌─────┬─────┬─────┐      │
                          │   │ I1  │ I2  │ I3  │      │
                          │   └──┬──┴──┬──┴──┬──┘      │
                          └──────┼─────┼─────┼─────────┘
                                 │     │     │
                          ┌──────▼─────▼─────▼──────┐
                          │     Object Storage       │
                          │   (S3 / MinIO / GCS)     │
                          └─────────────────────────┘
```

### Ingester 多副本

Ingester 是写入路径的核心。采用三副本写入（Replication Factor = 3），写入 Quorum = 2。即日志写入三个 Ingester 中的两个成功即可返回。当某个 Ingester 故障时，另外两个仍能提供完整数据。

```yaml
ingester:
  lifecycler:
    ring:
      kvstore:
        store: memberlist
      replication_factor: 3
  chunk_idle_period: 5m
  chunk_max_age: 12h
```

关键参数说明：
- `chunk_idle_period`：chunk 最长空闲时间，超时后 flush 到存储
- `chunk_max_age`：chunk 最大存活时间，无论是否写满都会 flush

### Querier 自动扩展

Querier 是无状态组件，可以根据查询队列深度自动扩展。配合 Query Frontend 的 `max_outstanding_per_tenant` 参数控制每个租户的并发查询数，防止单个重查询压垮集群。

```yaml
query_range:
  max_outstanding_per_tenant: 100
  split_queries_by_interval: 30m
  cache_results: true

querier:
  max_concurrent: 20
```

### Query Frontend 查询排队

Query Frontend 是查询路径的入口，承担三个职责：

1. **查询排队**：将查询请求排队，控制并发数，避免 Querier 过载
2. **查询拆分**：按时间区间拆分大查询，并行执行后合并结果
3. **结果缓存**：缓存查询结果，重复查询直接返回

```
Query Request → Frontend (排队/拆分) → Worker Pool (Querier 集群) → Result
                     │
                     └→ Cache Hit? → Direct Return
```

部署建议：Query Frontend 部署 2-3 个副本，通过 `--query-frontend.downstream-url` 指向 Querier 的 Service。Querier 使用 `--querier.frontend-address` 注册为 Worker。这样的架构可以让查询能力随 Querier 数量线性扩展。
