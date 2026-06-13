---
title: Alertmanager 告警管理体系
icon: bell
order: 3
date: 2026-06-13
category:
  - 技术
tag:
  - Alertmanager
  - Prometheus
  - 告警
  - SRE
  - On-Call
---

## 告警管理核心概念

告警管理是 SRE 工作的核心能力之一。一个设计良好的告警体系能帮助团队在故障发生时快速定位问题，而设计糟糕的告警体系则会让 On-Call 工程师陷入"狼来了"的困境。

### 告警生命周期

每一条告警都有明确的生命周期：

```
┌──────────┐    条件满足     ┌──────────┐    条件恢复     ┌───────────┐
│  Pending  │──────────────>│  Firing   │──────────────>│  Resolved  │
│ (等待中)  │  (等待for时长) │ (触发中)   │  (指标恢复正常) │ (已恢复)    │
└──────────┘               └──────────┘               └───────────┘
```

- **Pending**：Prometheus 检测到条件满足，但尚未达到 `for` 持续时长阈值
- **Firing**：条件持续满足超过 `for` 时长，告警被推送到 Alertmanager
- **Resolved**：条件不再满足，告警自动恢复

### 告警 vs 事件 vs 日志

| 维度 | 日志(Log) | 事件(Event) | 告警(Alert) |
|------|-----------|-------------|-------------|
| 目的 | 记录系统行为 | 记录状态变更 | 请求人工干预 |
| 频率 | 高频，每秒数千条 | 中频，按需触发 | 低频，仅在异常时 |
| 消费者 | 机器/自动化 | 监控系统 | 人（On-Call 工程师） |
| 示例 | `request GET /api status=200` | `CPU usage changed from 45% to 82%` | `CPU > 90% for 5m` |

关键区别：**告警必须是需要人工干预的**。如果一个"告警"不需要人做任何事，它就不应该是告警，而应该是事件或日志。

### 告警疲劳（Alert Fatigue）

当 On-Call 工程师持续收到大量无效或低优先级告警时，会产生告警疲劳。表现为：

- 忽略告警通知，不再及时响应
- 关闭通知渠道（静音手机、关闭 Slack 通知）
- 对真正的紧急告警也反应迟钝

Google SRE 书籍中的数据：**每多处理一条无关告警，对真正紧急事件的响应时间平均增加 2-5 分钟**。

解决告警疲劳的核心策略：

1. **只对 Symptom（症状）告警**，不对 Cause（原因）告警——用户不关心磁盘满了，用户关心的是服务慢了
2. **消除不可操作的告警**——如果告警没有对应的 Runbook，就删除它
3. **合理使用抑制和静默**——减少级联告警
4. **定期评审告警有效性**——每季度清理一次告警规则

## Alertmanager 架构

Alertmanager 是 Prometheus 生态中负责告警路由、去重、分组、抑制和静默的核心组件。

```
                        Alertmanager 架构
 ┌─────────────────────────────────────────────────────┐
 │                   Alertmanager                       │
 │                                                      │
 │  ┌──────┐   ┌────────────┐   ┌──────────────────┐  │
 │  │ API  │──>│ Dispatcher  │──>│ Notification     │  │
 │  │      │   │ (路由分发)   │   │ Pipeline         │  │
 │  └──────┘   └─────┬──────┘   │ (去重/分组/限流)   │  │
 │      ^            │          └────────┬─────────┘  │
 │      │            │                   │             │
 │      │       ┌────┴─────┐            │             │
 │      │       │ Silences │            │             │
 │      │       │ (静默规则) │            │             │
 │      │       └──────────┘            │             │
 │      │                               v             │
 │      │                    ┌─────────────────────┐  │
 │  Prometheus               │    Receivers         │  │
 │  (推送告警)                │  Email / Slack /     │  │
 │                           │  Webhook / PagerDuty │  │
 │                           └─────────────────────┘  │
 └─────────────────────────────────────────────────────┘
```

核心组件说明：

- **API**：接收来自 Prometheus 的告警推送（v1/v2 API）
- **Dispatcher**：根据路由树将告警分发到对应的通知渠道
- **Silences**：存储静默规则，匹配到的告警不会发送通知
- **Notification Pipeline**：负责告警的去重（Dedup）、分组（Grouping）、抑制（Inhibit）和限流（Rate Limit）

## 路由（Routing）

