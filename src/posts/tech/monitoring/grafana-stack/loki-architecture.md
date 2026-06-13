---
title: Loki 日志聚合原理与架构
icon: file-lines
order: 2
date: 2026-06-13
category:
  - 技术
tag:
  - Loki
  - 日志
  - Grafana
  - 云原生
  - 可观测性
---

# Loki 日志聚合原理与架构

在云原生可观测性体系中，日志、指标、链路 tracing 构成三大支柱。Grafana Loki 作为日志聚合引擎，以"不索引日志正文"为核心设计哲学，将存储成本压到 Elasticsearch 的 1/5 到 1/10，同时与 Prometheus 标签体系完全对齐。本文深入解析 Loki 的架构设计、存储引擎、部署模式以及与 ELK 的对比选型。

<!-- more -->

## Loki 设计理念

### 不索引日志正文

传统日志系统（如 Elasticsearch）对日志全文建立倒排索引，每条日志的每个词项都会产生索引条目。当日志量达到 TB/天级别时，索引本身占用的存储可能超过日志正文。Loki 的做法截然不同：**只对标签（Labels）建索引，日志正文仅压缩存储**。

这意味着：

- **写入路径极轻量**：Ingester 只需解析标签、追加 Chunk，无需分词和索引构建
- **存储成本大幅降低**：没有倒排索引开销，原始日志经压缩后占用极小，通常比 Elasticsearch 低 5-10 倍
- **查询方式不同**：通过 Label 快速定位 Chunk，再在 Chunk 内做 grep 式搜索（正则/文本匹配）

### 标签与 Prometheus 统一

Loki 的标签模型与 Prometheus 完全一致。一条日志的标签示例：

```
{app="nginx", namespace="production", pod="nginx-7d4f8b6c4-x2k9l"}
```

这带来两个好处：

1. **Grafana 联动**：在 Grafana 面板中，可以从 Prometheus 指标直接跳转到 Loki 日志，Label 自动传递
2. **运维心智统一**：不需要学习两套标签体系，PromQL 和 LogQL 的 Label 过滤语法几乎一致

### 代价与权衡

不索引正文的代价是**全文搜索性能较差**。如果你需要搜索某个关键词在所有日志中出现的位置，Loki 需要扫描大量 Chunk，速度远不如 Elasticsearch。Loki 的定位是：**已知标签（服务、Pod、命名空间）的快速日志查询**，而非任意关键词全文检索。

## Loki 架构详解

### 整体架构图

```
                        ┌─────────────┐
                        │   Grafana   │
                        │  (查询UI)    │
                        └──────┬──────┘
                               │ LogQL
                               ▼
                    ┌─────────────────────┐
                    │   Query Frontend    │
                    │  查询调度/拆分/缓存  │
                    └──────────┬──────────┘
                               │
                    ┌──────────▼──────────┐
                    │      Querier        │
                    │   查询执行引擎       │
                    └──┬──────────────┬───┘
                       │              │
          ┌────────────▼──┐    ┌──────▼───────────┐
          │ Index Gateway │    │   Ingester Pool   │
          │  索引查询代理  │    │  写入内存→刷盘     │
          └───────┬───────┘    └──────┬────────────┘
                  │                   │
          ┌───────▼───────┐    ┌──────▼────────────┐
          │  Object Store  │    │   Distributor     │
          │  S3/GCS/MinIO  │    │  接收日志/校验     │
          │  (索引+Chunk)  │    │  一致性哈希路由    │
          └───────────────┘    └──────┬────────────┘
                                      │
                               ┌──────▼──────┐
                               │  Promtail   │
                               │  日志采集Agent│
                               └──────┬──────┘
                                      │
                               ┌──────▼──────┐
                               │  应用容器    │
                               │  stdout/stderr│
                               └─────────────┘

          ┌──────────────┐    ┌──────────────┐
          │  Compactor   │    │    Ruler     │
          │  压缩历史数据  │    │  告警规则引擎 │
          └──────┬───────┘    └──────┬───────┘
                 │                   │
                 └───────┬───────────┘
                         ▼
                  Object Storage
```

### 核心组件

#### Distributor（分发器）

Distributor 是日志写入的入口。它完成三件事：

