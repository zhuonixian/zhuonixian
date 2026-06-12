---
title: OpenTelemetry 可观测性统一实践
icon: satellite-dish
date: 2026-06-13
category:
  - 技术
tag:
  - OpenTelemetry
  - OTel
  - 可观测性
  - Tracing
  - Metrics
---

# OpenTelemetry 可观测性统一实践

如果你的微服务链路出了问题，排查时需要打开 Jaeger 查 Trace、切到 Grafana 看 Metrics、再跳到 ELK 搜 Logs——三条数据各自为战，靠人肉关联 TraceID，这就是可观测性碎片化的典型困境。OpenTelemetry（OTel）正是为了终结这种混乱而生：统一采集标准，解耦 SDK 与后端，让 Metrics、Logs、Traces 三种信号共享同一套语义和管线。

<!-- more -->

## OpenTelemetry 项目概述

OpenTelemetry 是 CNCF 旗下活跃度仅次于 Kubernetes 的项目，由 OpenTracing 和 OpenCensus 两个项目合并而来。OpenTracing 提供了统一的 Tracing API 但没有实现；OpenCensus 由 Google 发起，同时覆盖 Traces 和 Metrics 但社区生态有限。2019 年，两方决定合并，形成了 OpenTelemetry，继承了前者的 API 设计理念和后者的多信号采集能力。

OTel 的目标很明确：

- **统一三种信号**：Metrics、Logs、Traces 使用同一套 API、SDK 和 Collector
- **解耦后端**：应用代码只对接 OTel SDK，数据可以导出到任意后端（Jaeger、Tempo、Loki、Prometheus、Elasticsearch……）
- **消除厂商锁定**：不再因为换一个监控系统就要改业务代码
- **减少多 SDK 维护**：一套 SDK 覆盖所有可观测性需求

整体架构分为三层：

```
┌─────────────────────────────────────────────────┐
│                   OTel API                      │
│  （语言无关的接口定义，开发者直接使用）               │
├─────────────────────────────────────────────────┤
│                   OTel SDK                      │
│  （API 的具体实现：采集、批处理、导出）              │
├─────────────────────────────────────────────────┤
│                OTel Collector                    │
│  （独立采集器：接收、处理、路由、导出）              │
└─────────────────────────────────────────────────┘
```

应用进程内由 SDK 负责埋点和初步聚合，SDK 通过 OTLP 协议把数据发给 Collector，Collector 再路由到各种后端存储。

## OTel 核心概念

### Signal：三种可观测性信号

```
┌──────────────────────────────────────────────────────┐
│                   OpenTelemetry                       │
│                                                      │
│   ┌──────────┐   ┌──────────┐   ┌──────────┐        │
│   │  Traces   │   │  Metrics │   │   Logs   │        │
│   │  链路追踪  │   │   指标    │   │   日志   │        │
│   └──────────┘   └──────────┘   └──────────┘        │
│        │               │               │             │
│        └───────┬───────┴───────┬───────┘             │
│                │               │                     │
│          Context Propagation（上下文传播）             │
│                │               │                     │
│         Resource（资源标识：服务名、版本、主机）        │
└──────────────────────────────────────────────────────┘
```

- **Traces**：一个请求在分布式系统中的完整路径，由多个 Span 组成
- **Metrics**：在时间间隔内测量的数值聚合（Counter、Histogram、Gauge）
- **Logs**：带时间戳的结构化文本记录，可以关联到 Trace

### API vs SDK vs Collector

| 层级 | 职责 | 说明 |
|------|------|------|
| **API** | 接口定义 | Tracer、Meter、Logger 等接口，不产生数据 |
| **SDK** | 具体实现 | 控制采样、批处理、Span 处理管道、Exporter 选择 |
| **Collector** | 独立代理 | 接收多来源数据，处理后导出到多后端 |

### Context Propagation（上下文传播）

分布式链路追踪的核心难题：请求从服务 A 调到服务 B，如何让 B 知道自己属于哪条 Trace？答案是 Context Propagation——在跨进程调用时，把 TraceID 和 SpanID 通过 HTTP Header 或 gRPC metadata 传递下去。