路由是 Alertmanager 最核心的功能，它定义了告警如何被分发到不同的通知渠道。路由采用树形结构，每条告警从根节点开始逐级匹配。

```
                    root route
                   /    |     \
                  /     |      \
          critical   warning    info
             |          |         |
         PagerDuty   Slack     Email
```

关键参数说明：

- **group_by**：按哪些标签分组，同组告警合并为一条通知
- **group_wait**：新分组的第一条告警等待多久再发送（等待同组更多告警一起发送）
- **group_interval**：同组有新告警时，两次通知之间的最小间隔
- **repeat_interval**：同一条告警重复通知的最小间隔

以下是一个完整的多级路由配置：

```yaml
route:
  receiver: 'default-email'
  group_by: ['alertname', 'cluster']
  group_wait: 30s
  group_interval: 5m
  repeat_interval: 4h

  routes:
    # P1/P2 级别告警 -> PagerDuty（立即通知）
    - matchers:
        - severity =~ "critical|high"
      receiver: 'pagerduty-critical'
      group_wait: 10s
      group_interval: 1m
      repeat_interval: 30m

    # P3 级别告警 -> Slack（工作时间内通知）
    - matchers:
        - severity = "warning"
      receiver: 'slack-warning'
      group_wait: 1m
      group_interval: 5m
      repeat_interval: 2h
      routes:
        # 数据库相关 warning 单独分组
        - matchers:
            - team = "database"
          receiver: 'slack-dba'
          group_by: ['alertname', 'namespace']

    # P4/Info 级别告警 -> Email（批量通知）
    - matchers:
        - severity = "info"
      receiver: 'email-info'
      group_wait: 5m
      group_interval: 30m
      repeat_interval: 24h

receivers:
  - name: 'default-email'
    email_configs:
      - to: 'oncall@example.com'
        from: 'alertmanager@example.com'
        smarthost: 'smtp.example.com:587'

  - name: 'pagerduty-critical'
    pagerduty_configs:
      - routing_key: '<pagerduty-integration-key>'
        severity: 'critical'

  - name: 'slack-warning'
    slack_configs:
      - api_url: 'https://hooks.slack.com/services/xxx'
        channel: '#alerts-warning'

  - name: 'slack-dba'
    slack_configs:
      - api_url: 'https://hooks.slack.com/services/xxx'
        channel: '#dba-alerts'

  - name: 'email-info'
    email_configs:
      - to: 'team@example.com'
        from: 'alertmanager@example.com'
        smarthost: 'smtp.example.com:587'
```

`match` 使用精确匹配，`match_re` 使用正则匹配。新版本推荐使用 `matchers` 语法，支持 `=` 精确匹配和 `=~` 正则匹配。

## 抑制（Inhibition）

抑制机制允许在特定条件下自动静默某些告警。典型场景：当高级别告警触发时，自动抑制与之相关的低级别告警，避免告警风暴。

```yaml
inhibit_rules:
  # 节点宕机时，抑制该节点上所有服务的告警
  - source_matchers:
      - alertname = "NodeDown"
    target_matchers:
      - alertname =~ "ServiceDown|HighErrorRate|PodCrashLooping"
    equal:
      - instance

  # 集群级别故障时，抑制该集群内所有命名空间的告警
  - source_matchers:
      - alertname = "ClusterUnreachable"
    target_matchers:
      - severity =~ "warning|info"
    equal:
      - cluster

  # 主库故障时，抑制从库同步延迟告警
  - source_matchers:
      - alertname = "MySQLMasterDown"
      - severity = "critical"
    target_matchers:
      - alertname = "MySQLReplicationLag"
    equal:
      - cluster
```

`equal` 字段指定了必须匹配的标签。只有当 `source` 告警和 `target` 告警在 `equal` 指定的标签上值完全相同时，抑制才会生效。这确保了精确的关联关系——节点 A 宕机只抑制节点 A 上的服务告警，不会影响节点 B。

## 静默（Silences）

静默是一种临时机制，用于在特定时间窗口内暂停匹配告警的通知发送。

### 使用场景

| 场景 | 说明 | 示例 |
|------|------|------|
| 计划维护 | 已知维护窗口内的预期告警 | 数据库升级，暂停该集群告警 |
| 已知问题 | 问题已确认正在处理，无需重复通知 | 已创建 Incident，等待修复 |
| 测试环境 | 非生产环境的告警不需要通知 | 静默 `env=staging` 的所有告警 |
| 误报处理 | 告警规则误触发，等待修复 | 暂时静默该规则 |

