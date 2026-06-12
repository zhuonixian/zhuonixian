---
title: PromQL 进阶查询与最佳实践
icon: magnifying-glass-chart
date: 2026-06-13
category:
  - 技术
tag:
  - PromQL
  - Prometheus
  - 查询
  - 监控
  - 告警
---

## PromQL 数据模型基础

PromQL（Prometheus Query Language）是 Prometheus 的原生查询语言，理解其数据类型是写出高效查询的前提。

### 即时向量 vs 范围向量

**即时向量（Instant Vector）** 返回某一时刻的一组时间序列，每个序列只有一个采样值：

```promql
# 当前时刻所有实例的 CPU 空闲时间
node_cpu_seconds_total{mode="idle"}
```

**范围向量（Range Vector）** 返回一段时间内的所有采样值，每个序列包含多个数据点。范围向量不能直接用于展示，必须经过函数或聚合运算处理：

```promql
# 过去 5 分钟内 CPU 空闲时间的所有采样点
node_cpu_seconds_total{mode="idle"}[5m]
```

实际使用中，即时向量用于实时展示，范围向量作为 `rate()`、`avg_over_time()` 等函数的输入。

### 标量与字符串

**标量（Scalar）** 是一个简单的数字值，常用于算术运算：

```promql
# 标量乘法，将字节转换为 GB
node_memory_MemTotal_bytes / 1024 / 1024 / 1024
```

**字符串（String）** 在实际查询中较少使用，主要出现在某些函数的参数中（如 `label_replace` 的替换模板）。

### 时间选择器

范围选择器 `[5m]` 指定向前回溯的时间窗口。`offset` 修饰符将时间基准向前偏移，`@` 修饰符直接指定查询的时间戳：

```promql
# 过去 5 分钟的速率
rate(http_requests_total[5m])

# 昨天同一时刻的速率（偏移 24 小时）
rate(http_requests_total[5m] offset 24h)

# 查询指定 Unix 时间戳时的值
http_requests_total @ 1700000000

# 查询 1 小时前的值
process_resident_memory_bytes @ -1h
```

`offset` 常用于环比/同比对比，`@` 适用于故障复盘时回溯特定时刻的状态。

### 标签匹配器

四种匹配器覆盖了精确匹配和正则匹配两种场景：

```promql
# 精确匹配：等于
node_cpu_seconds_total{mode="idle"}

# 精确匹配：不等于
node_cpu_seconds_total{mode!="idle"}

# 正则匹配：匹配 idle 或 iowait
node_cpu_seconds_total{mode=~"idle|iowait"}

# 正则排除：不是 idle 也不是 iowait
node_cpu_seconds_total{mode!~"idle|iowait"}
```

正则匹配器使用 RE2 语法，`=~` 内部是全字符串匹配，因此 `mode=~"idle"` 等价于 `mode="idle"`。匹配多个值时用 `|` 连接。

## 常用操作符

### 算术运算

算术运算符 `+`、`-`、`*`、`/`、`%`、`^` 用于标量间、向量与标量间、向量间的计算：

```promql
# 将字节转换为 GiB
node_memory_MemAvailable_bytes / 1024 / 1024 / 1024

# 计算内存使用百分比
(1 - node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes) * 100

# HTTP 请求成功率（需配合 bool 修饰符做比较）
sum(rate(http_requests_total{code=~"2.."}[5m]))
  / sum(rate(http_requests_total[5m])) * 100
```

### 比较运算与 bool 修饰符

比较运算符 `==`、`!=`、>`、`<`、`>=`、`<=` 默认行为是过滤：只保留满足条件的序列。加上 `bool` 修饰符后，返回值为 0 或 1：

```promql
# 过滤：只返回磁盘使用率超过 80% 的分区
(1 - node_filesystem_avail_bytes / node_filesystem_size_bytes) * 100 > 80