支持的传播格式：

- **W3C TraceContext**：OTel 默认格式，Header 名为 `traceparent`，标准化程度最高
- **B3**（Zipkin）：`X-B3-TraceId`、`X-B3-SpanId`，兼容存量系统
- **Jaeger Propagator**：`uber-trace-id`，用于 Jaeger 生态迁移

### Resource（资源）

Resource 是一组静态键值对，标识产生遥测数据的实体。每条 Span、Metric 数据点、Log 记录都会自动附上 Resource 属性：

```
service.name = order-service
service.version = v2.3.1
host.name = node-03
k8s.pod.name = order-service-7b8f9c-x2k
k8s.namespace.name = production
```

## OTel Collector 架构

Collector 是 OTel 的核心基础设施组件，采用 Receiver → Processor → Exporter 管道模型：

```
                    ┌─────────────────────────────────────────┐
                    │           OTel Collector                 │
                    │                                         │
  OTLP/gRPC ──→ ┌──────┐   ┌───────────┐   ┌──────────┐    │
  Prometheus ──→ │Recvrs│──→│Processors │──→│Exporters │──→ Tempo
  Jaeger ──→    │      │   │           │   │          │──→ Loki
  Zipkin ──→    │      │   │ batch     │   │          │──→ Prometheus
  Filelog ──→   │      │   │ mem_limit │   │          │──→ Elasticsearch
                └──────┘   │ attributes│   │          │──→ ...
                           │ filter    │   └──────────┘    │
                           │ tail_samp │                     │
                           └───────────┘                     │
                    └─────────────────────────────────────────┘
```

### Receiver（接收器）

负责从各种来源拉取或接收数据。常用 Receiver：

- `otlp`：接收 OTLP/gRPC 和 OTLP/HTTP 数据，Collector 的原生协议
- `prometheus`：抓取 Prometheus 暴露的 `/metrics` 端点
- `jaeger`：接收 Jaeger 格式的 Trace 数据（gRPC、Thrift、HTTP）
- `zipkin`：接收 Zipkin v2 格式
- `filelog`：读取容器或主机日志文件

### Processor（处理器）

在数据导出前进行处理和增强：

- `batch`：将数据打包发送，减少网络请求次数，降低后端压力
- `memory_limiter`：内存超限时拒绝数据，防止 Collector OOM
- `attributes`：增删改数据属性，如给所有 Span 打上环境标签
- `filter`：按条件过滤数据，丢弃不需要的 Span 或 Metric
- `tail_sampling`：根据完整 Trace 的特征决定是否采样（需要等所有 Span 到齐）

### Exporter（导出器）

将处理后的数据发送到后端存储：

- `otlp`：导出到支持 OTLP 的后端（Tempo、Jaeger、SigNoz）
- `prometheus`：暴露 Prometheus 可抓取的 metrics 端点
- `loki`：导出日志到 Grafana Loki
- `elasticsearch`：导出到 Elasticsearch/OpenSearch

### Connector（连接器）

Connector 是一种特殊的组件，它同时充当 Exporter 和 Receiver，可以在不同 Signal 之间转换数据。最典型的是 `spanmetrics` Connector——从 Trace 数据中自动生成 RED 指标（Rate、Error、Duration），无需在应用中单独埋点。

### YAML 配置示例