### 静默匹配器

```bash
# 通过 amtool 创建静默（静默 prod-cluster-01 的所有告警，持续 2 小时）
amtool silence add \
  --author "zhangsan@example.com" \
  --comment "计划维护：内核升级" \
  --duration 2h \
  instance=prod-cluster-01

# 静默特定告警名称
amtool silence add \
  --author "zhangsan@example.com" \
  --comment "已知问题：JIRA-1234" \
  --duration 24h \
  alertname=DiskSpaceWarning cluster=prod

# 正则匹配
amtool silence add \
  --author "zhangsan@example.com" \
  --comment "测试环境告警暂停" \
  --duration 168h \
  env=~"staging|dev"

# 查看当前所有静默
amtool silence query

# 查看即将过期的静默（1小时内）
amtool silence query --expired --within=1h

# 删除静默
amtool silence expire <silence-id>
```

静默管理的关键原则：

1. **必须填写 comment**——说明静默原因和预期恢复时间
2. **必须设置过期时间**——永远不要创建永久静默
3. **定期审计**——每周检查是否有已过期的静默应该被清理
4. **最小范围**——静默条件尽量精确，避免误杀无关告警

## 通知渠道集成

### Email 配置

```yaml
receivers:
  - name: 'email-team'
    email_configs:
      - to: 'oncall@example.com'
        from: 'alertmanager@example.com'
        smarthost: 'smtp.example.com:587'
        auth_username: 'alertmanager@example.com'
        auth_password: '<smtp-password>'
        headers:
          Subject: '[{{ .Status | toUpper }}] {{ .CommonLabels.alertname }}'
        html: '{{ template "email.default.html" . }}'
        send_resolved: true
```

### Slack 配置

```yaml
receivers:
  - name: 'slack-alerts'
    slack_configs:
      - api_url: 'https://hooks.slack.com/services/T00/B00/xxx'
        channel: '#production-alerts'
        title: '{{ .CommonLabels.alertname }}'
        text: >-
          {{ range .Alerts }}
          *Alert:* {{ .Annotations.summary }}
          *Severity:* {{ .Labels.severity }}
          *Runbook:* {{ .Annotations.runbook_url }}
          {{ end }}
        send_resolved: true
```

### 飞书/钉钉 Webhook 集成

飞书和钉钉不提供 Alertmanager 原生支持，需要通过 Webhook + 自定义模板的方式集成。核心思路是编写一个中间服务接收 Alertmanager 的通知，转换为飞书/钉钉的消息格式后转发。