# bool 修饰符：返回每个序列是否超过阈值（0 或 1），用于后续聚合
(1 - node_filesystem_avail_bytes / node_filesystem_size_bytes) * 100 > bool 80
```

`bool` 修饰符在计算「超阈值实例占比」这类场景中很有用。

### 向量匹配

当两个向量做运算时，默认按所有标签做笛卡尔匹配。`on()` 指定只按哪些标签匹配，`ignoring()` 指定忽略哪些标签。多对一/一对多匹配需要 `group_left()` 或 `group_right()`：

```promql
# 按 method 标签匹配，计算错误数占总请求数的比例
sum(rate(http_requests_total{code=~"5.."}[5m])) by (method)
  / on(method)
sum(rate(http_requests_total[5m])) by (method)

# group_left：将命名空间配额信息关联到 Pod 用量
sum(container_memory_working_set_bytes) by (namespace)
  / on(namespace)
group_left
kube_resourcequota{type="hard", resource="requests.memory"}
```

`group_left` 左侧可以有多条序列对应右侧一条序列，这在关联元数据指标（如 K8s 资源配额）时非常常用。

### 聚合运算

聚合运算按标签分组后对值进行汇总：

```promql
# 所有实例 CPU 使用率总和
sum(rate(node_cpu_seconds_total{mode!="idle"}[5m])) by (instance)

# 各命名空间平均内存使用
avg(container_memory_working_set_bytes) by (namespace)

# CPU 使用率最高的 5 个实例
topk(5, avg by (instance) (rate(node_cpu_seconds_total{mode!="idle"}[5m])))

# P99 延迟
histogram_quantile(0.99,
  sum(rate(http_request_duration_seconds_bucket[5m])) by (le)
)

# 磁盘使用率最低的 3 个分区
bottomk(3, (1 - node_filesystem_avail_bytes / node_filesystem_size_bytes))
```

`by ()` 保留指定标签做分组，`without ()` 排除指定标签后对其余标签分组。`topk` 和 `bottomk` 常用于排行榜类面板。

## 内置函数详解

### rate() / irate() / increases()

这三个函数专门处理 Counter 类型指标（只增不减的计数器）：

```promql
# rate：计算范围向量内的平均每秒增长率，适合图表和告警
rate(http_requests_total[5m])

# irate：仅使用最后两个数据点计算瞬时增长率，适合精细的尖峰分析
irate(http_requests_total[5m])

# increase：计算范围向量内的总增量（等价于 rate * 窗口秒数）
increase(http_requests_total[1h])
```

选择建议：仪表盘用 `rate()` 看趋势，`irate()` 看尖峰，`increase()` 眗总量。告警规则统一使用 `rate()`，因为 `irate()` 对瞬时波动过于敏感。

### histogram_quantile()

从 Histogram 的 `_bucket` 指标计算分位数值：

```promql
# P95 请求延迟（秒）
histogram_quantile(0.95,
  sum(rate(http_request_duration_seconds_bucket[5m])) by (le)
)

# 按服务分组的 P99 延迟
histogram_quantile(0.99,
  sum(rate(http_request_duration_seconds_bucket[5m])) by (le, service)
)
```

关键点：`le` 标签（less than or equal）必须保留在聚合结果中，否则函数无法工作。`by (le)` 是最小聚合，`by (le, service)` 则按服务分组计算各自的分位数。

### predict_linear()

基于范围向量内的数据做简单线性回归，预测未来某个时间点的值：

```promql
# 预测 4 小时后磁盘剩余空间，若小于 0 说明即将耗尽
predict_linear(node_filesystem_avail_bytes{mountpoint="/"}[1h], 4 * 3600) < 0
```

参数 `[1h]` 是历史数据窗口，`4 * 3600` 是预测的秒数（4 小时）。窗口不宜太短（噪声大）也不宜太长（变化趋势被平滑掉），1~6 小时是常见选择。

### absent() / absent_over_time()

检测指标是否缺失，返回空则表示存在，返回单条 `{}` 值为 1 表示缺失：

```promql
# 检测某个 Job 是否完全无数据（Job 挂了）
absent(up{job="my-app"})

