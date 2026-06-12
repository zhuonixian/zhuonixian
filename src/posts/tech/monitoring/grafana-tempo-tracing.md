---
title: Grafana Tempo 分布式追踪
icon: route
date: 2026-06-13
category:
  - 技术
tag:
  - Tempo
  - 分布式追踪
  - OpenTelemetry
  - Jaeger
  - 可观测性
---

# Grafana Tempo 分布式追踪

在微服务架构下，一个用户请求可能穿越十几个服务，当出现延迟或错误时，靠日志逐个排查如同大海捞针。分布式追踪（Distributed Tracing）通过记录请求在每一跳的耗时与状态，将散落的调用片段串联成完整链路，是可观测性体系中不可或缺的一环。Grafana Tempo 作为 Grafana Labs 推出的开源分布式追踪后端，以无索引架构和对象存储为基础，大幅降低了追踪数据的存储成本，同时与 Grafana 生态深度集成。

<!-- more -->

## 分布式追踪基础

### 为什么需要分布式追踪

单体应用中，一次请求的处理逻辑集中在一个进程内，调用栈清晰可辨。微服务拆分后，同样的请求变成了一系列跨网络的 RPC 调用：

```
Client → API Gateway → Service A → Service B → DB
                     └→ Service C → Cache
```

当这个请求返回 500 或响应时间飙到 3 秒时，你需要知道：

- 哪个服务是瓶颈？
- 哪个环节出了错？
- 调用链中哪一步最耗时？

日志和指标能回答部分问题，但无法自动关联。分布式追踪的核心价值就是**自动串联跨服务调用**，让你看到完整的请求生命周期。

### 核心概念：Trace、Span、SpanContext

```
Trace（一次完整请求的链路）
├── Span A（API Gateway，root span）
│   ├── Span B（Service A 处理）
│   │   ├── Span D（Service B 调用）
│   │   │   └── Span F（DB 查询）
│   │   └── Span E（Service C 调用）
│   │       └── Span G（Cache 读取）
│   └── ...
│
每个 Span 包含：
- TraceID：标识整条链路，全局唯一
- SpanID：标识当前操作
- ParentSpanID：指向父 Span，构成树形关系
- Operation Name：操作名称
- Start Time / Duration：起止时间
- Tags / Attributes：结构化元数据（http.status_code 等）
- Status：OK / Error
```

**SpanContext** 是 Span 中需要跨进程传播的部分，包含 TraceID、SpanID 和采样标志。它通过 HTTP Header 或 gRPC metadata 在服务间传递：

```
Service A ──HTTP──→ Service B

请求 Header 中注入：
  traceparent: 00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01
                │  │                         │                │   │
                版本  TraceID                ParentSpanID     采样标志
```

这就是所谓的 **Context Propagation**，是分布式追踪能够跨服务串联请求的基础机制。

## Tempo 设计理念

### 无索引架构

传统追踪系统（如 Jaeger、Zipkin）为了支持多维度查询，会对 Span 的标签、服务名、操作名等建立倒排索引。索引带来了灵活查询能力，但也带来了问题：

- 索引存储开销大，通常与数据量成正比
- 索引维护消耗 CPU 和内存
- 追踪数据量大时，索引本身成为成本瓶颈

Tempo 的核心设计决策是**不建任何索引**，只依赖 TraceID 进行查询。这意味着：

- 存储成本接近原始数据压缩后的成本
- 部署和运维大幅简化
- 查询必须提供 TraceID（或使用 TraceQL）

### 与 Loki 标签关联查找 TraceID

既然只能按 TraceID 查询，那如何找到感兴趣的 TraceID？Tempo 的答案是**借助日志系统**：

```
应用日志中记录 TraceID：
  2026-06-13 10:23:45 [INFO] request completed trace_id=4bf92f3577b34da6a3ce929d0e0e4736 status=500

在 Loki 中搜索错误日志：
  {app="api-gateway"} |= "status=500" | extract trace_id=(?P<trace_id>\w+)

从日志中拿到 TraceID，再到 Tempo 查完整链路
```

Grafana Explore 原生支持从 Logs 跳转到 Traces 的联动操作，实现了日志与追踪的无缝衔接。

### 对象存储后端