1. **验证日志格式**：检查 Label 是否合法（不允许高基数 Label）
2. **预排序**：对日志流按 Label 排序
3. **一致性哈希路由**：根据 Label 的哈希值将日志转发到对应的 Ingester

Distributor 无状态，可水平扩展。通过 gRPC 与 Ingester 通信。

#### Ingester（摄入器）

Ingester 是写入路径的核心：

- **内存写入**：日志先写入内存中的 Chunk（默认 10KB 一个 Chunk）
- **刷新到存储**：当 Chunk 满（默认 1MB）或超时（默认 30 分钟），将 Chunk 压缩后写入对象存储，同时写入索引
- **WAL 保护**：启用 WAL 时，写入同时记录预写日志，Ingester 重启后可恢复未刷新的数据

```
日志流进入 Ingester:

  ┌─────────────────────────────────────┐
  │            Ingester 内存             │
  │                                     │
  │  Label: {app=nginx}                 │
  │  ┌─────────────────────────────┐    │
  │  │ Chunk #1 (10KB, open)       │────│── 满/超时 → flush 到对象存储
  │  │ Chunk #2 (3KB, appending)   │    │
  │  └─────────────────────────────┘    │
  │                                     │
  │  Label: {app=redis}                 │
  │  ┌─────────────────────────────┐    │
  │  │ Chunk #1 (8KB, open)        │────│── 满/超时 → flush 到对象存储
  │  └─────────────────────────────┘    │
  └─────────────────────────────────────┘
```

#### Querier（查询器）

Querier 负责执行 LogQL 查询。它的查询路径有两条：

1. **Ingester 查询**：查询最近写入但尚未 flush 的数据（还在内存中）
2. **长期存储查询**：查询已经 flush 到对象存储的历史数据

Querier 同时向 Ingester 和对象存储发起请求，合并结果后返回。

#### Query Frontend（查询前端）

Query Frontend 是 Querier 前的调度层，核心功能：

- **查询拆分**：将长时间范围的查询按时间拆分为多个小查询，并行执行
- **查询排队**：通过队列控制并发查询数，防止 Querier 过载
- **结果缓存**：缓存中间结果，重复查询直接命中缓存
- **查询去重**：相同查询只执行一次

生产环境强烈建议部署 Query Frontend，它是大规模日志查询的性能保障。

#### Index Gateway（索引网关）

Index Gateway 代理索引查询请求，避免 Querier 直接访问对象存储中的索引文件。它缓存索引数据到本地，减少对象存储的 API 调用次数，降低延迟和成本。

#### Compactor（压缩器）

Compactor 负责合并和压缩历史 Chunk：

- **合并小 Chunk**：将多个小 Chunk 合并为大 Chunk，减少索引条目
- **删除过期数据**：根据保留策略（retention period）删除过期数据
- **去重**：在 Ingester 重启场景下，可能产生重复 Chunk，Compactor 负责去重

#### Ruler（规则引擎）

Ruler 持续评估 LogQL 规则，触发告警。它与 Prometheus Ruler 类似，但数据源是 Loki 日志。告警通过 Alertmanager 发送。

### 数据流完整路径

```
写入路径:
  App → stdout → Promtail → Distributor → Ingester → 内存 Chunk
                                                          │
                                                          ▼ (flush)
                                                    Object Storage
                                                    (索引 + 压缩Chunk)

查询路径:
  Grafana → Query Frontend → Querier ──┬── Ingester (最近数据)
                                        └── Index Gateway → Object Storage (历史数据)
```

## 存储引擎

### 索引引擎演进

Loki 的索引引擎经历过一次重大升级：

- **BoltDB Ships**（旧版）：每个租户一套 BoltDB 文件，索引存储在对象存储中，查询时需要下载整个 BoltDB 文件
- **TSDB Index**（当前默认，v2.4+）：基于 Prometheus TSDB 思想，索引按时间分片，查询时只需下载相关时间段的数据，性能大幅提升

TSDB Index 是 Loki 2.4+ 的默认引擎，推荐所有新部署使用。

### 存储后端