```yaml
receivers:
  otlp:
    protocols:
      grpc:
        endpoint: 0.0.0.0:4317
      http:
        endpoint: 0.0.0.0:4318
  filelog:
    include: [/var/log/pods/*/*/*.log]
    start_at: beginning
    operators:
      - type: router
        routes:
          - output: container_parser
            expr: 'body matches "^\\{"'

processors:
  batch:
    send_batch_size: 1024
    timeout: 5s
  memory_limiter:
    check_interval: 1s
    limit_mib: 512
  attributes:
    actions:
      - key: env
        value: production
        action: upsert
  tail_sampling:
    decision_wait: 10s
    policies:
      - name: error-policy
        type: status_code
        status_code:
          status_codes:
            - ERROR
      - name: slow-policy
        type: latency
        latency:
          threshold_ms: 3000

exporters:
  otlp/tempo:
    endpoint: tempo:4317
    tls:
      insecure: true
  otlphttp/loki:
    endpoint: http://loki:3100/otlp
  prometheus:
    endpoint: 0.0.0.0:8889

connectors:
  spanmetrics:
    histogram:
      explicit:
        buckets: [2ms, 4ms, 6ms, 8ms, 10ms, 50ms, 100ms, 200ms, 400ms]
    dimensions:
      - name: http.method
      - name: http.status_code
    aggregation_temporality: "AGGREGATION_TEMPORALITY_CUMULATIVE"

service:
  pipelines:
    traces:
      receivers: [otlp]
      processors: [memory_limiter, attributes, tail_sampling, batch]
      exporters: [otlp/tempo, spanmetrics]
    metrics:
      receivers: [otlp, spanmetrics]
      processors: [memory_limiter, batch]
      exporters: [prometheus, otlp/tempo]
    logs:
      receivers: [otlp, filelog]
      processors: [memory_limiter, attributes, batch]
      exporters: [otlphttp/loki]
```

## OTLP 协议

OTLP（OpenTelemetry Protocol）是 OTel 定义的标准传输协议，设计目标是用一种格式同时承载 Traces、Metrics、Logs 三种数据。

### OTLP/gRPC

默认传输方式，使用 Protocol Buffers 编码，基于 gRPC 传输：

- 端口：`4317`
- 优势：二进制编码体积小、支持流式传输、网络效率高
- 适用场景：SDK → Collector、Collector → Collector 的高速内网通信

### OTLP/HTTP

使用 HTTP POST 请求，Body 可以是 Protobuf 序列化或 JSON 格式：

- 端口：`4318`
- 路径：`/v1/traces`、`/v1/metrics`、`/v1/logs`
- 优势：兼容性好，穿越防火墙和负载均衡器更容易
- 适用场景：浏览器端采集、跨公网传输、与不支持 gRPC 的环境对接

### 为什么选择 OTLP

在没有 OTLP 之前，每种后端都有自己的协议：Jaeger 用 Jaeger UDP/HTTP，Zipkin 用 Zipkin v2，Prometheus 用 Remote Write，Loki 用 Loki Push API。SDK 需要为每种后端实现一个 Exporter，维护成本随接入后端数量线性增长。

OTLP 把这个问题翻转过来：**SDK 只需要支持 OTLP，后端来适配 OTLP**。目前主流后端（Tempo、Jaeger 1.35+、SigNoz、Datadog、New Relic、Elastic APM）都已经原生支持接收 OTLP 数据。

与 Prometheus Remote Write 的关系：Prometheus Remote Write 是 Metrics 领域的事实标准，OTLP 不打算替代它，而是共存。Collector 的 `prometheus` Exporter 可以将 OTLP Metrics 转换为 Prometheus Remote Write 格式发送给 VictoriaMetrics 或 Thanos。

## SDK 自动化接入

### Java：Java Agent 零代码接入

Java 生态的优势在于字节码增强，不需要改一行业务代码即可完成自动埋点：

```bash
# 下载 javaagent
curl -L -o opentelemetry-javaagent.jar \
  https://github.com/open-telemetry/opentelemetry-java-instrumentation/releases/latest/download/opentelemetry-javaagent.jar

# 启动应用时挂载 agent
java -javaagent:opentelemetry-javaagent.jar \
     -Dotel.service.name=order-service \
     -Dotel.traces.exporter=otlp \
     -Dotel.metrics.exporter=otlp \
     -Dotel.logs.exporter=otlp \
     -Dotel.exporter.otlp.endpoint=http://otel-collector:4317 \
     -jar app.jar
```

自动采集范围覆盖：HTTP（Spring MVC、Servlet）、gRPC、JDBC、Redis（Jedis、Lettuce）、Kafka、MongoDB、Elasticsearch、Log4j/Logback 日志关联等数十种框架。