# 检测过去 10 分钟内是否完全没有数据
absent_over_time(up{job="my-app"}[10m])
```

这两个函数是「黑盒监控」的基础：当目标宕机导致完全无数据时，常规阈值告警无法触发，必须用 `absent` 检测。

### label_replace() / label_join()

在查询中动态修改标签，用于跨指标关联或补全标签信息：

```promql
# 从 instance 标签中提取 IP 地址写入新标签
label_replace(up{job="node"}, "ip", "$1", "instance", "(.*):.*")

# 将 namespace 和 pod 标签拼接为完整路径
label_join(
  container_memory_working_set_bytes,
  "path", "/", "namespace", "pod"
)
```

`label_replace` 的正则捕获组用 `$1`、`$2` 引用。这类函数常用于解决不同指标间标签命名不一致的问题。

### time() / timestamp()

```promql
# 当前查询时间（Unix 时间戳）
time()

# 每个采样点的时间戳
timestamp(up)

# 计算 Exporter 最后一次抓取距今多久（秒）
time() - timestamp(up)
```

`time() - timestamp(up)` 是检测 Exporter 是否失联的重要手段，如果值远大于抓取间隔，说明目标可能存在问题。

## Recording Rules 设计模式

### 为什么要用 Recording Rules

Recording Rules 将频繁执行的复杂查询预先计算并保存为新的时间序列，优势包括：

- **降低查询延迟**：仪表盘直接查询预计算结果，无需实时计算
- **减少 Prometheus 负载**：避免每次刷新面板都执行昂贵的聚合
- **提高告警可靠性**：告警基于预计算指标，响应更快
- **复用查询逻辑**：多个面板和告警共享同一规则

### 常用 Rules 模板

```yaml
groups:
  - name: node_rules
    interval: 30s
    rules:
      # CPU 使用率
      - record: node:cpu_usage:ratio
        expr: |
          1 - avg by (instance) (rate(node_cpu_seconds_total{mode="idle"}[5m]))

      # 内存使用率
      - record: node:memory_usage:ratio
        expr: |
          1 - node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes

      # 磁盘使用率
      - record: node:disk_usage:ratio
        expr: |
          1 - node_filesystem_avail_bytes / node_filesystem_size_bytes

      # 磁盘空间预测（4 小时后耗尽）
      - record: node:disk_full prediction:bytes
        expr: |
          predict_linear(node_filesystem_avail_bytes[1h], 4 * 3600)

  - name: kubernetes_rules
    interval: 30s
    rules:
      # 容器 CPU 使用占 request 的比例
      - record: container:cpu_usage:ratio_to_request
        expr: |
          sum(rate(container_cpu_usage_seconds_total{container!=""}[5m])) by (namespace, pod)
          / on(namespace, pod)
          kube_pod_container_resource_requests{resource="cpu"}

      # 容器内存使用占 limit 的比例
      - record: container:memory_usage:ratio_to_limit
        expr: |
          container_memory_working_set_bytes{container!=""}
          / on(namespace, pod)
          kube_pod_container_resource_limits{resource="memory"}
```

### 命名约定

Recording Rule 的命名遵循 `level:metric:operations` 格式：

```
node:cpu_usage:ratio          # 节点级 / CPU 使用率 / 比率
container:memory_usage:ratio_to_request  # 容器级 / 内存使用 / 相对请求值的比率
http:requests:rate5m          # HTTP 级 / 请求数 / 5分钟速率
```

- **level**：指标所属的层级（node、container、http、app 等）
- **metric**：指标的核心含义
- **operations**：应用的操作或聚合方式

统一命名让团队成员一眼就能理解指标的含义和来源。

## 告警规则编写最佳实践

### for 持续时间

`for` 字段指定条件必须持续满足多长时间才触发告警，用于过滤瞬时毛刺：

```yaml
# 错误：无 for 字段，瞬时抖动即触发告警
- alert: HighCPU
  expr: node:cpu_usage:ratio > 0.9

# 正确：持续 5 分钟超过 90% 才告警
- alert: HighCPU
  expr: node:cpu_usage:ratio > 0.9
  for: 5m