```go
// 自定义 Webhook 接收端（飞书/钉钉适配器）
package main

import (
    "bytes"
    "encoding/json"
    "fmt"
    "io"
    "log"
    "net/http"
    "strings"
    "text/template"
    "time"
)

// Alertmanager 发送的告警通知结构
type AMNotification struct {
    Status   string  `json:"status"`
    Receiver string  `json:"receiver"`
    Alerts   []Alert `json:"alerts"`
    GroupLabels  map[string]string `json:"groupLabels"`
    CommonLabels map[string]string `json:"commonLabels"`
}

type Alert struct {
    Status      string            `json:"status"`
    Labels      map[string]string `json:"labels"`
    Annotations map[string]string `json:"annotations"`
    StartsAt    time.Time         `json:"startsAt"`
    EndsAt      time.Time         `json:"endsAt"`
    Fingerprint string            `json:"fingerprint"`
}

// 飞书消息结构
type FeishuMessage struct {
    MsgType string        `json:"msg_type"`
    Content FeishuContent `json:"content"`
}

type FeishuContent struct {
    Text string `json:"text"`
}

func buildAlertText(notif AMNotification) string {
    var sb strings.Builder
    status := strings.ToUpper(notif.Status)
    sb.WriteString(fmt.Sprintf("[%s] %s\n", status, notif.CommonLabels["alertname"]))

    for _, alert := range notif.Alerts {
        sb.WriteString(fmt.Sprintf("  - Instance: %s\n", alert.Labels["instance"]))
        sb.WriteString(fmt.Sprintf("    Summary: %s\n", alert.Annotations["summary"]))
        sb.WriteString(fmt.Sprintf("    Severity: %s\n", alert.Labels["severity"]))
        if runbook, ok := alert.Annotations["runbook_url"]; ok {
            sb.WriteString(fmt.Sprintf("    Runbook: %s\n", runbook))
        }
        sb.WriteString(fmt.Sprintf("    Since: %s\n", alert.StartsAt.Format("2006-01-02 15:04:05")))
    }
    return sb.String()
}

func alertHandler(webhookURL string) http.HandlerFunc {
    return func(w http.ResponseWriter, r *http.Request) {
        body, err := io.ReadAll(r.Body)
        if err != nil {
            http.Error(w, "read body failed", http.StatusBadRequest)
            return
        }
        defer r.Body.Close()

        var notif AMNotification
        if err := json.Unmarshal(body, &notif); err != nil {
            http.Error(w, "parse body failed", http.StatusBadRequest)
            return
        }

        text := buildAlertText(notif)
        msg := FeishuMessage{
            MsgType: "text",
            Content: FeishuContent{Text: text},
        }

        msgBytes, _ := json.Marshal(msg)
        resp, err := http.Post(webhookURL, "application/json", bytes.NewReader(msgBytes))
        if err != nil {
            log.Printf("send to feishu failed: %v", err)
            http.Error(w, "forward failed", http.StatusBadGateway)
            return
        }
        defer resp.Body.Close()

        if resp.StatusCode != http.StatusOK {
            log.Printf("feishu returned status: %d", resp.StatusCode)
            http.Error(w, "feishu rejected", resp.StatusCode)
            return
        }

        w.WriteHeader(http.StatusOK)
    }
}

func main() {
    feishuWebhook := "https://open.feishu.cn/open-apis/bot/v2/hook/xxx"
    http.HandleFunc("/alerts", alertHandler(feishuWebhook))
    log.Fatal(http.ListenAndServe(":9095", nil))
}
```

Alertmanager 侧配置对应的 Webhook Receiver：

```yaml
receivers:
  - name: 'feishu'
    webhook_configs:
      - url: 'http://alertmanager-feishu-adapter:9095/alerts'
        send_resolved: true
```

## 告警模板

Alertmanager 使用 Go template 语法自定义通知内容，允许在告警中包含丰富的上下文信息。

```yaml
# alertmanager.yml 全局配置
templates:
  - '/etc/alertmanager/templates/*.tmpl'
```

创建模板文件 `/etc/alertmanager/custom.tmpl`：

```
{{ define "slack.default.title" }}
[{{ .Status | toUpper }}{{ if eq .Status "firing" }}:{{ .Alerts.Firing | len }}{{ end }}] {{ .CommonLabels.alertname }}
{{ end }}

{{ define "slack.default.text" }}
{{ range .Alerts }}
*Severity:* `{{ .Labels.severity }}`
*Instance:* `{{ .Labels.instance }}`
*Namespace:* `{{ .Labels.namespace }}`

*Summary:* {{ .Annotations.summary }}
*Description:* {{ .Annotations.description }}

{{ if .Annotations.runbook_url }}*Runbook:* {{ .Annotations.runbook_url }}{{ end }}
{{ if .Annotations.dashboard_url }}*Dashboard:* {{ .Annotations.dashboard_url }}{{ end }}

*Since:* {{ .StartsAt.Format "2006-01-02 15:04:05 MST" }}
---
{{ end }}
{{ end }}
```

在 Prometheus 告警规则中声明这些注解字段：

```yaml
groups:
  - name: node-alerts
    rules:
      - alert: NodeDown
        expr: up{job="node-exporter"} == 0
        for: 5m
        labels:
          severity: critical
          team: infrastructure
        annotations:
          summary: "Node {{ $labels.instance }} is down"
          description: "Node {{ $labels.instance }} has been unreachable for more than 5 minutes."
          runbook_url: "https://runbook.example.com/node-down"
          dashboard_url: "https://grafana.example.com/d/node-overview?var-instance={{ $labels.instance }}"
```

## Alertmanager 高可用

生产环境必须部署多实例 Alertmanager 以避免单点故障。Alertmanager 通过 Gossip 协议在实例间同步静默规则和通知状态。