### Python：opentelemetry-distro 自动仪表化

```bash
pip install opentelemetry-distro opentelemetry-exporter-otlp

opentelemetry-bootstrap -a install

opentelemetry-instrument \
  --service_name api-gateway \
  --exporter_otlp_endpoint http://otel-collector:4317 \
  --exporter_otlp_protocol grpc \
  python app.py
```

`opentelemetry-instrument` 命令会自动注入对 Flask、Django、FastAPI、Requests、SQLAlchemy、Redis、Celery 等库的拦截。

### Go：SDK 手动/半自动接入

Go 没有魔法般的 Agent，需要显式引入 SDK。但 OTel 提供了大量的 instrumentation 包，覆盖 net/http、gin、grpc、database/sql、redis 等常用库：

```go
import (
    "go.opentelemetry.io/otel"
    "go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracegrpc"
    "go.opentelemetry.io/otel/sdk/resource"
    sdktrace "go.opentelemetry.io/otel/sdk/trace"
    semconv "go.opentelemetry.io/otel/semconv/v1.24.0"
    "go.opentelemetry.io/contrib/instrumentation/net/http/otelhttp"
)

func initTracer() (*sdktrace.TracerProvider, error) {
    exporter, err := otlptracegrpc.New(context.Background(),
        otlptracegrpc.WithEndpoint("otel-collector:4317"),
        otlptracegrpc.WithInsecure(),
    )
    if err != nil {
        return nil, err
    }
    res := resource.NewWithAttributes(
        semconv.SchemaURL,
        semconv.ServiceNameKey.String("payment-service"),
        semconv.ServiceVersionKey.String("v1.4.0"),
    )
    tp := sdktrace.NewTracerProvider(
        sdktrace.WithBatcher(exporter),
        sdktrace.WithResource(res),
    )
    otel.SetTracerProvider(tp)
    return tp, nil
}

// HTTP 中间件自动埋点
handler := otelhttp.NewHandler(http.HandlerFunc(handleOrder), "handleOrder")
http.Handle("/order", handler)
```

### Node.js：@opentelemetry/auto-instrumentations

```bash
npm install @opentelemetry/auto-instrumentations-node
```

```javascript
// tracing.js — 必须在应用代码之前加载
const { NodeSDK } = require('@opentelemetry/auto-instrumentations-node');

const sdk = new NodeSDK({
  serviceName: 'user-service',
  traceExporter: new OTLPTraceExporter({
    url: 'http://otel-collector:4317',
  }),
  metricExporter: new OTLPMetricExporter({
    url: 'http://otel-collector:4317',
  }),
});

sdk.start();
```

启动时加 `--require ./tracing.js` 即可自动采集 Express、Koa、HTTP、MongoDB、Redis、GraphQL 等模块。

## Kubernetes 集成

### OTel Operator

OpenTelemetry Operator 是一个 K8s Operator，提供两个核心功能：

1. **自动注入 Sidecar**：给 Pod 注入 OTel Collector Sidecar 容器
2. **Instrumentation CRD**：按语言自动注入 SDK 配置（Java Agent、Python distro 等）

### Instrumentation CRD 按语言配置

```yaml
apiVersion: opentelemetry.io/v1alpha1
kind: Instrumentation
metadata:
  name: otel-instrumentation
  namespace: production
spec:
  exporter:
    endpoint: http://otel-collector:4317
  propagators:
    - tracecontext
    - b3
  sampler:
    type: parentbased_traceidratio
    argument: "0.1"
  java:
    image: ghcr.io/open-telemetry/opentelemetry-operator/autoinstrumentation-java:latest
  python:
    image: ghcr.io/open-telemetry/opentelemetry-operator/autoinstrumentation-python:latest
  nodejs:
    image: ghcr.io/open-telemetry/opentelemetry-operator/autoinstrumentation-nodejs:latest
```

Pod 只需要加一个注解即可自动注入：

