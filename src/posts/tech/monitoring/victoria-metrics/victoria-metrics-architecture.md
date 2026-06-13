---
title: VictoriaMetrics 架构与部署
icon: bolt
order: 1
date: 2026-06-13
category:
  - 技术
tag:
  - VictoriaMetrics
  - 监控
  - 时序数据库
  - 分布式
  - 高性能
---

# VictoriaMetrics 架构与部署

Prometheus 是云原生监控的事实标准，但随着监控规模增长，Prometheus 在写入吞吐、存储压缩、高可用等方面逐渐成为瓶颈。VictoriaMetrics 作为兼容 Prometheus 生态的高性能时序数据库，在不改变现有采集和查询方式的前提下，提供了数量级的性能提升。本文从架构设计到生产部署，全面讲解 VictoriaMetrics 的核心组件与最佳实践。

<!-- more -->

## VictoriaMetrics 概述

### 与 Prometheus 的关系

VictoriaMetrics 并非 Prometheus 的替代品，而是对其存储和查询层的能力增强。它完全兼容 Prometheus 的数据协议和查询语言：

- **兼容 Prometheus Remote Write 协议**：可直接接收 Prometheus 推送的数据
- **兼容 PromQL**：支持 Prometheus Query Language 的全部语法，并扩展了 MetricsQL
- **兼容 Prometheus scrape 配置**：vmagent 可以直接复用 Prometheus 的采集配置
- **兼容 Grafana**：使用 Prometheus 数据源类型即可查询 VictoriaMetrics

### 核心优势

```
1. 高性能写入：单节点可处理 100 万+ data points/s
2. 高压缩比：相比 Prometheus 节省 5x ~ 10x 存储空间
3. 低内存占用：同等数据量下内存消耗仅为 Prometheus 的 1/3 ~ 1/5
4. 高查询性能：范围查询速度比 Prometheus 快 5x ~ 10x
5. 原生高可用：集群模式支持多副本、水平扩展
6. 运维友好：单二进制部署，无外部依赖
```

### 单节点 vs 集群模式

| 特性 | 单节点模式 | 集群模式 |
|------|-----------|---------|
| 适用规模 | < 100 万 active series | 100 万 ~ 数亿 active series |
| 部署复杂度 | 单二进制或单容器 | 多组件编排 |
| 高可用 | 不支持 | 支持（多副本） |
| 水平扩展 | 不支持 | 支持（按组件独立扩展） |
| 资源开销 | 极低 | 按需分配 |
| 典型场景 | 中小规模监控、开发测试 | 生产环境、大规模监控 |

### 版本信息

VictoriaMetrics 当前 LTS 版本为 v1.105+，遵循语义化版本控制。社区版（OSS）包含全部核心功能，企业版（Enterprise）额外提供高级特性如 RBAC、数据去重、降采样等。本文内容基于社区版 v1.105+ LTS。

## 单节点模式

### 适用场景

单节点模式适用于 active time series 低于 100 万的场景：

```
- 中小规模 Kubernetes 集群监控（< 50 个节点）
- 基础设施监控（数十台服务器）
- 开发和测试环境
- 边缘计算场景
- Prometheus 远程存储后端
```

### 部署方式

**二进制部署：**

```bash
# 下载最新版本
wget https://github.com/VictoriaMetrics/VictoriaMetrics/releases/download/v1.105.0/victoria-metrics-linux-amd64-v1.105.0.tar.gz
tar -xzf victoria-metrics-linux-amd64-v1.105.0.tar.gz

# 启动单节点
./victoria-metrics-prod \
  -storageDataPath=/data/victoria-metrics \
  -retentionPeriod=12m \
  -memory.allowedPercent=60 \
  -httpListenAddr=:8428
```

**Docker 部署：**

