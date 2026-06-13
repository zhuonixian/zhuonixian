---
title: Grafana 可视化生态
icon: chart-line
order: 1
date: 2026-06-13
category:
  - 技术
tag:
  - Grafana
  - 可视化
  - Dashboard
  - 监控
  - 告警
---

## Grafana 核心功能

Grafana 是一个开源的数据可视化和监控平台，自 2014 年发布以来已成为云原生可观测性领域的事实标准。当前主流版本为 Grafana 11.x，其核心能力围绕「查询任何数据源、以任意方式可视化、在任何场景下告警」展开。

### 数据源（Datasource）支持

Grafana 通过插件化架构接入多种数据源，分为三类：

- **Metrics 数据源**：Prometheus（原生支持，最常用）、InfluxDB、Graphite、OpenTSDB、Datadog
- **Logs 数据源**：Loki（Grafana 自研日志聚合系统）、Elasticsearch
- **Traces 数据源**：Tempo（Grafana 自研分布式追踪后端）、Jaeger、Zipkin
- **关系型数据库**：MySQL、PostgreSQL、Microsoft SQL Server
- **其他**：ClickHouse、Redis、CloudWatch、Azure Monitor

每个数据源独立配置连接参数（URL、认证信息、查询超时等），一个 Dashboard 可以同时查询多个数据源，实现跨系统的数据关联展示。

### 面板类型（Panel Types）

Grafana 11.x 提供丰富的可视化面板：

| 面板类型 | 典型用途 |
|---|---|
| Time Series | 时序指标趋势（CPU 使用率、QPS） |
| Stat | 单值展示（在线实例数、总请求数） |
| Table | 表格数据（实例列表、配置信息） |
| Heatmap | 分布热力图（请求延迟分布） |
| Logs | 日志流展示（Loki 日志） |
| Trace | 追踪链路展示（Tempo Span） |
| Gauge | 仪表盘（磁盘使用率、水位线） |
| Bar Chart | 柱状图（各服务请求量对比） |
| Pie Chart | 饼图（插件，流量占比） |
| Candlestick | K 线图（金融场景） |
| Canvas | 自定义画布（拓扑图） |

每个面板支持独立的数据查询、样式配置、阈值着色和覆盖（Override）规则。

### 变量（Variables）

变量是 Grafana 实现动态 Dashboard 的核心机制，在 Dashboard 顶部以Dropdown 形式展示，用户切换变量值后所有面板的查询自动更新：

```
变量类型：
  - Query：从数据源查询可选值（如所有实例名）
  - Interval：时间粒度（如 1m, 5m, 1h）
  - Custom：手动定义可选值列表
  - Text Box：自由输入
  - Constant：隐藏常量
  - Data source：切换数据源
  - Ad hoc filter：Prometheus 标签过滤器
```

常用变量组合：`$instance`（实例）、`$job`（任务）、`$namespace`（K8s 命名空间）、`$cluster`（集群名）、`$interval`（采样间隔）。

### 链接（Data Links）

Data Links 允许在面板数据点上添加可点击链接，实现 Dashboard 间的跳转和上下文传递：

- 跳转到另一个 Dashboard 并携带当前变量值
- 链接到外部系统（如 CMDB、工单系统）
- 跳转到 Explore 页面进行深入排查

## Dashboard 设计最佳实践

### 布局原则

Dashboard 设计遵循「从总到分，从全局到局部」的原则：

```
+------------------------------------------------------------------+
|  Dashboard: Production Overview                                   |
|  Variables: [cluster] [namespace] [instance]                      |
+------------------------------------------------------------------+
|                                                                    |
|  Row: Overview                                                     |
|  +------------------+------------------+------------------+        |
|  | Stat: Total Pods | Stat: CPU Usage  | Stat: Mem Usage  |        |
|  | (all namespaces) | (aggregate %)    | (aggregate %)    |        |
|  +------------------+------------------+------------------+        |
|                                                                    |
|  Row: Resource Detail                                              |
|  +--------------------------------+----------------------------+   |
|  | Time Series: CPU by instance   | Time Series: Memory by     |   |
|  | (per $instance)                | instance (per $instance)   |   |
|  +--------------------------------+----------------------------+   |
|  +--------------------------------+----------------------------+   |
|  | Time Series: Network I/O       | Time Series: Disk I/O      |   |
|  +--------------------------------+----------------------------+   |
|                                                                    |
|  Row: Application Metrics                                          |
|  +--------------------------------+----------------------------+   |
|  | Time Series: QPS               | Time Series: Latency P99   |   |
|  +--------------------------------+----------------------------+   |
|  +--------------------------------+----------------------------+   |
|  | Time Series: Error Rate        | Table: Top Error Endpoints |   |
|  +--------------------------------+----------------------------+   |
+------------------------------------------------------------------+
```