| 存储类型 | 适用场景 | 说明 |
|---------|---------|------|
| **S3** | AWS 环境 | 最成熟的对象存储后端 |
| **GCS** | GCP 环境 | Google Cloud Storage |
| **Azure Blob** | Azure 环境 | Azure Blob Storage |
| **MinIO** | 私有化/On-Premise | S3 兼容，自建环境首选 |
| **文件系统** | 单机/开发 | 本地磁盘，不支持集群 |

### 索引结构

Loki 的索引映射关系为 **Label → ChunkID → 日志数据位置**：

```
索引查询流程:

  查询: {app="nginx", namespace="prod"} |= "error"
       │
       ▼
  ┌─────────────────────────────┐
  │     TSDB Index              │
  │                             │
  │  app=nginx, namespace=prod  │──→ ChunkID: fake/xxxxx/yyyyy
  │                             │──→ ChunkID: fake/xxxxx/zzzzz
  └─────────────┬───────────────┘
                │
                ▼ ChunkID 定位
  ┌─────────────────────────────┐
  │     Object Storage          │
  │                             │
  │  fake/xxxxx/yyyyy (Chunk)   │──→ 解压 → grep "error"
  │  fake/xxxxx/zzzzz (Chunk)   │──→ 解压 → grep "error"
  └─────────────────────────────┘
```

索引只记录"哪些 Chunk 包含这个 Label 组合"，不记录 Chunk 内部的日志内容。Chunk 内的搜索由 Querier 在运行时完成。

### Chunk 压缩

每个 Chunk 由日志数据块和元数据组成：

- **压缩算法**：默认 snappy（速度快），也支持 zstd（压缩率更高）
- **Chunk 大小**：默认最大 1MB（压缩后），可通过 `chunk_target_size` 调整
- **一个 Chunk 内的日志**：来自同一个 Label 组合（同一日志流）

```
Chunk 结构:

  ┌──────────────────────────────────┐
  │            Chunk                 │
  │                                  │
  │  ┌────────────────────────────┐  │
  │  │  Data Section (compressed) │  │
  │  │  - 日志条目 (snappy/zstd)  │  │
  │  │  - 时间戳 + 日志正文       │  │
  │  └────────────────────────────┘  │
  │  ┌────────────────────────────┐  │
  │  │  Metadata Section          │  │
  │  │  - Label 集合              │  │
  │  │  - 时间范围 [min, max]     │  │
  │  │  - CRC 校验和              │  │
  │  └────────────────────────────┘  │
  └──────────────────────────────────┘
```

### 存储层次总览

```
┌─────────────────────────────────────────────────┐
│                  查询入口                        │
│            Grafana / LogQL CLI                   │
└────────────────────┬────────────────────────────┘
                     │
         ┌───────────▼───────────┐
         │     Index (TSDB)      │
         │   Label → ChunkID     │
         └───────────┬───────────┘
                     │ ChunkID
         ┌───────────▼───────────┐
         │     Chunk Store       │
         │   压缩日志数据块       │
         │   snappy / zstd       │
         └───────────┬───────────┘
                     │
         ┌───────────▼───────────┐
         │   Object Storage      │
         │   S3 / GCS / MinIO    │
         └───────────────────────┘
```

## 部署模式

Loki 提供三种部署模式，适配不同规模。

### 单体模式（Monolithic）

所有组件打包在一个进程中，使用 `-target=all` 启动。存储使用本地文件系统或对象存储。适合开发、测试和小规模部署（日志量 < 100GB/天）。

```bash
# 最简单的启动方式
loki -config.file=loki.yaml -target=all
```

### 简单可扩展模式（SimpleScalable）

将组件分为 **Write Path** 和 **Read Path** 两组，分别扩展：

- **Write 实例**：运行 Distributor + Ingester
- **Read 实例**：运行 Querier + Query Frontend + Ruler + Compactor

```yaml
# Helm values 示例
loki:
  schemaConfig:
    configs:
      - from: 2024-01-01
        store: tsdb
        object_store: s3
        schema: v13
        index:
          period: 24h
          prefix: loki_index_

write:
  replicas: 3

read:
  replicas: 3

backend:  # Compactor + Ruler + Index Gateway
  replicas: 2
```

### 微服务模式（Microservices）

