---
title: 云原生可观测性体系总览
icon: tower-broadcast
date: 2026-06-13
category:
  - 技术
tag:
  - 可观测性
  - Prometheus
  - Grafana
  - 监控
  - OpenTelemetry
---

# 云原生可观测性体系总览

在 Kubernetes 管理数百个微服务之后，你会发现传统的"监控"已经不够用了。一个请求从网关进入，经过 6 个服务、3 个中间件、2 次数据库调用，最后返回 500——问题出在哪？是网络抖动、数据库慢查询、还是某个 Pod OOM？如果没有一套完整的可观测性体系，排障就像在黑箱里摸象。本文系统梳理云原生可观测性的技术栈，从三大支柱到具体落地方案，帮你建立全局视角。

<!-- more -->

## 可观测性三大支柱

可观测性（Observability）源自控制论，指的是通过系统的外部输出推断内部状态的能力。在软件领域，它由三类遥测数据支撑：

### Metrics（指标）

Metrics 是**聚合后的数值型时序数据**，回答"现在发生了什么"的问题。CPU 使用率 85%、HTTP 请求 P99 延迟 320ms、当前活跃连接数 1024——这些都是指标。指标的优势在于：

- **低存储开销**：每个数据点只需几个字节
- **适合告警**：可以用 PromQL 等表达式定义阈值规则
- **趋势分析**：支持时间窗口聚合（rate、histogram_quantile）

### Logs（日志）

Logs 是**离散事件的文本记录**，回答"具体发生了什么"的问题。每条日志是一个不可变的事件快照，包含时间戳、级别、消息和上下文字段。日志的价值在于：

- **精确排障**：包含错误堆栈、请求参数等细节
- **审计追溯**：记录谁在什么时间做了什么操作
- **上下文丰富**：可以携带 trace_id、span_id 关联其他信号

### Traces（追踪）

Traces 是**请求在分布式系统中的完整行踪**，回答"问题出在哪一跳"的问题。一个 Trace 由多个 Span 组成，每个 Span 代表一次调用：

```
Trace ID: abc123
├── Span 1: API Gateway (12ms)
│   ├── Span 2: Auth Service (3ms)
│   └── Span 3: Order Service (8ms)
│       ├── Span 4: Inventory Service (2ms)
│       └── Span 5: Database Query (5ms)  ← 瓶颈在这里
```

追踪的核心价值是定位**分布式系统中的性能瓶颈和错误传播路径**。

### 三者联动

三大支柱不是孤立的，真正有效的可观测性建立在它们的**关联**之上：

```
                        可观测性联动流程
 ┌──────────┐     ┌──────────┐     ┌──────────┐
 │  Metrics  │     │   Logs   │     │  Traces  │
 │  指标监控  │     │  日志记录  │     │ 链路追踪  │
 └─────┬────┘     └─────┬────┘     └─────┬────┘
       │                │                │
       ▼                │                │
  ┌─────────┐           │                │
  │ 告警触发  │           │                │
  │ P99 > 1s │           │                │
  └────┬────┘           │                │
       │                │                │
       ▼                ▼                ▼
  ┌─────────────────────────────────────────┐
  │        通过 trace_id / labels 关联        │
  │  Metrics ──→ 发现异常时间点和特征          │
  │  Logs   ──→ 提取对应时间窗口的错误日志     │
  │  Traces ──→ 分析慢请求的完整调用链路       │
  └─────────────────────────────────────────┘
```

典型的排障流程：**Metrics 发现问题 → Logs 定位原因 → Traces 分析链路**。你先从 Dashboard 或告警看到延迟飙升，然后去日志系统搜索对应时间段的错误信息，最后通过 trace_id 查看完整调用链，找到具体的慢 Span。

## Prometheus 生态全景

Prometheus（当前最新 v2.54）是云原生监控的事实标准，CNCF 毕业项目，几乎所有 Kubernetes 监控方案都以它为核心。但它不只是一个时序数据库，而是一整套监控生态。