```bash
docker run -d \
  --name victoria-metrics \
  -v /data/vm:/victoria-metrics-data \
  -p 8428:8428 \
  victoriametrics/victoria-metrics:v1.105.0 \
  -retentionPeriod=12m \
  -memory.allowedPercent=60
```

### 关键参数

```
-storageDataPath
  数据存储目录，确保磁盘空间充足
  默认值：victoria-metrics-data

-retentionPeriod
  数据保留周期，支持 h（小时）、d（天）、w（周）、m（月）、y（年）
  默认值：1m（1 个月）
  建议值：6m ~ 12m

-memory.allowedPercent
  允许使用的内存占总内存百分比
  默认值：60
  建议值：50 ~ 70，为系统和其他进程预留空间

-search.maxConcurrentRequests
  最大并发查询数
  默认值：自动根据 CPU 核数设置

-search.maxQueryDuration
  单次查询最大执行时间
  默认值：30s
  建议值：根据面板复杂度调整
```

### Docker Compose 部署示例

```yaml
# docker-compose.yml
version: "3.8"

services:
  victoria-metrics:
    image: victoriametrics/victoria-metrics:v1.105.0
    container_name: victoria-metrics
    restart: always
    ports:
      - "8428:8428"
    volumes:
      - vm-data:/victoria-metrics-data
      - ./prometheus.yml:/etc/prometheus.yml:ro
    command:
      - "-storageDataPath=/victoria-metrics-data"
      - "-retentionPeriod=12m"
      - "-memory.allowedPercent=60"
      - "-promscrape.config=/etc/prometheus.yml"
      - "-promscrape.interval=15s"
      - "-httpListenAddr=:8428"
    deploy:
      resources:
        limits:
          memory: 4g
          cpus: "2"
        reservations:
          memory: 2g
          cpus: "1"

  grafana:
    image: grafana/grafana:11.0.0
    container_name: grafana
    restart: always
    ports:
      - "3000:3000"
    environment:
      GF_SECURITY_ADMIN_PASSWORD: admin
      GF_AUTH_ANONYMOUS_ENABLED: "false"
    volumes:
      - grafana-data:/var/lib/grafana
    depends_on:
      - victoria-metrics

volumes:
  vm-data:
    driver: local
  grafana-data:
    driver: local
```

对应的 Prometheus 采集配置文件：

```yaml
# prometheus.yml — VictoriaMetrics 单节点自带采集功能使用此配置
global:
  scrape_interval: 15s
  evaluation_interval: 15s

scrape_configs:
  - job_name: "node-exporter"
    static_configs:
      - targets: ["host.docker.internal:9100"]
        labels:
          env: production

  - job_name: "vm-self-monitoring"
    static_configs:
      - targets: ["victoria-metrics:8428"]
```

## 集群模式架构详解

### 架构总览

```
                          ┌──────────────────────────────────────────────────┐
                          │              VictoriaMetrics Cluster              │
                          │                                                    │
                          │  ┌─────────┐                                       │
                          │  │ vmauth  │ ← 认证 / 限流 / 路由代理              │
                          │  └────┬────┘                                       │
                          │       │                                            │
  ┌──────────┐            │  ┌────┴────┐                  ┌───────────────┐   │
  │ Targets  │            │  │vmselect │ ←────────────────│  vmstorage-0  │   │
  │ (应用)    │            │  │(查询引擎)│                  │  (存储节点 0)  │   │
  └────┬─────┘            │  └─────────┘                  └───────────────┘   │
       │                  │       │                              │              │
       │ scrape           │       │                      ┌───────────────┐     │
       ▼                  │       │                      │  vmstorage-1  │     │
  ┌──────────┐  remote    │       │                      │  (存储节点 1)  │     │
  │ vmagent  │──────────→ │  ┌─────────┐                 └───────────────┘     │
  │ (采集代理)│  write     │  │vminsert │ ──── 路由 ──────────┤                │
  └──────────┘            │  │(写入入口)│                  ┌───────────────┐   │
                          │  └─────────┘                  │  vmstorage-2  │   │
                          │       │                       │  (存储节点 2)  │   │
                          │       │                       └───────────────┘   │
                          │       │                                            │
                          │  ┌─────────┐     ┌──────────────┐                 │
                          │  │vmalert  │────→│Alertmanager  │                 │
                          │  │(告警引擎)│     │ (告警通知)    │                 │
                          │  └─────────┘     └──────────────┘                 │
                          │                                                    │
                          └──────────────────────────────────────────────────┘
                                               │
                                               │ PromQL / MetricsQL
                                               ▼
                                        ┌──────────────┐
                                        │   Grafana     │
                                        │  (可视化)      │
                                        └──────────────┘
```