每个组件独立部署，每个组件可独立扩缩容。适合大规模生产环境（日志量 > 1TB/天），但运维复杂度最高。需要配合服务发现和分布式追踪。

### 三种模式对比

| 特性 | 单体模式 | 简单可扩展 | 微服务模式 |
|------|---------|-----------|-----------|
| **部署复杂度** | 低 | 中 | 高 |
| **适用规模** | < 100GB/天 | 100GB - 1TB/天 | > 1TB/天 |
| **扩展方式** | 垂直扩展 | Read/Write 独立扩展 | 每组件独立扩展 |
| **存储要求** | 本地磁盘即可 | 对象存储 | 对象存储 |
| **高可用** | 不支持 | 支持 | 支持 |
| **多租户** | 不推荐 | 支持 | 支持 |
| **典型场景** | 开发/测试/POC | 中小生产环境 | 大规模生产环境 |

## Loki 与 ELK 对比

| 对比维度 | Loki | ELK (Elasticsearch + Logstash + Kibana) |
|---------|------|----------------------------------------|
| **存储成本** | 低（仅索引 Label，正文压缩存储） | 高（全文倒排索引，索引占原始数据 50%-100%） |
| **查询能力** | Label 过滤 + 正则/grep | 全文搜索 + 聚合分析 + SQL-like 查询 |
| **部署复杂度** | 低（单二进制 + 对象存储） | 高（ES 集群 + JVM 调优 + 索引生命周期管理） |
| **资源消耗** | CPU/内存低，依赖对象存储 | CPU/内存/磁盘 IO 均高 |
| **查询延迟** | Label 过滤快，全文搜索慢 | 全文搜索快，聚合分析强 |
| **学习曲线** | LogQL 语法，简单 | ES 查询 DSL，复杂 |
| **Grafana 集成** | 原生支持，与 Prometheus 联动 | 需插件，联动较弱 |
| **适用场景** | 日志量大、按标签查询、成本敏感 | 全文搜索、复杂分析、合规审计 |

### 选型建议

**选 Loki 的场景：**

- 已有 Prometheus + Grafana 监控体系，需要补齐日志能力
- 日志量大（TB 级），但查询模式固定（按服务/Pod/命名空间查）
- 存储预算有限，希望用对象存储降低成本
- Kubernetes 环境，日志来源以容器 stdout 为主

**选 ELK 的场景：**

- 需要全文搜索能力（如搜索某个订单号在所有服务日志中的出现）
- 需要复杂的聚合分析（如统计每个 API 的响应时间分布）
- 合规要求需要保留完整索引
- 已有成熟的 ELK 运维体系

## Kubernetes 部署实战

### Loki Stack Helm Chart

Grafana 官方提供的 `loki-stack` Helm Chart 可以一站式部署 Loki + Promtail + Grafana。生产环境建议使用 `loki-distributed` 或 `loki-simple-scalable` Chart。

```bash
# 添加 Helm 仓库
helm repo add grafana https://grafana.github.io/helm-charts
helm repo update

# 创建命名空间
kubectl create namespace logging

# 安装 Loki Stack
helm install loki grafana/loki-stack \
  --namespace logging \
  -f values.yaml
```

### Helm values 配置示例

以下是一个面向生产环境的 values 配置：