```yaml
metadata:
  annotations:
    instrumentation.opentelemetry.io/inject-java: "true"
    # 或 inject-python / inject-nodejs / inject-dotnet
```

### DaemonSet 部署 Collector

在 K8s 中推荐以 DaemonSet 部署 Collector，每个节点运行一个实例，采集本节点的日志和指标：

```
┌──────────────────────────────────────────────────────────────┐
│                       Kubernetes Node                         │
│                                                              │
│  ┌─────────────────┐    ┌─────────────────┐                  │
│  │   App Pod A     │    │   App Pod B     │                  │
│  │ ┌─────────────┐ │    │ ┌─────────────┐ │                  │
│  │ │ OTel SDK    │ │    │ │ OTel SDK    │ │                  │
│  │ │ (Java Agent)│ │    │ │ (Python)    │ │                  │
│  │ └──────┬──────┘ │    │ └──────┬──────┘ │                  │
│  └────────┼────────┘    └────────┼────────┘                  │
│           │ OTLP/gRPC           │ OTLP/gRPC                  │
│           └──────────┬──────────┘                            │
│                      ▼                                       │
│           ┌──────────────────────┐                           │
│           │  Collector DaemonSet │                           │
│           │  (每节点一个实例)      │                           │
│           └──────────┬───────────┘                           │
└──────────────────────┼───────────────────────────────────────┘
                       │
          ┌────────────┼────────────┐
          ▼            ▼            ▼
       Tempo        Loki      Prometheus/
     (Traces)     (Logs)     VictoriaMetrics
                                (Metrics)
```

## 统一可观测性落地

### 完整架构

基于 OTel + 开源后端 + Grafana 的统一可观测性架构：

```
┌─────────────────────────────────────────────────────────────────────┐
│                          应用层                                      │
│                                                                     │
│  ┌───────────┐ ┌───────────┐ ┌───────────┐ ┌───────────┐          │
│  │ Service A │ │ Service B │ │ Service C │ │ Service D │          │
│  │ (Java)    │ │ (Go)      │ │ (Python)  │ │ (Node.js) │          │
│  │ OTel SDK  │ │ OTel SDK  │ │ OTel SDK  │ │ OTel SDK  │          │
│  └─────┬─────┘ └─────┬─────┘ └─────┬─────┘ └─────┬─────┘          │
│        └──────────────┼──────────────┼──────────────┘              │
│                       │ OTLP                                        │
└───────────────────────┼─────────────────────────────────────────────┘
                        ▼
             ┌─────────────────────┐
             │   OTel Collector    │
             │  ┌───────────────┐  │
             │  │ spanmetrics   │  │  ← Connector: Trace → Metric
             │  │ Connector     │  │
             │  └───────────────┘  │
             └──┬──────┬──────┬────┘
                │      │      │
     ┌──────────┘      │      └──────────┐
     ▼                 ▼                 ▼
┌─────────┐    ┌───────────┐    ┌─────────────────┐
│  Tempo  │    │   Loki    │    │ VictoriaMetrics  │
│ (Traces)│    │  (Logs)   │    │   (Metrics)      │
└────┬────┘    └─────┬─────┘    └────────┬────────┘
     │               │                   │
     └───────────────┼───────────────────┘
                     ▼
              ┌─────────────┐
              │   Grafana    │
              │ 统一查询面板  │
              └─────────────┘
```

### TraceID → LogID → Metric 关联

统一可观测性的核心价值不是"把三个系统装到一个界面上"，而是**三种信号之间可以无缝跳转关联**：

1. **Trace → Log**：每条 Span 都携带 TraceID，日志框架（Log4j、Logback、Zap）自动将 TraceID 和 SpanID 注入日志的 MDC（Mapped Diagnostic Context）。在 Loki 中用 `{service="order-service"} |= "trace_id=abc123"` 即可查到该 Trace 期间的所有日志。

2. **Trace → Metric**：通过 `spanmetrics` Connector 自动从 Trace 数据生成 RED 指标。请求量（Rate）、错误率（Error）、延迟分布（Duration）无需额外埋点。