### 核心架构

```
┌──────────────────────────────────────────────────────────────┐
│                    Prometheus 生态全景                         │
│                                                              │
│  ┌─────────────┐    ┌──────────────┐    ┌────────────────┐  │
│  │ Service     │    │  Prometheus   │    │  Alertmanager  │  │
│  │ Discovery   │───→│  Server      │───→│                │  │
│  │             │    │              │    │  - 告警路由      │  │
│  │ - Kubernetes│    │  - TSDB 存储  │    │  - 分组抑制      │  │
│  │ - Consul    │    │  - Scrape    │    │  - 静默管理      │  │
│  │ - DNS       │    │  - Rules     │    │  - 多通道通知    │  │
│  │ - File SD   │    │  - PromQL    │    └───────┬────────┘  │
│  │ - EC2       │    └──────┬───────┘            │           │
│  └─────────────┘           │                    ▼           │
│                            │           ┌────────────────┐   │
│  ┌─────────────┐           │           │   通知渠道      │   │
│  │  Exporters  │           │           │  Email/Slack   │   │
│  │             │           │           │  Webhook/Pager │   │
│  │ - Node      │           │           └────────────────┘   │
│  │ - Blackbox  │           │                                │
│  │ - kube-state│           │  Remote Write                  │
│  │ - mysqld    │           │                                │
│  │ - redis     │           ▼                                │
│  │ - nginx     │   ┌──────────────────────┐                │
│  │ - snmp      │   │   长期存储后端        │                │
│  └─────────────┘   │                      │                │
│                    │  - Thanos (全局视图)   │                │
│                    │  - Cortex (多租户)     │                │
│                    │  - VictoriaMetrics    │                │
│                    │  - Mimir (Grafana)    │                │
│                    └──────────────────────┘                │
└──────────────────────────────────────────────────────────────┘
```

### Prometheus Server

Prometheus Server 是整个生态的核心，包含三个主要组件：

- **TSDB**：本地时序数据库，采用追加写入 + 内存映射文件的方式，单机可处理百万级时间序列。默认保留 15 天数据，适合短期查询和告警
- **Scrape Engine**：基于 Service Discovery 发现目标，按配置的间隔（通常 15s-60s）拉取 `/metrics` 端点
- **Recording Rules & Alerting Rules**：Recording Rules 预计算高频查询结果，降低 Dashboard 加载延迟；Alerting Rules 定义告警条件，触发后推送到 Alertmanager

### Exporter 生态

Exporter 是 Prometheus 采集数据的桥梁，将各种系统的内部状态转化为 Prometheus 格式的指标：

| Exporter | 用途 | 关键指标 |
|----------|------|----------|
| **Node Exporter** | 主机级监控 | CPU、内存、磁盘、网络 |
| **kube-state-metrics** | K8s 对象状态 | Pod 状态、Deployment 副本数、资源请求/限制 |
| **Blackbox Exporter** | 黑盒探测 | HTTP 探测、TCP 探测、DNS 解析、ICMP |
| **mysqld_exporter** | MySQL 监控 | 连接数、QPS、慢查询、复制延迟 |
| **redis_exporter** | Redis 监控 | 内存使用、命中率、连接数、慢命令 |
| **nginx-prometheus-exporter** | Nginx 监控 | 请求数、连接状态、响应时间 |

### Alertmanager

Alertmanager 处理 Prometheus Server 发送的告警，核心能力在于**告警治理**：

- **分组（Grouping）**：将同类告警合并，避免告警风暴。例如某个节点故障引发 50 条告警，合并为一条通知
- **抑制（Inhibition）**：高级别告警抑制低级别。例如集群不可用时，抑制该集群内所有节点的告警
- **静默（Silencing）**：计划维护期间关闭特定告警
- **路由（Routing）**：根据标签将不同告警发送到不同通道（数据库告警发 DBA、网络告警发网络组）

### Service Discovery