### 数据流

```
完整数据流路径：

Target → vmagent → vminsert → vmstorage → vmselect → Grafana
 (采集)   (写入路由)   (持久存储)    (查询引擎)   (可视化)

                                      vmalert → Alertmanager
                                      (告警计算)  (告警通知)
```

### 组件职责

**vmagent（采集代理）：**

替代 Prometheus 的 Scrape 功能，负责从 Target 采集指标数据，支持 Prometheus 完整的 scrape 配置格式。采集到的数据通过 Remote Write 协议推送给 vminsert。

```
核心能力：
- 兼容 Prometheus scrape 配置（prometheus.yml 直接复用）
- 支持 Kubernetes 服务发现（SD）
- 支持 relabel_configs（标签过滤和重写）
- 支持多目标 Remote Write（同时写入多个 VictoriaMetrics 集群）
- 支持 Prometheus remote_write 协议
- 资源占用极低，可在每个节点部署
```

**vminsert（写入入口）：**

接收来自 vmagent（或 Prometheus）的 Remote Write 请求，根据一致性哈希将数据路由到对应的 vmstorage 节点。

```
核心能力：
- 接收 Prometheus Remote Write 协议
- 一致性哈希分片路由到 vmstorage
- 支持多 vminsert 实例负载均衡
- 数据写入不涉及磁盘 I/O，仅做内存路由
```

**vmstorage（存储引擎）：**

集群模式的核心组件，负责时序数据的持久化存储和索引。采用 MergeTree 存储结构，支持高压缩比和快速查询。

```
核心能力：
- MergeTree 存储引擎
- 高效压缩（zstd / lz4）
- 倒排索引（inverted index）
- 支持多 vmstorage 节点水平扩展
- 数据自动分片，节点间无共享架构
```

**vmselect（查询引擎）：**

接收来自 Grafana 或其他客户端的 PromQL 查询请求，从 vmstorage 节点并行读取数据，在内存中完成聚合计算后返回结果。

```
核心能力：
- 完整 PromQL 支持 + MetricsQL 扩展
- 并行查询多个 vmstorage 节点
- 查询结果缓存
- 支持多 vmselect 实例负载均衡
```

**vmalert（告警引擎）：**

替代 Prometheus 的 Rule Manager，执行告警规则和记录规则，支持完整的 Prometheus 规则语法。

```
核心能力：
- 兼容 Prometheus alerting rules
- 兼容 Prometheus recording rules
- 与 Alertmanager 集成发送告警
- 告警状态持久化到 VictoriaMetrics
- 支持多 vmalert 实例高可用
```

**vmauth（认证代理）：**

可选组件，提供统一的认证和路由代理入口。

```
核心能力：
- 基于 Token 或 Basic Auth 的认证
- 请求路由（将请求转发到对应组件）
- 限流和 QPS 控制
- 替代 Nginx / HAProxy 简化部署
```

## vmstorage 存储引擎

### MergeTree 存储结构

VictoriaMetrics 的存储引擎基于 MergeTree 思想设计，写入流程如下：