```
                  Prometheus (x3)
                  /      |       \
                 v       v        v
         +-------+  +--------+  +-------+
         |  AM-1 |  |  AM-2  |  |  AM-3 |
         | :9093 |  | :9093  |  | :9093 |
         +---+---+  +---+----+  +---+---+
             \         |          /
              \        |         /
               +-------+--------+
              Gossip 协议 (port 9094)
              同步内容:
              - Silences (静默规则)
              - Notifications (通知状态)
              - NFLog (通知日志，用于去重)
```

启动参数：

```bash
# AM-1
alertmanager \
  --config.file=/etc/alertmanager/alertmanager.yml \
  --web.listen-address=:9093 \
  --cluster.listen-address=0.0.0.0:9094 \
  --cluster.peer=am-2:9094 \
  --cluster.peer=am-3:9094

# AM-2
alertmanager \
  --config.file=/etc/alertmanager/alertmanager.yml \
  --web.listen-address=:9093 \
  --cluster.listen-address=0.0.0.0:9094 \
  --cluster.peer=am-1:9094 \
  --cluster.peer=am-3:9094

# AM-3
alertmanager \
  --config.file=/etc/alertmanager/alertmanager.yml \
  --web.listen-address=:9093 \
  --cluster.listen-address=0.0.0.0:9094 \
  --cluster.peer=am-1:9094 \
  --cluster.peer=am-2:9094
```

Prometheus 侧需要配置所有 Alertmanager 实例：

```yaml
alerting:
  alertmanagers:
    - static_configs:
        - targets:
            - am-1:9093
            - am-2:9093
            - am-3:9093
```

高可用的关键机制：

- **去重**：即使 Prometheus 向所有 AM 实例发送了同一告警，Notification Pipeline 通过 `fingerprint` 去重，确保只发送一次通知
- **Gossip 同步**：任一实例上创建的静默规则会自动同步到其他实例
- **NFLog 共享**：通知日志在集群间共享，确保 failover 后不会重复发送通知
- **建议奇数实例**：3 或 5 个实例，兼顾可用性和网络开销

## 告警质量治理

告警不是一次配置就结束的工作，需要持续的运营和治理。

### 告警分级标准

| 级别 | 名称 | 响应时间 | 通知渠道 | 示例 |
|------|------|----------|----------|------|
| P1 | Critical | 立即（< 5 分钟） | PagerDuty + 电话 | 核心服务全部不可用 |
| P2 | High | 30 分钟内 | PagerDuty / 飞书 | 单可用区故障、数据库主库切换 |
| P3 | Warning | 工作时间内 | Slack / 飞书 | 磁盘使用率 > 80%、响应延迟上升 |
| P4 | Info | 不需要响应 | Email / 日志 | 部署完成通知、证书即将过期（>30天） |

### 告警到事件到事故的转化

```
告警 (Alert)          事件 (Incident)          事故 (Outage)
  个体指标异常    -->   影响用户/业务的      -->   造成 SLA 违约的
  自动触发              相关告警聚合              重大服务中断
                        人工确认
```

不是所有告警都会变成事件，也不是所有事件都会升级为事故。但每一起事故都应该能追溯到最初的告警——如果追溯不到，说明告警覆盖有盲区。

### 告警有效性评审

建议每周进行一次告警评审会议（Alert Review），关注以下指标：

- **告警总量趋势**：本周 vs 上周，是否显著增加
- **噪音率（Noise Rate）**：`无需响应的告警数 / 告警总数`，目标 < 10%
- **平均确认时间（MTTA）**：从告警触发到人工确认的平均时间
- **告警风暴事件**：单次故障触发了多少条关联告警
- **静默使用率**：频繁被静默的告警规则是否应该调整或删除

使用 amtool 输出告警统计：

```bash
# 查看当前所有活跃告警
amtool alert query --output=extended

# 按 alertname 统计告警数量
amtool alert query --output=extended | \
  jq -r '.[].labels.alertname' | \
  sort | uniq -c | sort -rn

# 检查配置文件语法
amtool check-config /etc/alertmanager/alertmanager.yml
```

### 降低噪音率的具体策略

1. **调整 for 时长**——瞬时的毛刺不应该触发告警，`for: 5m` 是常见起始值
2. **调整阈值**——根据历史 P99/P95 数据设置阈值，而非凭直觉
3. **增加抑制规则**——上游故障时自动抑制下游告警
4. **合并相似规则**——同一个指标的不同阈值告警合并为一条多级规则
5. **删除无效告警**——连续 30 天内从未触发过的告警规则考虑归档