Tempo 将追踪数据写入对象存储（S3、GCS、MinIO、Azure Blob），利用对象存储的低成本和高持久性：

- 无需管理独立的存储集群
- 数据自动压缩，存储成本比传统方案低一个数量级
- 与 Grafana Mimir（指标）、Loki（日志）共享相同的存储基础设施

### 协议兼容

Tempo 兼容主流追踪协议的接收端：

- **Jaeger**（UDP/HTTP/gRPC）
- **Zipkin**（HTTP）
- **OpenTelemetry**（OTLP gRPC/HTTP）
- **OpenCensus**

现有使用 Jaeger 或 Zipkin SDK 的应用，只需将上报地址改为 Tempo 即可，无需改动代码。

## Tempo 架构

### 组件总览

```
                          ┌──────────────────────────────────────────────────────────┐
                          │                    Grafana Tempo                          │
                          │                                                          │
  App                     │  ┌────────────┐     ┌────────────┐     ┌──────────────┐  │
  SDK ──→ OTEL Collector ─┼─→│ Distributor │────→│  Ingester  │────→│ Object Store │  │
                            │ └────────────┘     └─────┬──────┘     │  (S3/GCS)    │  │
                            │                          │             └──────┬───────┘  │
                            │                          │                    │          │
                            │  ┌──────────────────┐   │                    │          │
                            │  │ Query Frontend   │   │                    │          │
                            │  │  (查询调度/拆分)  │   │                    │          │
                            │  └────────┬─────────┘   │                    │          │
                            │           │              │                    │          │
                            │           ▼              │                    │          │
                            │  ┌────────────┐         │                    │          │
                            │  │  Querier   │←────────┘                    │          │
                            │  │ (按TraceID │←─────────────────────────────┘          │
                            │  │   查询)    │        从存储读取 Trace 数据             │
                            │  └────────────┘                                           │
                            │                                                          │
                            │  ┌────────────┐                                          │
                            │  │ Compactor  │────→ 压缩合并存储块，降低存储占用         │
                            │  └────────────┘                                          │
                            └──────────────────────────────────────────────────────────┘
```

各组件职责：

| 组件 | 职责 |
|------|------|
| **Distributor** | 接收 Span 数据，校验格式，按 TraceID 哈希分片到 Ingester |
| **Ingester** | 在内存中聚合完整 Trace，达到条件后刷新到对象存储 |
| **Querier** | 接收 TraceID，从 Ingester（热数据）或对象存储（冷数据）查询 Trace |
| **Query Frontend** | 查询调度，将大查询拆分为子查询，提供队列和缓存机制 |
| **Compactor** | 压缩存储块，合并小文件，清理过期数据 |

### 数据流

```
1. 应用 SDK 产生 Span
         │
         ▼
2. OTEL Collector 接收、处理、转发
         │
         ▼
3. Tempo Distributor 校验并路由
         │
         ▼
4. Ingester 在内存中聚合（约 30s 窗口）
         │
         ▼
5. 刷新到对象存储（S3/GCS/MinIO）
         │
         ▼
6. Compactor 后台压缩、保留策略清理
```

Ingester 采用 WAL（Write-Ahead Log）保证数据安全，在刷新到对象存储之前，数据不会丢失。

## Trace 查找策略

### 直接 TraceID 查找

最直接的方式：你已经知道 TraceID，直接在 Grafana Explore 中输入查询。

适用场景：日志中已记录 TraceID，或从错误告警中获取。

### TraceQL 查询语言

Tempo 2.0 引入了 TraceQL，支持对 Trace 数据进行结构化查询，无需预建索引：

```
# 查找所有 HTTP 500 错误的 Span
{span.http.status_code = 500}

# 查找特定服务的特定操作
{resource.service.name = "api-gateway" && span.name = "GET /users"}

# 查找耗时超过 1 秒的 Span
{span.duration > 1s}

# 组合条件：特定服务中的错误
{resource.service.name = "order-service" && status = error}

# 嵌套查询：查找包含子 Span 错误的 Trace
{span.name = "POST /checkout" && child({status = error})}
```

TraceQL 的查询能力覆盖了大部分日常排障需求，同时不需要额外维护索引。

### Loki → Tempo 关联

在 Grafana Explore 中配置 Logs → Traces 关联：