```
写入路径：

Remote Write Request
        │
        ▼
  ┌──────────┐    定期 Flush    ┌──────────────┐    后台合并    ┌──────────────┐
  │ 内存缓冲   │ ─────────────→ │  Part（部分）  │ ─────────────→ │  大 Part     │
  │ (Memory   │                │  已排序、压缩   │               │  高压缩比     │
  │  Buffer)  │                │  写入磁盘      │               │  高查询性能   │
  └──────────┘                 └──────────────┘                └──────────────┘

存储文件结构：
  {storageDataPath}/
  ├── data/
  │   ├── small/          ← 小 Part（近期写入，频繁合并）
  │   │   ├── 2024_01/
  │   │   │   ├── {tenant}/
  │   │   │   │   ├── {metric_name}/
  │   │   │   │   │   ├── indexdb/     ← 索引数据
  │   │   │   │   │   └── data/        ← 时序数据（已压缩）
  │   │   │   │   └── ...
  │   ├── big/            ← 大 Part（历史数据，高压缩）
  │   └── snapshots/      ← 快照
  ├── indexdb/            ← 全局倒排索引
  └── metadata/
```

### 数据压缩

VictoriaMetrics 采用多级压缩策略：

```
压缩算法选择：
- 默认压缩：zstd（高压缩比，适合历史数据）
- 快速压缩：lz4（低延迟，适合近期热数据）
- 压缩级别可配置

压缩效果（官方数据）：
- 平均每个 data point 仅占用 0.4 ~ 1 字节（含索引）
- 相比 Prometheus TSDB 节省 5x ~ 10x 磁盘空间
- 相比 InfluxDB 节省 10x ~ 20x 磁盘空间

压缩对象：
- 时序数据：对 timestamp 和 value 分别使用 delta + zstd 压缩
- 标签名和标签值：全局字典去重
- 指标名：使用前缀压缩
```

### 索引机制

```
索引类型：倒排索引（Inverted Index）

索引结构：
  标签名/标签值 → 匹配的时间序列 ID 列表

查询加速示例：
  PromQL: http_requests_total{method="GET", status="200"}

  索引查找过程：
  ┌─────────────────────────────────────────────────┐
  │ 倒排索引                                         │
  │                                                  │
  │  method="GET"        → [series_id: 1,3,5,7,9]   │
  │  status="200"        → [series_id: 1,2,5,8,9]   │
  │  __name__="http_req" → [series_id: 1,2,3,4,5]   │
  │                                                  │
  │  交集: [1, 5, 9]  → 仅扫描这 3 条时间序列         │
  └─────────────────────────────────────────────────┘

  相比全表扫描，倒排索引将查询范围缩小几个数量级。
```

### 容量规划

```
容量估算公式（每百万 active series）：

内存需求：
  vmstorage: 约 1GB ~ 2GB（取决于标签基数）
  vminsert:  约 200MB
  vmselect:  约 500MB（取决于查询复杂度）

磁盘需求：
  原始数据:  每百万 series × 每秒 1 data point × 每天 ≈ 86.4B 数据点
  压缩后:    约 5GB ~ 15GB/天（取决于标签数量和值分布）
  建议按每百万 series 10GB/天 预估

CPU 需求：
  写入：每百万 series 约 2 ~ 4 核
  查询：取决于查询复杂度，建议 4 ~ 8 核
```

### 数据保留和自动删除

```
-retentionPeriod 参数控制数据保留周期：
  - 支持 h/d/w/m/y 单位
  - 过期数据由后台自动清理
  - 清理过程不影响写入和查询性能

示例配置：
  -retentionPeriod=6m     # 保留 6 个月
  -retentionPeriod=365d   # 保留 365 天

注意：
  - 不同租户可配置不同保留周期（集群模式）
  - 修改保留周期后需要重启服务生效
  - 历史数据通过删除 Part 文件实现，不涉及单条记录删除
```

## vmagent 采集代理

### 与 Prometheus 的兼容性