```

`for` 时长选择原则：关键业务（数据库、网关）用 2~5 分钟，一般服务用 5~15 分钟，趋势类告警（磁盘容量预测）用 15~60 分钟。

### 告警严重度分级

```yaml
# Critical：需要立即响应，影响核心业务
- alert: ServiceDown
  expr: up == 0
  for: 2m
  labels:
    severity: critical
  annotations:
    summary: "服务 {{ $labels.job }} 实例 {{ $labels.instance }} 已宕机"

# Warning：需要关注但不紧急
- alert: HighMemoryUsage
  expr: node:memory_usage:ratio > 0.85
  for: 10m
  labels:
    severity: warning
  annotations:
    summary: "节点 {{ $labels.instance }} 内存使用率超过 85%"

# Info：仅供参考，通常不需要人工干预
- alert: PodRestart
  expr: increase(kube_pod_container_status_restarts_total[1h]) > 3
  for: 5m
  labels:
    severity: info
  annotations:
    summary: "Pod {{ $labels.namespace }}/{{ $labels.pod }} 1 小时内重启超过 3 次"
```

### 告警模板 annotations

完整的 annotations 模板提供三个关键字段：

```yaml
annotations:
  summary: "节点 {{ $labels.instance }} 磁盘 {{ $labels.mountpoint }} 使用率 {{ $value | printf "%.1f" }}%"
  description: |
    节点 {{ $labels.instance }} 的 {{ $labels.mountpoint }} 分区磁盘使用率已持续 10 分钟超过 85%。
    当前值: {{ $value | printf "%.1f" }}%
    建议检查日志清理策略或扩容磁盘。
  runbook_url: "https://wiki.internal/runbook/disk-full"
```

- **summary**：一句话概括，用于通知标题
- **description**：详细描述，包含当前值、影响范围和建议操作
- **runbook_url**：指向操作手册，降低响应门槛

### 避免「告警风暴」

当某个节点故障导致其上所有 Pod 都告警时，会形成告警风暴。用 `group_left` 做聚合告警：

```yaml
# 不推荐：每个 Pod 单独告警，一个节点挂掉可能产生几十条告警
- alert: PodNotReady
  expr: kube_pod_status_phase{phase!="Running"} == 1

# 推荐：按节点聚合，一个节点只产生一条告警
- alert: NodeHasUnreadyPods
  expr: |
    count(kube_pod_status_phase{phase!="Running"} == 1) by (node)
    > 5
  for: 5m
  labels:
    severity: warning
  annotations:
    summary: "节点 {{ $labels.node }} 上有 {{ $value }} 个非 Running 状态的 Pod"
```

### 多条件告警

结合阈值和趋势做更精准的判断：

```yaml
# 磁盘使用率超过 80% 且预测 4 小时内耗尽
- alert: DiskWillFull
  expr: |
    (node:disk_usage:ratio > 0.8)
    and (node:disk_full_prediction:bytes < 0)
  for: 15m
  labels:
    severity: warning
  annotations:
    summary: "节点 {{ $labels.instance }} 磁盘 {{ $labels.mountpoint }} 将在 4 小时内耗尽"
```

## 性能优化技巧

### 减少范围向量窗口

范围窗口越大，需要加载的原始数据越多。在满足业务需求的前提下，尽量缩短窗口：

```promql
# 较重的查询：加载 1 小时数据
rate(http_requests_total[1h])

# 较轻的查询：加载 5 分钟数据，通常足够
rate(http_requests_total[5m])
```

### 避免高基数查询

高基数指标（如包含 `user_id`、`request_id` 的指标）会生成大量时间序列，导致查询极慢。优化手段：

```promql
# 错误：对高基数指标做全量查询
http_request_duration_seconds{user_id=~".*"}

# 正确：先用 by 聚合降低基数再查询
sum(rate(http_request_duration_seconds_bucket[5m])) by (le, method)

# 排查高基数指标
# 在 Prometheus UI 的 /status 页面查看 Top 10 Highest Cardinality Metrics
```

### 使用 Recording Rules 预计算

将 Dashboard 和告警中频繁使用的复杂查询提取为 Recording Rules：

```yaml
# 原始查询（每次刷新面板都要计算）
histogram_quantile(0.99,
  sum(rate(http_request_duration_seconds_bucket[5m])) by (le, service)
)