在 Kubernetes 环境中，服务实例动态创建销毁，静态配置目标不现实。Prometheus 支持多种发现机制：

- **Kubernetes SD**：自动发现 Service、Pod、Node、Ingress，最常用的方式
- **Consul SD**：基于 Consul 服务注册中心发现目标
- **DNS SD**：通过 SRV 记录发现目标
- **File SD**：通过 JSON/YAML 文件配置目标，适合外部系统集成
- **EC2/Azure/GCP SD**：云厂商 API 发现实例

### Remote Write 生态

Prometheus 本地存储不适合长期保存数据，Remote Write 接口允许将指标写入远端存储：

- **Thanos**：通过 Sidecar 将数据上传到对象存储（S3/GCS），支持跨集群全局查询，Querier 组件可同时查询多个 Prometheus 实例
- **Cortex**：多租户长期存储，支持对 Prometheus 数据进行分片和副本，适合 SaaS 平台
- **VictoriaMetrics**：高性能兼容方案，单节点即可替代 Prometheus + Remote Write 后端的组合
- **Mimir**：Grafana Labs 出品，Cortex 的演进版本，更好的性能和运维体验

## Grafana LGTM 栈

Grafana Labs 提出了一套完整的可观测性技术栈，首字母缩写为 **LGTM**（Loki + Grafana + Tempo + Mimir），分别覆盖日志、可视化、追踪和指标四个层面。

### Loki（日志聚合）

Loki（v3.x）的设计哲学是"像 Prometheus 一样的日志系统"。它不对日志全文建索引，而是只对**标签（Labels）**建索引，日志正文压缩后存储在对象存储（S3/GCS/MinIO）中。

```
┌───────────┐    ┌──────────┐    ┌──────────┐    ┌───────────┐
│  Promtail  │───→│   Loki    │───→│   S3/    │    │  Grafana  │
│  采集 Agent │    │  Distributor    │  MinIO  │    │  LogQL    │
│            │    │  Ingester │    │  对象存储 │    │  查询展示  │
│  - 文件采集  │    │  Querier  │    └──────────┘    └───────────┘
│  - K8s Pod  │    │           │
│  - Journal  │    └──────────┘
└───────────┘
```

Loki 使用 **LogQL** 查询语言，语法与 PromQL 类似：

```logql
# 统计最近 5 分钟每个服务的错误日志数量
count_over_time({app="order-service"} |= "error" [5m])

# 提取日志中的字段并过滤
{app="api-gateway"} | json | status >= 500 | line_format "{{.method}} {{.path}} {{.status}}"
```

因为只索引标签，Loki 的存储成本远低于 Elasticsearch，但代价是不支持全文搜索的快速检索。

### Grafana（可视化）

Grafana（v11.x）是整个可观测性栈的统一入口：

- **Dashboard**：通过 Panel 组合展示指标、日志、追踪数据，支持变量模板实现一套 Dashboard 管理多集群
- **Explore**：交互式查询界面，支持在 Metrics/Logs/Traces 之间快速切换，是排障的核心界面
- **Alerting**：统一告警管理，支持 Metrics 和 Logs 两种数据源，支持告警路由和静默
- **数据源整合**：原生支持 Prometheus、Loki、Tempo、InfluxDB、Elasticsearch 等数十种数据源

### Tempo（分布式追踪）

Tempo（v2.x）是一个成本效益极高的 Trace 后端。它不需要索引（类似 Loki 的设计），直接在对象存储中搜索 Trace 数据。关键特性：

- **TraceQL**：专门为追踪设计的查询语言，支持按服务、操作、属性筛选 Span
- **与 Loki/Prometheus 联动**：在 Grafana 中从日志跳转到 Trace，或从指标下钻到 Trace
- **支持 OTLP、Jaeger、Zipkin 协议**：兼容主流追踪 SDK

### Mimir（长期指标存储）

Mimir（v2.x）是 Grafana Labs 对 Cortex 的重写，作为 Prometheus 的长期存储后端：