vmagent 可以直接复用 Prometheus 的 `prometheus.yml` 配置文件，无需任何修改。它实现了 Prometheus 完整的 scrape 逻辑，包括服务发现、relabel、采样等。

```yaml
# prometheus.yml — vmagent 和 Prometheus 通用
global:
  scrape_interval: 15s
  evaluation_interval: 15s

scrape_configs:
  - job_name: "kubernetes-pods"
    kubernetes_sd_configs:
      - role: pod
    relabel_configs:
      - source_labels: [__meta_kubernetes_pod_annotation_prometheus_io_scrape]
        action: keep
        regex: true
      - source_labels: [__meta_kubernetes_pod_annotation_prometheus_io_path]
        action: replace
        target_label: __metrics_path__
        regex: (.+)
      - source_labels: [__meta_kubernetes_namespace]
        action: replace
        target_label: namespace

  - job_name: "node-exporter"
    static_configs:
      - targets:
          - "node-1:9100"
          - "node-2:9100"
          - "node-3:9100"
        labels:
          env: production
```

### Remote Write 多目标写入

vmagent 支持同时将数据写入多个目标，实现数据冗余或分流：

```yaml
# vmagent 启动参数
./vmagent-prod \
  -promscrape.config=/etc/prometheus.yml \
  -remoteWrite.url=http://vminsert-1:8480/insert/0/prometheus \
  -remoteWrite.url=http://vminsert-2:8480/insert/0/prometheus \
  -remoteWrite.label=cluster=production \
  -httpListenAddr=:8429
```

```
多目标写入场景：
- 主备集群：同时写入两个 VictoriaMetrics 集群
- 跨区域复制：写入本地集群 + 远程集群
- 冷热分离：写入热集群 + 对象存储（通过 vmgateway）
```

### relabel_configs

vmagent 完全兼容 Prometheus 的 relabel_configs，用于在采集阶段对标签进行过滤和重写：

```yaml
scrape_configs:
  - job_name: "app-metrics"
    kubernetes_sd_configs:
      - role: pod
    relabel_configs:
      # 只采集带有 prometheus.io/scrape=true 注解的 Pod
      - source_labels: [__meta_kubernetes_pod_annotation_prometheus_io_scrape]
        action: keep
        regex: true

      # 将注解中的路径设置为采集路径
      - source_labels: [__meta_kubernetes_pod_annotation_prometheus_io_path]
        action: replace
        target_label: __metrics_path__
        regex: (.+)

      # 添加静态标签
      - target_label: cluster
        replacement: production

    # 采集后对指标标签做进一步处理
    metric_relabel_configs:
      # 丢弃高基数指标
      - source_labels: [__name__]
        regex: "go_.*"
        action: drop
```

### 多实例部署实现高可用

```
高可用部署方案：

                    ┌────────────┐
                    │  Target    │
                    └─────┬──────┘
                          │ scrape
              ┌───────────┼───────────┐
              ▼           ▼           ▼
        ┌──────────┐ ┌──────────┐ ┌──────────┐
        │ vmagent-0│ │ vmagent-1│ │ vmagent-2│
        └─────┬────┘ └─────┬────┘ └─────┬────┘
              │            │            │
              └────────────┼────────────┘
                           │ remote write
                           ▼
                    ┌────────────┐
                    │  vminsert  │
                    └────────────┘

说明：
- 部署多个 vmagent 实例采集相同 Target
- vminsert 或 vmstorage 配置 -dedup.minScrapeInterval=15s
- 自动去重：仅保留一个实例的数据，丢弃重复数据点
- 单实例故障时，其余实例无缝接管
```

## vmalert 告警引擎

### 兼容 Prometheus 规则

vmalert 完全兼容 Prometheus 的 alerting rules 和 recording rules 语法：