3. **Metric → Trace（Exemplars）**：Exemplars 是 Prometheus 2.x 引入的特性，在 Metric 数据点上附加关联的 TraceID。当你在 Grafana 中看到一个延迟突增的 P99 指标点，可以直接点击跳转到对应的 Trace 详情，瞬间定位是哪条链路拖慢了整体。

```
Metric 数据点 + Exemplar:
  http_server_duration_seconds{method="GET", path="/api/orders"} 0.234
    # exemplar: trace_id=abc123, value=0.234

在 Grafana 中：
  1. 看到延迟 P99 突增
  2. 点击数据点上的 Exemplar 链接
  3. 直接跳转到 Tempo 查看 Trace 瀑布图
  4. 发现 db.query Span 耗时异常
  5. 用 TraceID 去 Loki 查相关日志
```

## 生产注意事项

### Sampling 策略

全量采集 Trace 数据在生产环境中成本极高，需要采样。两种主要策略：

**头部采样（Head Sampling）**：在 Trace 开始时（第一个 Span）就决定是否采样。

- 优点：实现简单，SDK 层面即可完成，不依赖 Collector
- 缺点：只能随机采样，无法根据"是否出错"等条件智能采样
- 配置示例：`ParentBased(root=TraceIDRatioBased(0.1))` ——采样 10%

**尾部采样（Tail Sampling）**：等 Trace 的所有 Span 都到达 Collector 后，根据完整 Trace 的特征做决策。

- 优点：可以实现智能策略——只保留错误 Trace、慢请求 Trace，正常请求只采样少量
- 缺点：Collector 需要缓存等待所有 Span 到齐，增加内存开销
- 配置：使用 Collector 的 `tail_sampling` Processor，上文的 YAML 示例已包含典型策略（错误必采、慢请求必采、其余 5%）

推荐做法：头部采样兜底 + Collector 尾部采样精确控制。

### Collector 高可用和扩容

Collector 是整个管线的咽喉，挂了就丢了数据。生产环境建议：

- **DaemonSet 部署**：每个节点一个 Collector，SDK 优先发到本节点 Collector。单节点 Collector 故障只影响该节点上的 Pod
- **Collector 前置负载均衡**：DaemonSet Collector → Gateway Collector（Deployment，可水平扩缩容）→ 后端存储。Gateway 层用 HPA 按 CPU/内存自动扩容
- **队列缓冲**：在 Collector 前引入 Kafka 或 Redis Stream 作为缓冲区，后端故障时不丢数据

### 数据量控制和成本管理

可观测性数据量的增长速度通常超过业务增长速度。控制手段：

- **采样**：按比例采样、基于策略采样（只保留异常 Trace）
- **过滤**：在 Collector 中过滤掉健康检查、静态资源请求等无价值 Span
- **属性裁剪**：`attributes` Processor 删除高基数、大体积的属性（如完整的 request body）
- **分级存储**：热数据保留 7 天（Tempo/Loki 本地存储），冷数据归档到对象存储（S3/MinIO），Grafana 配置查询时自动回源

### 与现有 Prometheus/Loki 迁移策略

不要试图一步到位。推荐渐进式迁移：

1. **第一阶段**：部署 Collector，只做 pass-through。Prometheus 继续直接抓取应用 metrics，Jaeger Agent 继续收集 traces。Collector 只作为中转，验证管道通畅
2. **第二阶段**：将应用的 metrics exporter 从 Prometheus Remote Write 切换为 OTLP，通过 Collector 的 `prometheus` Exporter 输出给 Prometheus/VictoriaMetrics。Traces 切换到 OTLP → Collector → Tempo
3. **第三阶段**：接入 Logs。通过 Collector 的 `filelog` Receiver 采集容器日志，导出到 Loki。日志中自动注入 TraceID
4. **第四阶段**：启用 `spanmetrics` Connector，从 Trace 自动生成 RED 指标。逐步替换手动埋点的 HTTP 指标

每个阶段稳定运行后再进入下一阶段，避免大爆炸式变更导致可观测性盲区。