- **100% 兼容 Prometheus**：支持 PromQL、Remote Write、Recording Rules
- **多租户**：天然支持租户隔离，适合平台化部署
- **水平扩展**：通过分片处理十亿级时间序列
- **对象存储后端**：数据存储在 S3/GCS，成本可控

### LGTM 之间的数据关联

LGTM 栈的核心优势在于**数据之间的无缝关联**：

```
┌─────────────────────────────────────────────┐
│              Grafana 统一查询界面              │
│                                             │
│  ┌─────────┐   ┌─────────┐   ┌──────────┐  │
│  │ Metrics │   │  Logs   │   │  Traces  │  │
│  │ (Mimir) │   │ (Loki)  │   │ (Tempo)  │  │
│  └────┬────┘   └────┬────┘   └────┬─────┘  │
│       │             │             │         │
│       │   通过以下字段关联：         │         │
│       │   - trace_id             │         │
│       └─── - labels (job, instance, namespace) ──┘  │
│                                             │
│  操作流程：                                   │
│  1. 在 Metrics 图表上点击异常点               │
│  2. 跳转到 Logs 查看对应时间窗口日志           │
│  3. 从日志中提取 trace_id                    │
│  4. 跳转到 Traces 查看完整调用链              │
└─────────────────────────────────────────────┘
```

## VictoriaMetrics 分布式方案

VictoriaMetrics（VM，v1.102+）是一个高性能、成本效益突出的时序数据库，完全兼容 Prometheus 协议，在很多场景下可以直接替代 Prometheus。

### 单节点 vs 集群模式

VictoriaMetrics 提供两种部署模式：

- **单节点模式（vmutils）**：单个二进制文件，包含写入、存储、查询所有功能。适合中小规模（< 100 万活跃时间序列），部署简单，资源开销低
- **集群模式**：将功能拆分为独立组件，支持水平扩展，适合大规模部署（百万到十亿级时间序列）

### 集群组件架构

```
┌──────────────────────────────────────────────────────┐
│              VictoriaMetrics 集群架构                  │
│                                                      │
│  数据写入路径：                                        │
│  ┌───────────┐    ┌───────────┐    ┌──────────────┐ │
│  │ vmagent   │───→│ vminsert  │───→│  vmstorage   │ │
│  │           │    │           │    │              │ │
│  │ - 采集指标  │    │ - 路由写入  │    │ - TSDB 存储   │ │
│  │ - 远程写入  │    │ - 数据分片  │    │ - 数据压缩    │ │
│  │ - 服务发现  │    │ - 副本复制  │    │ - 倒排索引    │ │
│  │ - Relabel  │    └───────────┘    └──────┬───────┘ │
│  └───────────┘                            │         │
│                                           │         │
│  数据查询路径：                             │         │
│  ┌───────────┐    ┌───────────┐           │         │
│  │ Grafana   │───→│ vmselect  │───────────┘         │
│  │           │    │           │                     │
│  │           │    │ - PromQL  │                     │
│  │           │    │ - 结果聚合 │                     │
│  └───────────┘    └───────────┘                     │
│                                                      │
│  辅助组件：                                           │
│  ┌───────────┐    ┌───────────┐                     │
│  │ vmalert   │    │ vmbackup  │                     │
│  │ 告警评估   │    │ 增量备份   │                     │
│  └───────────┘    └───────────┘                     │
└──────────────────────────────────────────────────────┘
```

各组件职责：

| 组件 | 职责 | 类比 Prometheus |
|------|------|----------------|
| **vmagent** | 数据采集、Relabel、Remote Write | Prometheus Server 的 Scrape + SD 部分 |
| **vminsert** | 接收数据、路由到 vmstorage 分片 | 无对应（Prometheus 本地写入） |
| **vmstorage** | 数据持久化存储 | Prometheus TSDB |
| **vmselect** | 执行 PromQL 查询 | Prometheus Server 的查询引擎 |
| **vmalert** | 告警规则评估 | Prometheus Server 的 Rules 部分 |
| **vmbackup** | 增量备份到对象存储 | Thanos Sidecar 的上传功能 |