```
1. 应用日志中输出 TraceID（通常注入到结构化日志的 trace_id 字段）
2. Loki 数据源中配置 derived field，提取 TraceID
3. Grafana 自动在日志行旁显示追踪跳转按钮
4. 点击跳转到 Tempo 数据源，展示完整 Trace 链路
```

这种 Logs → Traces 的联动模式是 Grafana 可观测性栈的核心工作流之一。

## Kubernetes 部署

### Helm Chart 部署

```yaml
# values-tempo.yaml
tempo:
  repository: grafana/tempo
  tag: 2.6.0
  resources:
    requests:
      cpu: "1"
      memory: 2Gi
    limits:
      cpu: "2"
      memory: 4Gi

tempoQuery:
  enabled: true
  repository: grafana/tempo-query
  tag: 2.6.0

# 对象存储配置
storage:
  trace:
    backend: s3
    s3:
      bucket: tempo-traces
      endpoint: minio.infra.svc.cluster.local:9000
      access_key: ${MINIO_ACCESS_KEY}
      secret_key: ${MINIO_SECRET_KEY}
      insecure: true

# 保留策略
retention:
  traces: 168h  # 7 天

# Ingester 配置
ingester:
  trace_idle_period: 30s
  max_block_bytes: 104857600  # 100MB
  max_block_duration: 30m

# Distributor 配置
distributor:
  receivers:
    otlp:
      protocols:
        grpc:
          endpoint: 0.0.0.0:4317
        http:
          endpoint: 0.0.0.0:4318
    jaeger:
      protocols:
        grpc:
          endpoint: 0.0.0.0:14250
        thrift_http:
          endpoint: 0.0.0.0:14268

# Query Frontend 配置
queryFrontend:
  max_outstanding_per_tenant: 2000
  search:
    max_duration: 12h
```

部署命令：

```bash
helm repo add grafana https://grafana.github.io/helm-charts
helm repo update
helm install tempo grafana/tempo-distributed -n observability -f values-tempo.yaml
```

### 与 Grafana 集成

在 Grafana 中添加 Tempo 数据源：

```yaml
# Grafana provisioning datasources
apiVersion: 1
datasources:
  - name: Tempo
    type: tempo
    access: proxy
    url: http://tempo-query-frontend.observability.svc.cluster.local:3100
    jsonData:
      tracesToMetrics:
        datasourceUid: prometheus
      tracesToLogs:
        datasourceUid: loki
        spanStartTimeShift: '-1h'
        spanEndTimeShift: '1h'
        filterByTraceID: true
        filterBySpanID: true
      nodeGraph:
        enabled: true
      search:
        hide: false
      traceQuery:
        timeShiftEnabled: true
        spanBar:
          type: Tag
          tag: http.path
```

## 与应用集成

### OpenTelemetry SDK 自动注入

各语言的集成方式：

```
┌───────────────┐    ┌──────────────────┐    ┌──────────────────┐
│  Application  │───→│  OTEL SDK/Agent  │───→│  OTEL Collector  │───→ Tempo
│  (任何语言)    │    │  (自动注入)       │    │  (中继处理)       │
└───────────────┘    └──────────────────┘    └──────────────────┘
```

**Java**：使用 OTEL Java Agent，无需改代码：

```bash
java -javaagent:opentelemetry-javaagent.jar \
     -Dotel.service.name=order-service \
     -Dotel.exporter.otlp.endpoint=http://otel-collector:4317 \
     -jar app.jar
```

**Python**：

```python
# pip install opentelemetry-distro opentelemetry-exporter-otlp
from opentelemetry import trace
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.resources import Resource
from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter
from opentelemetry.sdk.trace.export import BatchSpanProcessor

resource = Resource.create({"service.name": "order-service"})
provider = TracerProvider(resource=resource)
processor = BatchSpanProcessor(OTLPSpanExporter(endpoint="http://otel-collector:4317"))
provider.add_span_processor(processor)
trace.set_tracer_provider(provider)
```

**Go**：