```yaml
# alert-rules.yml
groups:
  - name: node-alerts
    rules:
      # 告警规则
      - alert: NodeDown
        expr: up == 0
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "Node {{ $labels.instance }} is down"
          runbook: "https://wiki.internal/runbook/node-down"

      - alert: HighMemoryUsage
        expr: |
          (1 - node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes) > 0.9
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "Node {{ $labels.instance }} memory usage above 90%"

      - alert: DiskSpaceLow
        expr: |
          (1 - node_filesystem_avail_bytes / node_filesystem_size_bytes) > 0.85
        for: 10m
        labels:
          severity: warning
        annotations:
          summary: "Node {{ $labels.instance }} disk {{ $labels.mountpoint }} usage above 85%"

      # 记录规则（预计算常用指标，加速查询）
      - record: instance:node_cpu:rate5m
        expr: |
          100 - (avg by (instance) (rate(node_cpu_seconds_total{mode="idle"}[5m])) * 100)

      - record: instance:node_memory_usage:ratio
        expr: |
          1 - node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes
```

### 与 Alertmanager 集成

```bash
# vmalert 启动参数
./vmalert-prod \
  -rule=/etc/vmalert/rules/*.yml \
  -datasource.url=http://vmselect:8481/select/0/prometheus \
  -remoteWrite.url=http://vminsert:8480/insert/0/prometheus \
  -notifier.url=http://alertmanager:9093 \
  -notifier.url=http://alertmanager-ha:9093 \
  -httpListenAddr=:8880
```

```
告警流程：

vmalert 定期执行规则
        │
        ├── 规则触发 → 发送到 Alertmanager
        │                    │
        │                    ├── 邮件通知
        │                    ├── Slack / 飞书 / 钉钉 Webhook
        │                    ├── PagerDuty
        │                    └── 分组 / 抑制 / 静默
        │
        └── 记录规则 → Remote Write 回 VictoriaMetrics
                         （加速后续查询）
```

### vmalert 规则配置示例

```bash
# 多 vmalert 实例部署（高可用）
# 所有实例执行相同规则集，Alertmanager 负责去重

docker run -d \
  --name vmalert \
  -v ./rules:/etc/vmalert/rules:ro \
  victoriametrics/vmalert:v1.105.0 \
  -rule=/etc/vmalert/rules/*.yml \
  -datasource.url=http://vmselect:8481/select/0/prometheus \
  -remoteWrite.url=http://vminsert:8480/insert/0/prometheus \
  -remoteRead.url=http://vmselect:8481/select/0/prometheus \
  -notifier.url=http://alertmanager:9093 \
  -httpListenAddr=:8880 \
  -evaluationInterval=15s \
  -rule.expandEnv=true
```

## 与 Prometheus 生态集成

### Prometheus Remote Write 迁移

现有 Prometheus 实例可以通过 Remote Write 将数据同时写入 VictoriaMetrics，实现平滑迁移：

```yaml
# prometheus.yml — 添加 remote_write 配置
global:
  scrape_interval: 15s

# 将数据远程写入 VictoriaMetrics
remote_write:
  - url: http://vminsert:8480/insert/0/prometheus
    queue_config:
      max_samples_per_send: 10000
      capacity: 20000
      max_shards: 10

# 同时保留本地存储作为过渡期
storage:
  tsdb:
    path: /data/prometheus
    retention.time: 7d  # 缩短本地保留周期
```

### Grafana 查询配置

VictoriaMetrics 完全兼容 Grafana 的 Prometheus 数据源类型：

```
Grafana 配置步骤：

1. 添加数据源 → 选择 Prometheus 类型
2. URL 填写：
   单节点：http://victoria-metrics:8428
   集群模式（读）：http://vmselect:8481/select/0/prometheus
3. 无需修改查询语法，所有 PromQL 直接兼容

查询 URL 对应关系：
  写入：http://vminsert:8480/insert/0/prometheus
  查询：http://vmselect:8481/select/0/prometheus
  删除：http://vmselect:8481/delete/0/prometheus

注意：0 为默认租户 ID，多租户模式下替换为实际租户 ID
```