```yaml
# values.yaml

loki:
  # 启用多租户（可选，单租户设为 false）
  auth_enabled: false

  # 存储配置
  storage:
    type: s3
    s3:
      s3: null
      endpoint: minio.logging.svc.cluster.local:9000
      region: null
      secretAccessKey: ${MINIO_SECRET_KEY}
      accessKeyId: ${MINIO_ACCESS_KEY}
      s3ForcePathStyle: true
      insecure: true

  # Schema 配置（TSDB 引擎）
  schemaConfig:
    configs:
      - from: 2024-01-01
        store: tsdb
        object_store: s3
        schema: v13
        index:
          period: 24h
          prefix: loki_index_

  # 保留策略
  limits_config:
    retention_period: 744h    # 31 天
    ingestion_rate_mb: 10     # 每租户每秒摄入限制 10MB
    ingestion_burst_sz_mb: 20
    max_query_length: 721h    # 最大查询时间范围 30 天
    max_entries_limit_per_query: 10000

  # Compactor 配置
  compactor:
    working_directory: /data/loki/compactor
    compaction_interval: 10m
    retention_enabled: true
    retention_delete_delay: 2h
    retention_delete_worker_count: 150
    delete_request_cancel_period: 72h

  # Ingester 配置
  ingester:
    chunk_encoding: snappy
    chunk_idle_period: 30m
    chunk_target_size: 1048576    # 1MB
    max_chunk_age: 2h

# Write Path
write:
  replicas: 3
  persistence:
    size: 10Gi
    storageClassName: local-ssd
  resources:
    requests:
      cpu: "1"
      memory: 2Gi
    limits:
      cpu: "2"
      memory: 4Gi

# Read Path
read:
  replicas: 3
  persistence:
    size: 10Gi
    storageClassName: local-ssd
  resources:
    requests:
      cpu: "1"
      memory: 2Gi
    limits:
      cpu: "2"
      memory: 4Gi

# Backend (Compactor + Ruler + Index Gateway)
backend:
  replicas: 2
  persistence:
    size: 10Gi
    storageClassName: local-ssd

# Gateway（Nginx 代理，统一入口）
gateway:
  enabled: true
  replicas: 2
  nginx:
    readTimeout: 300s
    writeTimeout: 300s

# Promtail（日志采集 Agent）
promtail:
  enabled: true
  config:
    snippets:
      extraRelabelConfigs:
        # 只采集带 app 标签的 Pod 日志
        - source_labels: [__meta_kubernetes_pod_label_app]
          regex: ""
          action: drop
```

### Gateway 代理

Loki Stack 自带 Nginx Gateway 作为统一入口，将写入请求路由到 Write 实例，查询请求路由到 Read 实例：

```
                    ┌──────────────────┐
                    │  Loki Gateway    │
                    │  (Nginx Proxy)   │
                    └────┬────────┬────┘
                         │        │
               /loki/api/v1/push   │ 其他路径
                         │        │
                ┌────────▼──┐  ┌──▼──────────┐
                │  Write    │  │  Read        │
                │  Service  │  │  Service     │
                │  (Distributor│  (Querier +  │
                │  + Ingester) │  QueryFront) │
                └───────────┘  └─────────────┘
```

Gateway 也处理认证和限流，是多租户场景的安全边界。

### 与 Grafana 集成

在 Grafana 中添加 Loki 数据源：

```yaml
# Grafana provisioning 配置
apiVersion: 1
datasources:
  - name: Loki
    type: loki
    access: proxy
    url: http://loki-gateway.logging.svc.cluster.local:80
    isDefault: false
    jsonData:
      maxLines: 1000
      derivedFields:
        # 从日志中提取 traceID，跳转到 Tempo
        - datasourceUid: tempo
          matcherRegex: '"trace_id":"(\w+)"'
          name: TraceID
          url: '$${__value.raw}'
```

配置完成后，在 Grafana Explore 中可以使用 LogQL 查询日志，并与 Prometheus 指标联动：

```logql
# 查询 nginx 错误日志
{app="nginx"} |= "error" != "timeout" | json | line_format "{{.method}} {{.path}} {{.status}}"

# 统计每分钟错误数
sum(count_over_time({app="nginx"} |= "error" [1m])) by (status)

# 从日志提取指标（LogQL Metric 查询）
sum by (status) (
  count_over_time({app="nginx"} | json | status >= 500 [5m])
)
```

### 关键运维参数

| 参数 | 默认值 | 生产建议 | 说明 |
|------|-------|---------|------|
| `chunk_target_size` | 1MB | 1-2MB | Chunk 目标大小，越大压缩率越高 |
| `chunk_idle_period` | 5m | 30m | Chunk 空闲多久后 flush |
| `max_chunk_age` | 2h | 2h | Chunk 最大存活时间 |
| `retention_period` | 744h | 按需 | 日志保留时间 |
| `ingestion_rate_mb` | 4MB | 10-20MB | 每租户摄入速率限制 |
| `query_timeout` | 60s | 120-300s | 查询超时时间 |
| `max_query_parallelism` | 14 | 32+ | 最大并行查询数 |