### 与 Prometheus 的对比优势

| 维度 | Prometheus | VictoriaMetrics |
|------|-----------|-----------------|
| **存储压缩** | 标准 TSDB | 高效压缩，相同数据量磁盘占用减少 3-10 倍 |
| **查询性能** | 单机查询 | vmselect 可水平扩展，支持大规模聚合查询 |
| **高可用** | 需要 Thanos/Cortex | 原生支持副本，vmstorage 多副本部署 |
| **多租户** | 不支持 | 原生支持，通过 `tenant_id` 隔离 |
| **全局视图** | 需要 Thanos Querier | vmselect 直接查询多个 vmstorage |
| **内存使用** | 大规模时内存占用高 | 内存优化显著，同等规模节省 50%+ |
| **学习成本** | 社区资料丰富 | 兼容 PromQL，迁移成本低 |

## OpenTelemetry 统一采集

OpenTelemetry（OTel）是 CNCF 的第二活跃项目（仅次于 Kubernetes），目标是**统一 Metrics、Logs、Traces 三种信号的采集 SDK 和传输协议**，让开发者不需要为每种信号集成不同的库。

### OTel 的核心目标

在 OTel 出现之前，采集三种信号需要不同的 SDK：

- Metrics：Prometheus client、StatsD
- Traces：Jaeger client、Zipkin Brave
- Logs：各种日志框架的定制输出

OTel 提供一套统一的 SDK，一次集成即可采集三种信号，并通过统一的 **OTLP 协议**（OpenTelemetry Protocol）传输。

### Collector 架构

OpenTelemetry Collector 是数据的中间代理，采用**管道（Pipeline）架构**：

```
┌─────────────────────────────────────────────────────────────┐
│              OpenTelemetry Collector                         │
│                                                             │
│  ┌─── Receivers ───┐   ┌─── Processors ───┐   ┌─ Exporters ─┐
│  │                  │   │                  │   │             │
│  │  OTLP (gRPC)    │   │  batch           │   │  Prometheus │
│  │  OTLP (HTTP)    │──→│  memory_limiter  │──→│  Loki       │
│  │  Jaeger         │   │  attributes      │   │  Tempo      │
│  │  Zipkin         │   │  tail_sampling   │   │  Jaeger     │
│  │  Prometheus     │   │  filter          │   │  Datadog    │
│  │  Kafka          │   │  transform       │   │  AWS X-Ray  │
│  │  Fluent Forward │   │  resource        │   │  Elastic    │
│  │                  │   │                  │   │             │
│  └──────────────────┘   └──────────────────┘   └─────────────┘
│                                                             │
│  Pipeline 类型：                                             │
│  - metrics pipeline: receiver → processor → exporter        │
│  - logs pipeline:    receiver → processor → exporter        │
│  - traces pipeline:  receiver → processor → exporter        │
│  - connectors: 跨 pipeline 传递数据                          │
└─────────────────────────────────────────────────────────────┘
```

三层组件的职责：

- **Receiver**：接收数据，支持多种协议（OTLP、Jaeger、Zipkin、Prometheus、Kafka 等）
- **Processor**：处理数据，包括批处理（减少网络请求）、内存限制（防止 OOM）、尾部采样（只保留有价值的 Trace）、属性修改等
- **Exporter**：导出数据到后端存储，支持 Prometheus、Loki、Tempo、Jaeger、Datadog、Elastic 等

### 与各后端的集成

OTel Collector 的设计让它成为可观测性数据的**通用适配器**：

```
┌────────────┐    OTLP     ┌────────────────┐    各种协议    ┌─────────────┐
│ Application│────────────→│ OTel Collector │─────────────→│ Prometheus  │
│ (OTel SDK) │             │                │              │ + Victoria  │
└────────────┘             │                │─────────────→│ Loki        │
                           │                │              │ + Elasticsearch│
                           └────────────────┘─────────────→│ Tempo       │
                                                           │ + Jaeger    │
                                                           │ + Datadog   │
                                                           └─────────────┘
```