**层级结构**：

```
Dashboard
├── Row: Overview (全局概览)
│   ├── Stat Panel: 关键指标汇总
│   └── Stat Panel: 状态统计
├── Row: Infrastructure (基础设施)
│   ├── Time Series: CPU / 内存趋势
│   ├── Time Series: 磁盘 / 网络趋势
│   └── Gauge: 资源水位
├── Row: Application (应用层)
│   ├── Time Series: QPS / 延迟 / 错误率
│   ├── Heatmap: 延迟分布
│   └── Table: 慢请求 Top N
└── Row: Logs & Traces (排查)
    ├── Logs Panel: 错误日志流
    └── Trace Panel: 链路详情
```

### 变量设计建议

设计变量时遵循从大到小的层级关系：

```
$datasource  →  选择数据源
$cluster     →  选择集群
$namespace   →  选择命名空间
$job         →  选择服务
$instance    →  选择实例
$interval    →  选择采样间隔
```

变量之间通过 `refresh` 和 `include-all` 选项实现联动。当 `$cluster` 变化时，`$namespace` 自动刷新可选项。

### 常用 Dashboard 模板

**节点概览 Dashboard**：

| 面板 | 查询示例 | 面板类型 |
|---|---|---|
| CPU 使用率 | `node_cpu_seconds_total` | Time Series |
| 内存使用率 | `node_memory_MemAvailable_bytes` | Gauge |
| 磁盘使用率 | `node_filesystem_avail_bytes` | Stat |
| 网络吞吐 | `node_network_receive_bytes_total` | Time Series |
| 磁盘 I/O | `node_disk_read_bytes_total` | Time Series |
| 负载均衡 | `node_load1`, `node_load5`, `node_load15` | Time Series |

**K8s 集群概览 Dashboard**：

| 面板 | 查询示例 | 面板类型 |
|---|---|---|
| Pod 总数/状态 | `kube_pod_status_phase` | Stat |
| CPU Requests/Limits | `kube_pod_container_resource_requests` | Gauge |
| 内存 Requests/Limits | `kube_pod_container_resource_limits` | Gauge |
| Deployment 副本状态 | `kube_deployment_status_replicas` | Stat |
| Pod 重启次数 | `kube_pod_container_status_restarts_total` | Table |
| PVC 使用率 | `kubelet_volume_stats_used_bytes` | Gauge |

**应用性能 Dashboard（RED 方法）**：

| 面板 | 含义 | 面板类型 |
|---|---|---|
| Rate | 请求速率 (QPS) | Time Series |
| Errors | 错误率 (%) | Time Series |
| Duration | 延迟分布 (P50/P95/P99) | Heatmap |
| Top Endpoints | 按错误率排序的接口 | Table |

### 面板 JSON 导出/导入

Grafana Dashboard 以 JSON 格式存储，支持导出和导入：

```bash
# 通过 API 导出 Dashboard
curl -s -H "Authorization: Bearer $API_KEY" \
  "http://grafana:3000/api/dashboards/uid/$DASHBOARD_UID" | \
  jq '.dashboard' > dashboard.json

# 通过 API 导入 Dashboard
curl -X POST -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d @dashboard.json \
  "http://grafana:3000/api/dashboards/db"
```