### Alertmanager 集成

VictoriaMetrics 的告警链路与 Prometheus 完全一致：

```
vmalert → Alertmanager → 通知渠道

Alertmanager 配置无需任何修改，直接复用现有配置：

# alertmanager.yml
route:
  receiver: "default"
  group_by: ["alertname", "cluster"]
  group_wait: 30s
  group_interval: 5m
  repeat_interval: 4h

receivers:
  - name: "default"
    webhook_configs:
      - url: http://notification-service:8080/alerts
```

### Kubernetes 部署（VictoriaMetrics Operator）

VM Operator 提供 Kubernetes 原生的 CRD，用声明式方式管理 VictoriaMetrics 全栈：

```yaml
# 安装 VM Operator
kubectl apply -f https://raw.githubusercontent.com/VictoriaMetrics/operator/v0.47.0/release/operator.yaml
```

### VM Operator CRD

```
VictoriaMetrics Operator 提供以下 CRD：

┌─────────────────────────────────────────────────────────────────┐
│                   VM Operator CRD 总览                           │
├──────────────┬──────────────────────────────────────────────────┤
│ CRD          │ 功能                                             │
├──────────────┼──────────────────────────────────────────────────┤
│ VMSingle     │ 单节点 VictoriaMetrics 实例                      │
│ VMCluster    │ 集群模式（包含 vmstorage + vminsert + vmselect） │
│ VMAgent      │ vmagent 采集代理                                 │
│ VMAlert      │ vmalert 告警引擎                                 │
│ VMRule       │ 告警规则和记录规则（类似 PrometheusRule）          │
│ VMAlertmanager│ Alertmanager 实例                               │
│ VMAuth       │ vmauth 认证代理                                  │
│ VMUser       │ vmauth 用户配置                                  │
│ VMStaticScrape│ 静态目标采集配置                                │
└──────────────┴──────────────────────────────────────────────────┘
```

**VMCluster 示例：**

```yaml
# vmcluster.yaml
apiVersion: operator.victoriametrics.com/v1beta1
kind: VMCluster
metadata:
  name: production
  namespace: monitoring
spec:
  # 存储节点
  vmstorage:
    replicaCount: 3
    storage:
      volumeClaimTemplate:
        spec:
          accessModes: ["ReadWriteOnce"]
          resources:
            requests:
              storage: 100Gi
          storageClassName: ssd
    resources:
      requests:
        cpu: "2"
        memory: 4Gi
      limits:
        cpu: "4"
        memory: 8Gi
    extraArgs:
      retentionPeriod: "6m"

  # 写入入口
  vminsert:
    replicaCount: 2
    resources:
      requests:
        cpu: "1"
        memory: 1Gi
      limits:
        cpu: "2"
        memory: 2Gi

  # 查询引擎
  vmselect:
    replicaCount: 2
    cacheMountPath: /cache
    storage:
      volumeClaimTemplate:
        spec:
          accessModes: ["ReadWriteOnce"]
          resources:
            requests:
              storage: 10Gi
    resources:
      requests:
        cpu: "1"
        memory: 2Gi
      limits:
        cpu: "4"
        memory: 4Gi
```

**VMAgent 示例：**

```yaml
# vmagent.yaml
apiVersion: operator.victoriametrics.com/v1beta1
kind: VMAgent
metadata:
  name: production
  namespace: monitoring
spec:
  replicaCount: 2
  serviceAccountName: vmagent
  remoteWrite:
    - url: http://vminsert-monitoring:8480/insert/0/prometheus
  extraArgs:
    promscrape.cluster.compatibility: "prometheus"
    dedup.minScrapeInterval: "15s"
  resources:
    requests:
      cpu: "1"
      memory: 1Gi
    limits:
      cpu: "2"
      memory: 2Gi
```

**VMAlert + VMRule 示例：**