```go
import (
    "go.opentelemetry.io/otel"
    "go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracegrpc"
    sdktrace "go.opentelemetry.io/otel/sdk/trace"
)

func initTracer() func() {
    exporter, _ := otlptracegrpc.New(context.Background(),
        otlptracegrpc.WithEndpoint("otel-collector:4317"),
        otlptracegrpc.WithInsecure(),
    )
    provider := sdktrace.NewTracerProvider(
        sdktrace.WithBatcher(exporter),
    )
    otel.SetTracerProvider(provider)
    return func() { provider.Shutdown(context.Background()) }
}
```

### OTEL Collector 配置

OTEL Collector 作为中继层，负责接收、处理和转发追踪数据：

```yaml
# otel-collector-config.yaml
receivers:
  otlp:
    protocols:
      grpc:
        endpoint: 0.0.0.0:4317
      http:
        endpoint: 0.0.0.0:4318

processors:
  batch:
    timeout: 5s
    send_batch_size: 1024
  memory_limiter:
    check_interval: 1s
    limit_mib: 512
  # 添加 Kubernetes 元数据
  k8s_attributes:
    auth_type: serviceAccount
    passthrough: false
    filter:
      node_from_env_var: K8S_NODE_NAME

exporters:
  otlp/tempo:
    endpoint: tempo-distributor.observability.svc.cluster.local:4317
    tls:
      insecure: true
  # 同时发送到 Prometheus 用于 span metrics
  prometheusremotewrite:
    endpoint: http://mimir.nginx.svc.cluster.local:8080/api/v1/push

service:
  pipelines:
    traces:
      receivers: [otlp]
      processors: [memory_limiter, k8s_attributes, batch]
      exporters: [otlp/tempo]
    metrics:
      receivers: [otlp]
      processors: [memory_limiter, batch]
      exporters: [prometheusremotewrite]
```

在 Kubernetes 中部署 OTEL Collector：

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: otel-collector
  namespace: observability
spec:
  replicas: 2
  selector:
    matchLabels:
      app: otel-collector
  template:
    metadata:
      labels:
        app: otel-collector
    spec:
      serviceAccountName: otel-collector
      containers:
        - name: collector
          image: otel/opentelemetry-collector-contrib:0.110.0
          ports:
            - containerPort: 4317
            - containerPort: 4318
          resources:
            requests:
              cpu: "500m"
              memory: 512Mi
            limits:
              cpu: "1"
              memory: 1Gi
          volumeMounts:
            - name: config
              mountPath: /etc/otelcol
      volumes:
        - name: config
          configMap:
            name: otel-collector-config
```

## 与 Jaeger / Zipkin 对比

| 维度 | Grafana Tempo | Jaeger | Zipkin |
|------|--------------|--------|--------|
| **存储后端** | 对象存储（S3/GCS） | Elasticsearch / Cassandra / Kafka | Elasticsearch / Cassandra |
| **索引机制** | 无索引，仅 TraceID 查询 | 多维度倒排索引 | 多维度索引 |
| **存储成本** | 低（原始数据 + 压缩） | 高（索引 + 数据双重开销） | 中等 |
| **查询方式** | TraceID / TraceQL | 多维度查询 / Jaeger UI | 多维度查询 / Zipkin UI |
| **部署复杂度** | 低（组件少，依赖对象存储） | 中（依赖 ES/Cassandra） | 中 |
| **协议支持** | OTLP / Jaeger / Zipkin | Jaeger / Zipkin / W3C | Zipkin / Brave |
| **采样策略** | 下游控制（OTEL SDK） | 前端 / 后端 / 自适应采样 | 前端采样 |
| **Grafana 集成** | 原生支持 | 需插件 | 需插件 |
| **适合场景** | 高吞吐、低成本、Grafana 生态 | 复杂查询需求、灵活采样 | 轻量级追踪 |

### 迁移路径

从 Jaeger 迁移到 Tempo：

```
1. 部署 Tempo，配置 Jaeger 接收协议
2. 将 Jaeger Agent/Collector 的上报地址切换到 Tempo Distributor
3. 验证数据写入和查询正常
4. 下线 Jaeger 组件
5. 逐步启用 TraceQL 和 Grafana 联动功能
```

由于 Tempo 兼容 Jaeger 的 gRPC/HTTP 协议，迁移过程对应用透明，SDK 无需任何改动。关键点是确保 Tempo 的 Distributor 端口与原 Jaeger Collector 保持一致。