Grafana 官方维护了 [Grafana.com Dashboard 仓库](https://grafana.com/grafana/dashboards/)，提供数千个社区模板，导入时使用 Dashboard ID 即可：

```bash
# 导入 ID 为 1860 的 Node Exporter Dashboard
# 在 UI 中: Dashboards > Import > 输入 1860 > Load
```

## Grafana Alerting

### 统一告警架构

Grafana 11.x 提供统一的告警系统，同时支持在 UI 中配置告警规则和使用数据源原生的 Recording Rules：

```
告警规则类型：
  - Grafana-managed Alert Rules：在 Grafana UI 中配置，支持多数据源查询
  - Data source-managed Rules：推送到 Prometheus/Mimir 的 Recording/Alerting Rules
  - Recording Rules：预聚合指标，降低查询开销
```

### Alert Rule 配置

每条告警规则包含以下要素：

```
+----------------------------------------------------------+
|  Alert Rule: High CPU Usage                               |
+----------------------------------------------------------+
|  Query:    avg(rate(node_cpu_seconds_total{mode!="idle"}  |
|            [5m])) by (instance) > 0.85                    |
|  Threshold:  > 0.85 (Warning)  > 0.95 (Critical)         |
|  Evaluate:  every 1m, for 5m                              |
|  Labels:    severity=warning, team=infra                  |
|  Annotations: summary="CPU > 85% on {{ $labels.instance }}"|
+----------------------------------------------------------+
```

关键配置项：

- **查询条件**：支持 PromQL、LogQL 等查询语言，可组合多个查询表达式
- **阈值条件**：支持 Classic Condition（单阈值）和 Thresholds（多级阈值）
- **评估间隔**（Evaluate every）：多久评估一次（如 `1m`）
- **持续时间**（For）：连续满足多久才触发（如 `5m`），避免毛刺
- **No Data 策略**：数据缺失时如何处理（Alerting / No Data / OK）

### Contact Points（通知渠道）

Contact Points 定义告警通知的发送方式：

```
支持的通知渠道：
  - Email
  - Slack / Webhook
  - 钉钉 / 企业微信（通过 Webhook）
  - PagerDuty / OpsGenie
  - Telegram
  - 自定义 Webhook
```

每个 Contact Point 可配置多个接收器，实现冗余通知。

### Notification Policies（路由规则）

Notification Policies 控制告警如何路由到对应的 Contact Points：

```
Notification Policy 树：
  root (default → email:ops@example.com)
  ├── match: team=infra
  │   → contact_point: slack-infra
  ├── match: team=app
  │   ├── match: severity=critical
  │   │   → contact_point: pagerduty-app
  │   └── default → contact_point: slack-app
  └── match: team=dba
      → contact_point: email-dba + slack-dba
```

路由规则通过 Label 匹配（如 `team=infra`, `severity=critical`），支持嵌套继承。

### Notification Templates

使用 Go Template 自定义通知内容格式：

```go
{{ define "custom.alert" }}
{{ range .Alerts }}
**Alert**: {{ .Labels.alertname }}
**Severity**: {{ .Labels.severity }}
**Instance**: {{ .Labels.instance }}
**Summary**: {{ .Annotations.summary }}
**Value**: {{ .Values.A }}
{{ end }}
{{ end }}
```

### 与 Alertmanager 的对比

| 特性 | Grafana Alerting | Prometheus Alertmanager |
|---|---|---|
| 配置方式 | UI 可视化配置 | YAML 文件 |
| 多数据源 | 支持 | 仅 Prometheus |
| 告警路由 | UI 配置 Notification Policy | route 树配置 |
| 静默/抑制 | UI 操作 | 配置文件 |
| 通知模板 | Go Template | Go Template |
| 集成难度 | 低，开箱即用 | 需单独部署 |

Grafana Alerting 适合中小规模场景和多云环境；大规模部署（数千条规则）仍建议使用 Prometheus Alertmanager 或 Mimir Ruler。

## Grafana Explore

Explore 是 Grafana 内置的交互式查询界面，用于临时排查和数据分析，无需创建 Dashboard。

### Metrics Explorer

Metrics Explorer 提供 Prometheus 指标的浏览和查询功能：

- 指标浏览器：列出所有可用指标及其标签
- 查询构建器：可视化构建 PromQL，无需手写
- 历史查询记录：保存最近执行的查询
- 指标元数据：展示指标的 type、unit、help 信息

常用操作：

```
1. 选择指标 → 浏览标签 → 添加过滤器 → 执行查询
2. 使用 Query Builder 切换到 Code 模式手动编写 PromQL
3. 对比不同时间段的指标变化
```

### Logs Explorer

Logs Explorer 用于 Loki 日志查询，支持 LogQL：

```logql
# 基本查询：过滤包含 error 的日志
{app="api-server"} |= "error"

# 提取字段并过滤
{app="api-server"} | logfmt | level="error" | status >= 500

# 统计错误日志趋势
sum(count_over_time({app="api-server"} |= "error" [5m]))
```

特性：
- 实时日志流（Live Tail）
- 日志上下文查看（Context）
- 结构化日志字段提取
- 日志与指标关联（Derived Fields）

### Traces Explorer

Traces Explorer 用于 Tempo 分布式追踪查询：

- 通过 Trace ID 直接查找
- 通过 Service Name + 时间范围搜索
- Span 过滤和属性搜索
- 火焰图/瀑布图展示调用链

### 三者联动：Metrics → Logs → Traces

Explore 最大的价值在于三者的联动排查：

```
排查流程：

  Metrics（发现异常）
    │
    │  QPS 下降 / P99 延迟升高 / 错误率上升
    │
    ▼
  Logs（定位日志）
    │
    │  过滤 error 日志，发现异常堆栈
    │  提取 trace_id
    │
    ▼
  Traces（追踪根因）
    │
    │  查看完整调用链
    │  定位到慢 Span / 错误 Span
    │
    ▼
  根因（数据库慢查询 / 下游超时 / 资源不足）
```

在面板上可以通过 Data Links 和 Derived Fields 自动关联：

```
Derived Field 配置：
  Name:     TraceID
  Regex:    trace_id=(\w+)
  Query:    ${__value.raw}
  URL:      /explore?left={"queries":[{"query":"${__value.raw}"}]}
```

这样在 Logs 面板中，日志里的 `trace_id=xxx` 会自动变为可点击链接，点击后跳转到 Traces 查询。

## Provisioning 自动化

Grafana 支持通过 YAML 配置文件自动管理数据源、Dashboard 和告警规则，实现基础设施即代码。

### 数据源自动配置

创建 `/etc/grafana/provisioning/datasources/datasource.yaml`：

```yaml
apiVersion: 1
datasources:
  - name: Prometheus
    type: prometheus
    access: proxy
    url: http://prometheus:9090
    isDefault: true
    editable: true

  - name: Loki
    type: loki
    access: proxy
    url: http://loki:3100

  - name: Tempo
    type: tempo
    access: proxy
    url: http://tempo:3200
    jsonData:
      tracesToMetrics:
        datasourceUid: prometheus
      tracesToLogsV2:
        datasourceUid: loki
```

### Dashboard 自动导入

创建 `/etc/grafana/provisioning/dashboards/dashboard.yaml`：

```yaml
apiVersion: 1
providers:
  - name: default
    orgId: 1
    folder: ''
    type: file
    disableDeletion: false
    editable: true
    options:
      path: /var/lib/grafana/dashboards
      foldersFromFilesStructure: true
```

将 Dashboard JSON 文件放入 `/var/lib/grafana/dashboards/` 目录，Grafana 启动时自动加载。

从 Grafana.com 自动导入：

```yaml
apiVersion: 1
providers:
  - name: community-dashboards
    folder: Community
    type: file
    options:
      path: /var/lib/grafana/dashboards/community

# 配合 initContainers 从 URL 下载 Dashboard
```

### 告警规则自动配置

Grafana 11.x 支持通过 Provisioning 文件管理告警规则：

```yaml
# /etc/grafana/provisioning/alerting/rules.yml
apiVersion: 1
groups:
  - orgId: 1
    name: infra-cpu-alerts
    folder: Infrastructure
    interval: 1m
    rules:
      - uid: cpu-high-001
        title: High CPU Usage
        condition: C
        data:
          - refId: A
            relativeTimeRange:
              from: 600
              to: 0
            datasourceUid: prometheus
            model:
              expr: avg(rate(node_cpu_seconds_total{mode!="idle"}[5m])) by (instance)
          - refId: C
            datasourceUid: __expr__
            model:
              type: threshold
              conditions:
                - evaluator:
                    params:
                      - 0.85
                    type: gt
        noDataState: NoData
        execErrState: Alerting
        for: 5m
        annotations:
          summary: "CPU usage > 85% on {{ $labels.instance }}"
        labels:
          severity: warning
          team: infra
```

### GitOps 管理 Dashboard

对于大规模环境，推荐使用代码工具管理 Dashboard：

**Grafonnet（Jsonnet 库）**：

```jsonnet
local grafana = import 'grafonnet/grafana.libsonnet';
local dashboard = grafana.dashboard;
local row = grafana.row;
local prometheus = grafana.prometheus;
local template = grafana.template;

dashboard.new(
  'Node Exporter Overview',
  tags=['infra', 'node'],
)
.addTemplate(
  template.datasource(
    'datasource',
    'prometheus',
  )
)
.addRow(
  row.new('CPU')
  .addPanel(
    grafana.timeSeriesPanel.new(
      'CPU Usage',
      datasource='$datasource',
      gridPos={ h: 8, w: 12, x: 0, y: 0 },
    )
    .addTarget(
      prometheus.target(
        'avg(rate(node_cpu_seconds_total{mode!="idle"}[5m])) by (instance)',
      )
    )
  )
)
```

**Terraform grafana provider**：

```hcl
resource "grafana_dashboard" "node_overview" {
  folder      = grafana_folder.infra.id
  config_json = file("${path.module}/dashboards/node-overview.json")
}

resource "grafana_data_source" "prometheus" {
  type = "prometheus"
  name = "Prometheus"
  url  = "http://prometheus:9090"
}
```

## Grafana 插件生态

### 常用面板插件

| 插件名 | 功能 | 安装命令 |
|---|---|---|
| Clock | 时钟面板，显示当前时间 | `grafana-cli plugins install grafana-clock-panel` |
| Pie Chart | 饼图面板 | `grafana-cli plugins install grafana-piechart-panel` |
| Polystat | 多状态圆形聚合面板 | `grafana-cli plugins install grafana-polystat-panel` |
| FlowCharting | 流程图/拓扑图 | `grafana-cli plugins install agenty-flowcharting-panel` |
| Canvas | 自定义画布 | 内置（Grafana 11.x） |
| Table (Advanced) | 增强表格 | 内置 |

### 数据源插件

| 插件名 | 数据源 | 安装命令 |
|---|---|---|
| ClickHouse | ClickHouse 数据库 | `grafana-cli plugins install grafana-clickhouse-datasource` |
| MongoDB | MongoDB 数据库 | `grafana-cli plugins install grafana-mongodb-datasource` |
| Redis | Redis 数据库 | `grafana-cli plugins install redis-datasource` |
| Snowflake | Snowflake 数据仓库 | `grafana-cli plugins install grafana-snowflake-datasource` |
| Databricks | Databricks | `grafana-cli plugins install grafana-databricks-datasource` |

插件管理：

```bash
# 列出已安装插件
grafana-cli plugins ls

# 安装插件
grafana-cli plugins install <plugin-id>

# 更新插件
grafana-cli plugins update <plugin-id>

# 更新所有插件
grafana-cli plugins update-all

# 卸载插件
grafana-cli plugins remove <plugin-id>
```

安装插件后需重启 Grafana 服务。生产环境建议在 Dockerfile 或配置管理工具中声明插件列表，确保环境可重现。

### 企业版功能（Grafana Enterprise）

Grafana Enterprise 在开源版基础上提供企业级特性：

- **LDAP/SSO 集成**：SAML 2.0、OAuth 2.0、LDAP 直连
- **增强 RBAC**：细粒度权限控制（数据源级别、Query 级别）
- **Reporting**：定时生成 PDF 报告
- **Audit Logging**：操作审计日志
- **数据源权限**：控制用户对数据源的访问
- **Enterprise Plugins**：Oracle、Splunk、Datadog 等商业数据源
- **Unified Alerting**：增强的告警管理
- **白标定制**：自定义 Logo、主题、登录页

## Grafana 高可用部署

### 数据库后端

生产环境必须使用 PostgreSQL 或 MySQL 替代默认的 SQLite，SQLite 不支持并发写入，无法多实例共享：

```ini
# /etc/grafana/grafana.ini
[database]
type = postgres
host = postgres:5432
name = grafana
user = grafana
password = ${GF_DATABASE_PASSWORD}
ssl_mode = require
max_idle_conn = 10
max_open_conn = 100
conn_max_lifetime = 14400
```

### 高可用架构

```
                     +-------------------+
                     |  Load Balancer    |
                     |  (Nginx/HAProxy)  |
                     +---------+---------+
                               |
               +---------------+---------------+
               |               |               |
       +-------v-----+ +-------v-----+ +-------v-----+
       |  Grafana #1  | |  Grafana #2  | |  Grafana #3  |
       |  (port 3000) | |  (port 3000) | |  (port 3000) |
       +-------+------+ +-------+------+ +-------+------+
               |               |               |
               +---------------+---------------+
                               |
                    +----------v-----------+
                    |  PostgreSQL (HA)     |
                    |  (Primary + Replica) |
                    +----------------------+
                               |
                    +----------v-----------+
                    |  Redis (Session)     |
                    |  (Sentinel/Cluster)  |
                    +----------------------+
```

关键配置：

```ini
# Session 存储切换到 Redis
[session]
provider = redis
provider_config = addr=redis:6379,pool_size=100,db=0

# 健康检查
[healthcheck]
enable = true

# 允许多实例同时运行
[alerting]
execute_alerts = true
concurrent_render_limit = 5
```

### 注意事项

- 告警评估只需在一个实例上运行，通过数据库锁确保同一时刻只有一个实例执行告警评估
- Dashboard 报警图片渲染需要配置 `remote_cache` 或共享存储
- 建议至少部署 2 个实例，通过健康检查自动摘除故障节点

## 权限管理（RBAC）

### 权限层级

Grafana 的权限模型遵循 Organization → Folder → Dashboard 三级结构：

```
Organization (组织)
├── Folder: Infrastructure
│   ├── Dashboard: Node Overview      →  Team: Infra (Editor)
│   ├── Dashboard: K8s Cluster        →  Team: Infra (Editor)
│   └── Folder: Database
│       ├── Dashboard: MySQL Overview  →  Team: DBA (Editor)
│       └── Dashboard: Redis Monitor   →  Team: DBA (Editor)
├── Folder: Application
│   ├── Dashboard: API Performance    →  Team: Backend (Editor)
│   └── Dashboard: Frontend Metrics   →  Team: Frontend (Editor)
└── Folder: Business
    └── Dashboard: Business KPI       →  Role: Viewer (all)
```

### Team 和 Role

Grafana 提供四种内置角色：

| 角色 | 权限范围 |
|---|---|
| Organization Admin | 管理组织、用户、团队、数据源 |
| Organization Editor | 创建和编辑 Dashboard、查询数据源 |
| Organization Viewer | 查看 Dashboard、只读 |
| Grafana Admin | 管理整个 Grafana 实例（跨组织） |

权限可以在 Folder 级别覆盖组织级别：

```
Folder 权限设置：
  - Team: infra-infra  →  Editor (可编辑 Folder 下所有 Dashboard)
  - Team: dev-all      →  Viewer (只读)
  - User: admin-zhang  →  Admin (管理权限)
```

### Service Account

Service Account 用于 API 自动化场景，替代传统的 API Key：

```bash
# 创建 Service Account（通过 API）
curl -X POST -H "Authorization: Bearer $ADMIN_KEY" \
  -H "Content-Type: application/json" \
  -d '{"name":"ci-cd","role":"Editor"}' \
  "http://grafana:3000/api/serviceaccounts"

# 创建 Token
curl -X POST -H "Authorization: Bearer $ADMIN_KEY" \
  -H "Content-Type: application/json" \
  -d '{"name":"ci-cd-token"}' \
  "http://grafana:3000/api/serviceaccounts/$SA_ID/tokens"
```

Service Account 支持细粒度权限（Grafana Enterprise），可以限制为仅操作特定 Folder 或 Dashboard。

### LDAP/SSO/OAuth 集成

**LDAP 配置示例**：

```ini
[auth.ldap]
enabled = true
config_file = /etc/grafana/ldap.toml
allow_sign_up = true

# ldap.toml
[[servers]]
host = "ldap.example.com"
port = 636
use_ssl = true
ssl_skip_verify = false
bind_dn = "cn=grafana,ou=services,dc=example,dc=com"
bind_password = '${LDAP_BIND_PASSWORD}'
search_filter = "(sAMAccountName=%s)"
search_base_dns = ["ou=users,dc=example,dc=com"]

[servers.attributes]
name = "givenName"
surname = "sn"
username = "sAMAccountName"
email = "mail"

[[servers.group_mappings]]
group_dn = "cn=grafana-admins,ou=groups,dc=example,dc=com"
org_role = "Admin"

[[servers.group_mappings]]
group_dn = "cn=grafana-editors,ou=groups,dc=example,dc=com"
org_role = "Editor"

[[servers.group_mappings]]
group_dn = "*"
org_role = "Viewer"
```

**OAuth2（以 GitHub 为例）**：

```ini
[auth.github]
enabled = true
allow_sign_up = true
client_id = ${GITHUB_CLIENT_ID}
client_secret = ${GITHUB_CLIENT_SECRET}
scopes = user:email,read:org

# 通过组织membership映射角色
allowed_organizations = my-company
```

**SAML（企业版）**：

```ini
[auth.saml]
enabled = true
allow_sign_up = true
certificate_path = "/etc/grafana/saml/cert.pem"
private_key_path = "/etc/grafana/saml/key.pem"
idp_metadata_url = "https://idp.example.com/metadata"
```