```yaml
# vmalert.yaml
apiVersion: operator.victoriametrics.com/v1beta1
kind: VMAlert
metadata:
  name: production
  namespace: monitoring
spec:
  replicaCount: 2
  datasource:
    url: http://vmselect-monitoring:8481/select/0/prometheus
  notifier:
    url: http://vmalertmanager-monitoring:9093
  remoteWrite:
    url: http://vminsert-monitoring:8480/insert/0/prometheus
  remoteRead:
    url: http://vmselect-monitoring:8481/select/0/prometheus

---
# vmrule.yaml — 告警规则 CRD
apiVersion: operator.victoriametrics.com/v1beta1
kind: VMRule
metadata:
  name: node-alerts
  namespace: monitoring
spec:
  groups:
    - name: node-alerts
      rules:
        - alert: NodeDown
          expr: up == 0
          for: 1m
          labels:
            severity: critical
          annotations:
            summary: "Node {{ $labels.instance }} is down"
        - alert: HighMemoryUsage
          expr: |
            (1 - node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes) > 0.9
          for: 5m
          labels:
            severity: warning
```

## 性能对比

### Prometheus vs VictoriaMetrics

| 指标 | Prometheus | VictoriaMetrics | 提升倍数 |
|------|-----------|-----------------|---------|
| 写入吞吐（单节点） | ~50 万 samples/s | ~150 万 samples/s | 3x |
| 查询性能（范围查询） | 基准 | 5x ~ 10x 更快 | 5-10x |
| 内存占用 | 基准 | 1/3 ~ 1/5 | 3-5x 节省 |
| 磁盘压缩比 | 基准 | 5x ~ 10x 更小 | 5-10x 节省 |
| 单节点 series 上限 | ~100 万 | ~300 万+ | 3x |
| 集群模式 series 上限 | Thanos 扩展 | 原生支持数十亿 | - |
| 高可用 | 需 Thanos / Cortex | 原生支持 | - |
| 多租户 | 不支持 | 原生支持 | - |
| 数据降采样 | 需 Thanos | 企业版支持 | - |

### 官方 Benchmark 数据

VictoriaMetrics 官方持续维护基准测试，以下是关键结论：

```
测试环境：Google Cloud n1-highmem-16（16 vCPU, 104 GB RAM）

测试数据集：
- 100 万 active time series
- 每秒 100 万 data points
- 保留 30 天

结果对比：

1. 磁盘空间：
   Prometheus:  2.3 TB
   VictoriaMetrics: 286 GB（8x 压缩）

2. 内存使用：
   Prometheus:  48 GB
   VictoriaMetrics: 12 GB（4x 节省）

3. 范围查询（1 小时范围，100 个 series）：
   Prometheus:  1.2s
   VictoriaMetrics: 0.12s（10x 更快）

4. 范围查询（24 小时范围，1000 个 series）：
   Prometheus:  8.5s
   VictoriaMetrics: 0.45s（19x 更快）

官方 Benchmark 仓库：
https://github.com/VictoriaMetrics/benchmark
```

### 生产环境资源参考

```
小规模部署（< 50 万 series）：
  单节点 VictoriaMetrics
  4 核 CPU / 8 GB 内存 / 100 GB SSD

中等规模（50 万 ~ 200 万 series）：
  单节点 VictoriaMetrics
  8 核 CPU / 32 GB 内存 / 500 GB SSD

大规模（200 万 ~ 1000 万 series）：
  集群模式
  vmstorage: 3 节点（16 核 / 64 GB / 2 TB SSD）
  vminsert:  2 节点（8 核 / 16 GB）
  vmselect:  2 节点（8 核 / 32 GB / 100 GB SSD 缓存）

超大规模（1000 万+ series）：
  集群模式 + 水平扩展
  vmstorage: 5+ 节点（按需扩展）
  vminsert:  3+ 节点
  vmselect:  3+ 节点
  vmagent:   每个 Kubernetes 节点部署
```