这意味着你可以随时切换后端，而不需要修改应用代码。Collector 配置示例：

```yaml
receivers:
  otlp:
    protocols:
      grpc:
        endpoint: 0.0.0.0:4317
      http:
        endpoint: 0.0.0.0:4318

processors:
  batch:
    send_batch_size: 1024
    timeout: 5s
  memory_limiter:
    check_interval: 1s
    limit_mib: 512

exporters:
  prometheusremotewrite:
    endpoint: http://victoriametrics:8428/api/v1/write
  otlphttp:
    endpoint: http://tempo:4318
  loki:
    endpoint: http://loki:3100/loki/api/v1/push

service:
  pipelines:
    metrics:
      receivers: [otlp]
      processors: [batch, memory_limiter]
      exporters: [prometheusremotewrite]
    logs:
      receivers: [otlp]
      processors: [batch, memory_limiter]
      exporters: [loki]
    traces:
      receivers: [otlp]
      processors: [batch, memory_limiter]
      exporters: [otphttp]
```

## 监控体系选型建议

不同规模的团队和基础设施，适合的技术方案差异很大。以下是针对三个规模段的推荐：

### 小团队（< 50 节点）

| 维度 | 推荐方案 | 说明 |
|------|----------|------|
| **指标** | Prometheus 单节点 | 单机即可处理，保留 15-30 天 |
| **日志** | Loki 单节点 + 本地存储 | Promtail 采集，Grafana 查询 |
| **追踪** | Tempo 单节点 | 如果有微服务才需要 |
| **可视化** | Grafana | 统一入口 |
| **告警** | Prometheus AlertManager | 基础告警足够 |
| **部署方式** | Docker Compose / 单节点 K8s | 运维简单优先 |
| **预估资源** | 4C8G（指标）+ 4C16G（日志） | 总计约 3 台机器 |

### 中型团队（50-500 节点）

| 维度 | 推荐方案 | 说明 |
|------|----------|------|
| **指标** | VictoriaMetrics 集群 | vmagent 替代 Prometheus Scrape |
| **日志** | Loki 集群 + 对象存储 | MinIO/S3 后端，Ingester 多副本 |
| **追踪** | Tempo 集群 | 对象存储后端，支持高吞吐 |
| **可视化** | Grafana | 配置多数据源 |
| **告警** | vmalert + AlertManager | vmalert 评估规则，AlertManager 路由 |
| **部署方式** | Kubernetes Helm Chart | 利用 K8s 弹性伸缩 |
| **预估资源** | VM 集群 6-10 节点 + Loki 3-5 节点 | 根据数据量调整 |

### 大型团队（500+ 节点）

| 维度 | 推荐方案 | 说明 |
|------|----------|------|
| **指标** | VictoriaMetrics / Mimir 集群 | 多租户、水平扩展 |
| **日志** | Loki 集群 + S3 | 微服务索引、Querier 自动伸缩 |
| **追踪** | Tempo 集群 + OTel Collector | 尾部采样，只保留 10% Trace |
| **可视化** | Grafana（多实例） | 按团队/环境分实例 |
| **告警** | Mimir Ruler / vmalert + AlertManager | 告警规则分片评估 |
| **采集** | OTel Collector DaemonSet | 统一三种信号的采集和路由 |
| **部署方式** | Kubernetes + 对象存储 | 全组件高可用、多 AZ 部署 |
| **预估资源** | 专用监控集群 20+ 节点 | 独立于业务集群 |

选型的核心原则：**先跑起来再优化**。小团队用 Prometheus + Loki + Grafana 三件套就能覆盖 80% 的场景，不要在初期追求架构的完美。随着规模增长，逐步引入 OTel Collector 做统一采集，再根据瓶颈替换后端存储。