# 提取为 Recording Rule
- record: http:request_duration:p99
  expr: |
    histogram_quantile(0.99,
      sum(rate(http_request_duration_seconds_bucket[5m])) by (le, service)
    )
```

面板直接使用 `http:request_duration:p99` 查询，响应速度提升数倍。

### 查询超时处理

Prometheus 默认查询超时由 `--query.timeout` 控制（默认 2 分钟）。在 API 调用时可通过 `timeout` 参数设置更短的超时：

```
GET /api/v1/query?query=...&timeout=30s
```

对于 Grafana 面板，建议将数据源的超时设置为 30~60 秒，避免慢查询阻塞整个面板加载。

### API 调用优化

```
# 即时查询：返回某一时刻的值，适合当前状态面板
GET /api/v1/query?query=up&time=1700000000

# 范围查询：返回时间区间内的值，适合趋势图表
GET /api/v1/query_range?query=rate(http_requests_total[5m])&start=1700000000&end=1700003600&step=60
```

选择原则：展示当前状态用 `/query`，绘制趋势图用 `/query_range`。`step` 参数建议设置为抓取间隔的 2~4 倍，过小会产生过多数据点，过大则丢失细节。

## 常用查询模板

### 容器 CPU Top N

```promql
# CPU 使用率最高的 10 个容器（核数）
topk(10,
  sum(rate(container_cpu_usage_seconds_total{container!="", namespace!=""}[5m]))
    by (namespace, pod, container)
)
```

适用于定位 CPU 资源消耗大户，在资源优化和容量规划时使用。

### 容器内存 Top N

```promql
# 内存使用最高的 10 个容器（MiB）
topk(10,
  sum(container_memory_working_set_bytes{container!="", namespace!=""})
    by (namespace, pod, container) / 1024 / 1024
)
```

### Pod 重启次数统计

```promql
# 过去 1 小时内重启次数最多的 Pod
topk(20,
  sort_desc(
    sum(increase(kube_pod_container_status_restarts_total[1h]))
      by (namespace, pod)
  )
)
```

频繁重启通常意味着 CrashLoopBackOff 或 OOMKilled，需要排查应用日志和资源限制。

### K8s 资源配额使用率

```promql
# 命名空间 CPU Request 使用率
sum(kube_pod_container_resource_requests{resource="cpu"}) by (namespace)
  / on(namespace)
sum(kube_resourcequota{type="hard", resource="requests.cpu"}) by (namespace)
  * 100

# 命名空间 Memory Limit 使用率
sum(kube_pod_container_resource_limits{resource="memory"}) by (namespace)
  / on(namespace)
sum(kube_resourcequota{type="hard", resource="limits.memory"}) by (namespace)
  * 100
```

### HTTP 错误率

```promql
# 5xx 错误率（百分比）
sum(rate(http_requests_total{code=~"5.."}[5m]))
  / sum(rate(http_requests_total[5m]))
  * 100

# 按服务分组的 5xx 错误率
sum(rate(http_requests_total{code=~"5.."}[5m])) by (service)
  / on(service)
sum(rate(http_requests_total[5m])) by (service)
  * 100
```

### P95 / P99 延迟计算

```promql
# 全局 P95 延迟（秒）
histogram_quantile(0.95,
  sum(rate(http_request_duration_seconds_bucket[5m])) by (le)
)

# 按服务和方法分组的 P99 延迟
histogram_quantile(0.99,
  sum(rate(http_request_duration_seconds_bucket[5m])) by (le, service, method)
)

# 按服务分组，只看 P99 超过 500ms 的服务
histogram_quantile(0.99,
  sum(rate(http_request_duration_seconds_bucket[5m])) by (le, service)
) > 0.5
```

`histogram_quantile` 返回的单位与原始 Bucket 的 `le` 标签单位一致。如果 `_seconds_bucket` 返回的是秒，则结果也是秒；如果客户端上报的是毫秒，结果就是毫秒。
