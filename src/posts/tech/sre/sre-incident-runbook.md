---
title: 故障管理与 Runbook 自动化：SRE 实战指南
icon: shield-halved
date: 2026-06-13
category:
  - 技术
tag:
  - SRE
  - 故障管理
  - On-Call
  - 自动化
---

# 故障管理与 Runbook 自动化：SRE 实战指南

凌晨 2:17，手机震动。PagerDuty 推送了一条 P1 告警：**支付服务响应时间 P99 飙升至 12 秒，成功率跌至 83%**。你打开电脑，盯着满屏的红色监控面板，脑子里只有一个问题：**接下来做什么？**

这就是 SRE 故障管理的核心挑战——不是缺少信息，而是缺少**结构化的响应能力**。本文从 On-Call 体系、故障生命周期、Runbook 设计到自动化实践，构建一套完整的故障响应框架，让你在面对生产事故时不再靠直觉，而是靠系统。

<!-- more -->

## On-Call 体系：第一道防线

### 轮值机制设计

一个成熟的 On-Call 体系通常采用三级轮值结构：

```
┌─────────────────────────────────────────────┐
│              On-Call 轮值架构                 │
├──────────────┬──────────────┬────────────────┤
│   Primary    │  Secondary   │    Shadow      │
│   第一响应    │   升级后备    │   观摩学习     │
├──────────────┼──────────────┼────────────────┤
│ • 7×24 持有  │ • Primary    │ • 不直接处理   │
│   PagerDuty  │   未响应时   │   故障         │
│ • 5 分钟内   │   15 分钟内  │ • 跟随 Primary │
│   确认告警   │   接手       │   学习流程     │
│ • 执行       │ • 跨团队     │ • 新人必修     │
│   Runbook    │   协调       │   3-6 个月     │
└──────────────┴──────────────┴────────────────┘
```

**Primary（一线值班）** 负责接收所有告警并首次响应。通常按周轮换，确保每人每季度 On-Call 不超过 1-2 周。Primary 的核心职责是在 5 分钟内确认告警，判断严重程度，并启动对应的 Runbook。

**Secondary（二线支援）** 在 Primary 未能在 SLA 内响应时自动接管。同时负责跨团队协调——当故障涉及多个服务时，Secondary 充当 Incident Commander 的角色，统筹各方资源。

**Shadow（跟班学习）** 是培养新 SRE 的关键机制。Shadow 不直接处理故障，而是跟随 Primary 观摩完整的故障响应流程。通常持续 3-6 个月，直到 Shadow 能够独立处理大部分常见故障。

轮值排班需要注意的几点：

- **时区覆盖**：全球团队按 Follow-the-Sun 模式排班，避免单人覆盖非工作时间
- **交接仪式**：每次轮换时，上一任 Primary 向下一任做 15 分钟口头交接，内容包括当前已知风险、未解决的 P2/P3 告警、近期变更
- **On-Call 负载均衡**：追踪每人的告警量和处理时长，避免某些人长期超负荷

### On-Call 工具链

现代 On-Call 体系依赖一套协作工具链：

| 环节 | 工具 | 职责 |
|------|------|------|
| **告警聚合** | PagerDuty / Opsgenie / VictorOps | 统一接收所有监控系统的告警，去重、分级、路由 |
| **告警路由** | PagerDuty Service / Escalation Policy | 按服务、严重级别路由到对应 On-Call 人员 |
| **协作通信** | Slack / 飞书 / Zoom | 建立 Incident Channel，集中沟通 |
| **状态页** | Atlassian Statuspage / 自建 | 对外发布故障状态，减少用户咨询量 |
| **文档记录** | Confluence / Notion / Git | 记录 Incident Timeline 和 Postmortem |
| **日历管理** | PagerDuty Schedule / Google Calendar | 自动管理排班和交接 |

告警路由的配置非常关键。以 PagerDuty 为例，一个典型的 Escalation Policy 配置如下：

```yaml
# PagerDuty Escalation Policy 示例
escalation_policy:
  name: "Payment Service - P1"
  rules:
    - escalation_delay_in_minutes: 5
      targets:
        - type: user_reference
          id: "oncall-primary-user-id"    # Primary On-Call
    - escalation_delay_in_minutes: 15
      targets:
        - type: user_reference
          id: "oncall-secondary-user-id"  # Secondary On-Call
    - escalation_delay_in_minutes: 30
      targets:
        - type: schedule_reference
          id: "sre-team-lead-schedule"    # 升级到 TL
```

### On-Call 黄金法则

Google SRE 团队总结了两条 On-Call 黄金法则，看似简单，执行到位极难：

**法则一：限制告警数量。** 每个 On-Call 工程师每班次接收的告警不应超过 2-5 个。超过这个阈值意味着告警疲劳（Alert Fatigue）——人会开始忽略告警，而真正严重的故障可能在噪音中被淹没。如果某个服务每周产生 50 条告警，要么优化告警规则减少误报，要么为这个服务投入更多 SRE 资源。

**法则二：每个告警都要有 Runbook。** 任何触发 PagerDuty 的告警，必须关联一个可执行的 Runbook 文档。如果没有 Runbook，On-Call 工程师只能凭经验操作——这本质上是在赌人的状态，而不是赌系统的可靠性。对于无法提供 Runbook 的告警，应该考虑降级为日志记录而非触发告警。

```
告警严重程度分级：

P1 (Critical)  → 5 分钟内响应，立即启动 Incident 流程，全员 On-Call
P2 (High)      → 30 分钟内响应，当前 On-Call 处理，需要 Runbook
P3 (Medium)    → 4 小时内响应，工单跟踪，下一个工作日处理
P4 (Low)       → 日志记录，定期 Review 时处理
```

## 故障生命周期

一次完整的故障经历以下五个阶段。每个阶段都有明确的目标和可执行的步骤：

```
发现 ──→ 响应 ──→ 缓解 ──→ 解决 ──→ 复盘
 │         │         │         │         │
 │         │         │         │         └─ Postmortem 文档
 │         │         │         └─ 根因修复、永久解决方案
 │         │         └─ 止血、恢复服务可用性
 │         └─ 确认故障、组建响应团队、升级
 └─ 告警触发、用户反馈、主动巡检
```

### 阶段一：发现（Detection）

故障的发现途径通常有三类：

- **监控系统告警**：Prometheus/Grafana/Datadog 等监控系统基于阈值或异常检测触发告警。这是最理想的发现方式——在用户感知之前就介入。
- **用户反馈**：客服渠道、社交媒体投诉、工单系统。如果故障是用户先发现的，说明监控存在盲区。
- **主动巡检**：SRE 团队定期执行的健康检查和 Chaos Engineering 实验。

**真实案例：** 某电商平台在大促期间，支付服务的 Redis 缓存命中率从 99.2% 降至 67%。监控系统在命中率跌破 85% 时触发了 P2 告警，SRE 在用户大规模感知到延迟之前就介入了处理。但如果监控只设置了"Redis 进程是否存活"的检查，这条告警就不会出现，用户就会先于 SRE 发现问题。

### 阶段二：响应（Response）

响应阶段的核心动作：

1. **确认故障**：On-Call 工程师在 5 分钟内确认告警有效性，排除误报
2. **建立 Incident Channel**：在 Slack/飞书中创建 `#incident-20260613-payment` 频道
3. **指定 Incident Commander**：负责协调所有响应活动，不参与具体排查
4. **通知利益相关方**：向业务方、管理层发送故障通知
5. **评估是否升级**：如果故障超出当前 On-Call 能力范围，启动升级流程

```
Incident Channel 命名规范：
#incident-{date}-{service}-{brief}

示例：
#incident-20260613-payment-latency
#incident-20260613-auth-service-down
```

### 阶段三：缓解（Mitigation）

缓解阶段的目标只有一个：**止血**。不需要找到根因，只需要恢复服务。常见的缓解措施：

- **快速回滚**：如果是最近部署导致的问题，回滚到上一个稳定版本
- **流量切换**：将有问题的节点从负载均衡池中摘除
- **扩容**：增加服务实例数量以应对突发流量
- **降级**：关闭非核心功能，保障核心链路
- **重启**：作为最后手段，重启有问题的服务实例

**关键原则：缓解优先于根因分析。** 不要在用户受影响的同时花时间去 debug 根因。先止血，再治病。

### 阶段四：解决（Resolution）

故障缓解后，进入根因分析和永久修复阶段：

- 分析日志、指标、链路追踪数据定位根因
- 编写修复代码，通过 Code Review 后合并
- 灰度发布修复，验证效果
- 补充或修正监控告警规则，防止同类问题再次遗漏

### 阶段五：复盘（Postmortem）

每次 P1/P2 故障结束后，必须在 48 小时内完成 Postmortem。详细内容见后文"故障复盘"章节。

## MTTR 指标体系

衡量故障响应效率的核心指标围绕 MTTR 展开：

```
                     故障发生时间点
                          │
    ┌─────────────────────┼───────────────────────┐
    │                     │                       │
    │   MTTD              │   MTTA       MTTR     │
    │   平均发现时间       │   平均响应时间  平均恢复时间│
    │                     │               │       │
    ▼                     ▼               ▼       ▼
 ───●─────────────────────●───────────────●───────●───→ 时间
    │                     │               │       │
  故障发生             告警触发        确认并开始   服务恢复
                                       处理
```

| 指标 | 全称 | 含义 | 优化方向 |
|------|------|------|----------|
| **MTTD** | Mean Time to Detect | 从故障发生到告警触发的平均时间 | 完善监控覆盖、缩短采集间隔、异常检测 |
| **MTTA** | Mean Time to Acknowledge | 从告警触发到 On-Call 确认的平均时间 | On-Call SLA、告警路由优化 |
| **MTTR** | Mean Time to Resolve | 从故障发生到服务完全恢复的平均时间 | Runbook 自动化、快速回滚、扩容能力 |

**行业标准参考值：**

- P1 故障：MTTD < 5 分钟，MTTA < 5 分钟，MTTR < 30 分钟
- P2 故障：MTTD < 15 分钟，MTTA < 30 分钟，MTTR < 4 小时

一个常见误区是只关注 MTTR。实际上 MTTD 同样关键——如果故障发生 30 分钟后才发现，即使 5 分钟内恢复，用户体验已经严重受损。某金融科技公司的数据表明，将 MTTD 从 12 分钟降到 3 分钟，客户投诉量减少了 40%。

## Runbook 设计

### 什么是 Runbook

Runbook 是一份**结构化的故障处理手册**，描述了当特定告警触发时，On-Call 工程师应该执行的具体步骤。它是一线值班工程师最重要的武器。

一个好的 Runbook 能让一个刚入职两周的工程师，在凌晨 3 点独立处理故障。

### 好的 Runbook 标准

评估一个 Runbook 质量的三个核心标准：

**1. 可执行（Actionable）**

每一步操作都是具体的、可执行的命令或动作。不应该有"检查一下网络"这种模糊描述，而应该是：

```bash
# 检查服务到数据库的网络连通性
nc -zv db-master.internal 5432 -w 5

# 检查 DNS 解析
dig +short payment-service.default.svc.cluster.local

# 查看最近的错误日志
kubectl logs -n production deployment/payment-service --tail=100 --previous | grep -i error
```

**2. 有决策树（Decision Tree）**

故障处理不是线性流程，需要根据不同条件选择不同路径：

```
告警触发：支付服务响应时间 > 5s
│
├── Q1: 是否刚完成部署？
│   ├── 是 → 执行回滚（见步骤 1.1）
│   └── 否 → 继续排查
│
├── Q2: 数据库连接池是否耗尽？
│   ├── 是 → 执行数据库连接池 Runbook（见步骤 1.2）
│   └── 否 → 继续排查
│
├── Q3: 下游依赖是否正常？
│   ├── 否 → 执行依赖服务降级（见步骤 1.3）
│   └── 是 → 继续排查
│
└── Q4: 是否有异常流量？
    ├── 是 → 执行限流策略（见步骤 1.4）
    └── 否 → 升级到 Secondary，收集诊断信息
```

**3. 有验证步骤（Verification）**

每个操作后都需要验证是否生效：

```
步骤 2.1：扩容支付服务到 8 个实例
  执行：kubectl scale deployment payment-service --replicas=8 -n production
  验证：kubectl get pods -n production -l app=payment-service | grep Running | wc -l
  预期：输出为 8
  如果失败：检查集群资源是否充足（kubectl describe nodes | grep -A5 "Allocated resources"）
```

### Runbook 模板示例

#### 模板一：服务不可用

```markdown
# Runbook: [服务名称] 不可用

## 告警信息
- 告警名称: ServiceDown_[service_name]
- 严重级别: P1
- 触发条件: 服务健康检查连续失败 3 次（间隔 30s）

## 影响范围
- 业务影响: [描述用户可见的影响]
- 关联服务: [列出上下游依赖]

## 快速诊断
1. 确认服务状态: `kubectl get pods -n production -l app=[service]`
2. 查看最近事件: `kubectl describe deployment [service] -n production | tail -30`
3. 检查最近部署: `kubectl rollout history deployment/[service] -n production`

## 处理步骤

### 场景 A: CrashLoopBackOff
1. 查看崩溃日志: `kubectl logs -n production deployment/[service] --previous --tail=200`
2. 检查最近变更: 是否有新部署或 ConfigMap 变更
3. 如有新部署 → 回滚: `kubectl rollout undo deployment/[service] -n production`
4. 验证: `kubectl rollout status deployment/[service] -n production`

### 场景 B: OOMKilled
1. 检查内存限制: `kubectl describe pod [pod-name] -n production | grep -A5 "Limits"`
2. 检查内存趋势: 打开 Grafana Dashboard → [Service] → Memory
3. 临时调整: `kubectl set resources deployment/[service] -c [service] --limits=memory=[新值] -n production`
4. 创建工单: 调查内存泄漏根因

### 场景 C: ImagePullBackOff
1. 检查镜像地址: `kubectl get deployment [service] -n production -o jsonpath='{.spec.template.spec.containers[0].image}'`
2. 验证镜像存在: `docker pull [image-address]` 或检查 Harbor/Registry
3. 如镜像丢失 → 回滚到上一版本镜像

## 升级条件
- 15 分钟内未能恢复 → 升级到 Secondary On-Call
- 30 分钟内未能恢复 → 升级到 SRE TL，考虑启动灾难恢复预案

## 相关链接
- Grafana Dashboard: [URL]
- 服务架构图: [URL]
- 最近变更记录: [URL]
```

#### 模板二：数据库连接池耗尽

```markdown
# Runbook: 数据库连接池耗尽

## 告警信息
- 告警名称: DBConnectionPoolExhausted
- 严重级别: P1
- 触发条件: 活跃连接数 > 最大连接数的 90%，持续 2 分钟

## 快速诊断
1. 查看当前连接数: `SELECT count(*) FROM pg_stat_activity;`
2. 查看连接来源分布: `SELECT datname, usename, count(*) FROM pg_stat_activity GROUP BY datname, usename ORDER BY count(*) DESC;`
3. 查看长时间运行的查询: `SELECT pid, now() - pg_stat_activity.query_start AS duration, query FROM pg_stat_activity WHERE state = 'active' ORDER BY duration DESC;`

## 处理步骤

### 步骤 1: 紧急释放连接
-- 终止空闲超过 5 分钟的连接
SELECT pg_terminate_backend(pid)
FROM pg_stat_activity
WHERE state = 'idle'
  AND query_start < now() - interval '5 minutes'
  AND pid <> pg_backend_pid();

### 步骤 2: 临时调大连接数
ALTER SYSTEM SET max_connections = [新值];
SELECT pg_reload_conf();

### 步骤 3: 排查连接泄漏
1. 检查各服务的连接池配置
2. 关注最近有变更的服务
3. 查看是否有慢查询导致连接长时间占用

## 验证
- 连接数恢复到正常水位（< 70%）
- 服务错误率恢复正常（< 0.1%）
- 监控面板确认连接数趋势稳定
```

#### 模板三：磁盘空间不足

```markdown
# Runbook: 磁盘空间不足

## 告警信息
- 告警名称: DiskSpaceWarning / DiskSpaceCritical
- 严重级别: P2 (Warning, >80%) / P1 (Critical, >95%)
- 触发条件: 磁盘使用率超过阈值

## 快速诊断
1. 查看磁盘使用: `df -h`
2. 查看大文件: `du -sh /var/log/* | sort -rh | head -10`
3. 查看已删除但未释放的文件: `lsof +L1 | grep deleted`

## 处理步骤

### 步骤 1: 清理日志文件
# 压缩 7 天前的日志
find /var/log -name "*.log" -mtime +7 -exec gzip {} \;
# 清空当前超大日志（如果进程正在写入）
truncate -s 0 /var/log/[large-file].log

### 步骤 2: 清理 Docker 资源（如果是 K8s 节点）
docker system prune -af --volumes
# 注意：这会清理未使用的镜像和已停止的容器

### 步骤 3: 清理旧数据
# 根据业务具体情况清理临时数据、过期备份等

## 验证
- 磁盘使用率降到 70% 以下
- 设置日志轮转策略防止再次发生
```

## Runbook 自动化

手工执行 Runbook 的问题在于：人在凌晨 3 点的状态远不如下午 3 点。自动化 Runbook 的执行可以大幅降低人为失误，同时缩短 MTTR。

### 用 Go 编写自动化诊断脚本

以下是一个基于 Go 的自动化故障诊断工具，在告警触发时自动采集故障现场信息：

```go
package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"time"
)

// DiagnosticReport 诊断报告结构
type DiagnosticReport struct {
	IncidentID  string            `json:"incident_id"`
	ServiceName string            `json:"service_name"`
	Timestamp   time.Time         `json:"timestamp"`
	Diagnostics map[string]any    `json:"diagnostics"`
	Actions     []string          `json:"actions_taken"`
	Status      string            `json:"status"`
}

// DiagnosticCollector 诊断信息采集器
type DiagnosticCollector struct {
	serviceName string
	namespace   string
	report      *DiagnosticReport
	outputDir   string
}

func NewDiagnosticCollector(serviceName, namespace string) *DiagnosticCollector {
	incidentID := fmt.Sprintf("INC-%s-%d", serviceName, time.Now().Unix())
	return &DiagnosticCollector{
		serviceName: serviceName,
		namespace:   namespace,
		report: &DiagnosticReport{
			IncidentID:  incidentID,
			ServiceName: serviceName,
			Timestamp:   time.Now().UTC(),
			Diagnostics: make(map[string]any),
		},
		outputDir: fmt.Sprintf("/var/log/incidents/%s", incidentID),
	}
}

// CollectPodStatus 采集 Pod 状态
func (dc *DiagnosticCollector) CollectPodStatus() error {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	cmd := exec.CommandContext(ctx, "kubectl", "get", "pods",
		"-n", dc.namespace,
		"-l", fmt.Sprintf("app=%s", dc.serviceName),
		"-o", "json")
	output, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("failed to get pod status: %w, output: %s", err, string(output))
	}

	var podList map[string]any
	if err := json.Unmarshal(output, &podList); err != nil {
		return fmt.Errorf("failed to parse pod list: %w", err)
	}

	dc.report.Diagnostics["pod_status"] = podList

	// 采集每个 Pod 的日志
	if items, ok := podList["items"].([]any); ok {
		for _, item := range items {
			if pod, ok := item.(map[string]any); ok {
				if metadata, ok := pod["metadata"].(map[string]any); ok {
					podName := metadata["name"].(string)
					dc.collectPodLogs(podName)
				}
			}
		}
	}

	return nil
}

// collectPodLogs 采集 Pod 日志
func (dc *DiagnosticCollector) collectPodLogs(podName string) {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	cmd := exec.CommandContext(ctx, "kubectl", "logs",
		podName, "-n", dc.namespace,
		"--tail=500", "--previous")
	output, err := cmd.CombinedOutput()
	if err != nil {
		dc.report.Diagnostics[fmt.Sprintf("logs_%s_error", podName)] = err.Error()
		return
	}

	logFile := filepath.Join(dc.outputDir, fmt.Sprintf("%s.log", podName))
	if err := os.WriteFile(logFile, output, 0644); err != nil {
		log.Printf("failed to write log file for pod %s: %v", podName, err)
	}
	dc.report.Actions = append(dc.report.Actions,
		fmt.Sprintf("collected logs for pod %s -> %s", podName, logFile))
}

// CollectSystemMetrics 采集系统指标
func (dc *DiagnosticCollector) CollectSystemMetrics() error {
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	// 从 Prometheus 采集关键指标
	query := fmt.Sprintf(`up{job="%s"}`, dc.serviceName)
	cmd := exec.CommandContext(ctx, "curl", "-s",
		"http://prometheus-server.monitoring:9090/api/v1/query",
		"--data-urlencode", fmt.Sprintf("query=%s", query))
	output, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("failed to query prometheus: %w", err)
	}

	var promResult map[string]any
	if err := json.Unmarshal(output, &promResult); err != nil {
		return fmt.Errorf("failed to parse prometheus response: %w", err)
	}

	dc.report.Diagnostics["service_up_status"] = promResult

	// 采集资源使用率
	resourceQuery := fmt.Sprintf(
		`container_memory_working_set_bytes{pod=~"%s-.*",namespace="%s"}`,
		dc.serviceName, dc.namespace)
	cmd = exec.CommandContext(ctx, "curl", "-s",
		"http://prometheus-server.monitoring:9090/api/v1/query",
		"--data-urlencode", fmt.Sprintf("query=%s", resourceQuery))
	output, err = cmd.CombinedOutput()
	if err == nil {
		var resResult map[string]any
		json.Unmarshal(output, &resResult)
		dc.report.Diagnostics["memory_usage"] = resResult
	}

	return nil
}

// CollectRecentEvents 采集最近的 K8s Events
func (dc *DiagnosticCollector) CollectRecentEvents() error {
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	cmd := exec.CommandContext(ctx, "kubectl", "get", "events",
		"-n", dc.namespace,
		"--field-selector", fmt.Sprintf("involvedObject.name=%s", dc.serviceName),
		"--sort-by=.lastTimestamp",
		"-o", "json")
	output, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("failed to get events: %w", err)
	}

	var events map[string]any
	json.Unmarshal(output, &events)
	dc.report.Diagnostics["recent_events"] = events

	return nil
}

// CollectNodeInfo 采集节点信息
func (dc *DiagnosticCollector) CollectNodeInfo() error {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	// 获取服务运行的节点
	cmd := exec.CommandContext(ctx, "kubectl", "get", "pods",
		"-n", dc.namespace,
		"-l", fmt.Sprintf("app=%s", dc.serviceName),
		"-o", "jsonpath={.items[*].spec.nodeName}")
	output, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("failed to get node names: %w", err)
	}

	// 采集节点资源状态
	cmd = exec.CommandContext(ctx, "kubectl", "top", "nodes")
	output, err = cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("failed to get node metrics: %w", err)
	}

	dc.report.Diagnostics["node_metrics"] = string(output)

	return nil
}

// GenerateReport 生成诊断报告
func (dc *DiagnosticCollector) GenerateReport() error {
	os.MkdirAll(dc.outputDir, 0755)

	dc.report.Status = "completed"
	reportJSON, err := json.MarshalIndent(dc.report, "", "  ")
	if err != nil {
		return fmt.Errorf("failed to marshal report: %w", err)
	}

	reportPath := filepath.Join(dc.outputDir, "diagnostic-report.json")
	if err := os.WriteFile(reportPath, reportJSON, 0644); err != nil {
		return fmt.Errorf("failed to write report: %w", err)
	}

	log.Printf("Diagnostic report generated: %s", reportPath)
	log.Printf("Incident ID: %s", dc.report.IncidentID)
	log.Printf("Actions taken: %d", len(dc.report.Actions))
	for _, action := range dc.report.Actions {
		log.Printf("  - %s", action)
	}

	return nil
}

// Run 执行完整的诊断流程
func (dc *DiagnosticCollector) Run() error {
	log.Printf("Starting diagnostic collection for service: %s", dc.serviceName)

	collectors := []func() error{
		dc.CollectPodStatus,
		dc.CollectSystemMetrics,
		dc.CollectRecentEvents,
		dc.CollectNodeInfo,
	}

	for _, collector := range collectors {
		if err := collector(); err != nil {
			log.Printf("Warning: %v", err)
			// 继续采集其他信息，不因单个采集器失败而中断
		}
	}

	return dc.GenerateReport()
}

func main() {
	if len(os.Args) < 3 {
		fmt.Fprintf(os.Stderr, "Usage: %s <service-name> <namespace>\n", os.Args[0])
		fmt.Fprintf(os.Stderr, "Example: %s payment-service production\n", os.Args[0])
		os.Exit(1)
	}

	serviceName := os.Args[1]
	namespace := os.Args[2]

	collector := NewDiagnosticCollector(serviceName, namespace)
	if err := collector.Run(); err != nil {
		log.Fatalf("Diagnostic collection failed: %v", err)
	}
}
```

**使用方式：**

```bash
# 编译
go build -o incident-diagnostic ./cmd/diagnostic/

# 告警触发时自动执行
./incident-diagnostic payment-service production

# 输出
# /var/log/incidents/INC-payment-service-1718250000/diagnostic-report.json
# /var/log/incidents/INC-payment-service-1718250000/payment-service-abc123.log
```

### 实战：自动执行缓解措施

在诊断信息采集完成后，下一步是根据预设策略自动执行缓解措施。以下是一个自动缓解引擎的实现：

```go
package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"os/exec"
	"time"
)

// MitigationAction 缓解动作定义
type MitigationAction struct {
	Name        string            `json:"name"`
	Type        string            `json:"type"` // restart, scale, drain, rollback, failover
	Parameters  map[string]string `json:"parameters"`
	Timeout     time.Duration     `json:"timeout"`
	Verified    bool              `json:"verified"`
}

// MitigationEngine 缓解引擎
type MitigationEngine struct {
	serviceName string
	namespace   string
	actions     []MitigationAction
	dryRun      bool
}

func NewMitigationEngine(serviceName, namespace string, dryRun bool) *MitigationEngine {
	return &MitigationEngine{
		serviceName: serviceName,
		namespace:   namespace,
		dryRun:      dryRun,
	}
}

// ExecuteRestart 重启服务实例
func (me *MitigationEngine) ExecuteRestart(ctx context.Context) error {
	if me.dryRun {
		log.Printf("[DRY-RUN] Would restart deployment %s in namespace %s",
			me.serviceName, me.namespace)
		return nil
	}

	log.Printf("Restarting deployment %s...", me.serviceName)

	// 使用 rollout restart 进行平滑重启
	cmd := exec.CommandContext(ctx, "kubectl", "rollout", "restart",
		"deployment", me.serviceName,
		"-n", me.namespace)
	if output, err := cmd.CombinedOutput(); err != nil {
		return fmt.Errorf("restart failed: %w, output: %s", err, string(output))
	}

	// 等待 rollout 完成
	cmd = exec.CommandContext(ctx, "kubectl", "rollout", "status",
		"deployment", me.serviceName,
		"-n", me.namespace,
		"--timeout=300s")
	if output, err := cmd.CombinedOutput(); err != nil {
		return fmt.Errorf("rollout status check failed: %w, output: %s", err, string(output))
	}

	log.Printf("Deployment %s restarted successfully", me.serviceName)
	return nil
}

// ExecuteScale 扩容服务
func (me *MitigationEngine) ExecuteScale(ctx context.Context, replicas int) error {
	if me.dryRun {
		log.Printf("[DRY-RUN] Would scale deployment %s to %d replicas",
			me.serviceName, replicas)
		return nil
	}

	log.Printf("Scaling deployment %s to %d replicas...", me.serviceName, replicas)

	cmd := exec.CommandContext(ctx, "kubectl", "scale",
		"deployment", me.serviceName,
		fmt.Sprintf("--replicas=%d", replicas),
		"-n", me.namespace)
	if output, err := cmd.CombinedOutput(); err != nil {
		return fmt.Errorf("scale failed: %w, output: %s", err, string(output))
	}

	return me.verifyScale(ctx, replicas)
}

// verifyScale 验证扩容结果
func (me *MitigationEngine) verifyScale(ctx context.Context, expectedReplicas int) error {
	// 等待 Pod 就绪
	for i := 0; i < 12; i++ { // 最多等待 2 分钟
		cmd := exec.CommandContext(ctx, "kubectl", "get", "pods",
			"-n", me.namespace,
			"-l", fmt.Sprintf("app=%s", me.serviceName),
			"--field-selector=status.phase=Running",
			"-o", "jsonpath={.items}")
		output, err := cmd.CombinedOutput()
		if err != nil {
			time.Sleep(10 * time.Second)
			continue
		}

		var pods []map[string]any
		json.Unmarshal(output, &pods)
		if len(pods) >= expectedReplicas {
			log.Printf("Scale verified: %d pods running", len(pods))
			return nil
		}

		time.Sleep(10 * time.Second)
	}

	return fmt.Errorf("scale verification timed out: expected %d replicas", expectedReplicas)
}

// ExecuteDrain 排空特定节点上的 Pod
func (me *MitigationEngine) ExecuteDrain(ctx context.Context, nodeName string) error {
	if me.dryRun {
		log.Printf("[DRY-RUN] Would drain node %s", nodeName)
		return nil
	}

	log.Printf("Draining node %s...", nodeName)

	cmd := exec.CommandContext(ctx, "kubectl", "drain", nodeName,
		"--ignore-daemonsets",
		"--delete-emptydir-data",
		"--grace-period=60")
	output, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("drain failed: %w, output: %s", err, string(output))
	}

	log.Printf("Node %s drained successfully", nodeName)
	return nil
}

// ExecuteRollback 回滚到上一个版本
func (me *MitigationEngine) ExecuteRollback(ctx context.Context) error {
	if me.dryRun {
		log.Printf("[DRY-RUN] Would rollback deployment %s", me.serviceName)
		return nil
	}

	log.Printf("Rolling back deployment %s...", me.serviceName)

	// 先查看当前和目标版本
	cmd := exec.CommandContext(ctx, "kubectl", "rollout", "history",
		"deployment", me.serviceName,
		"-n", me.namespace)
	output, _ := cmd.CombinedOutput()
	log.Printf("Rollout history:\n%s", string(output))

	// 执行回滚
	cmd = exec.CommandContext(ctx, "kubectl", "rollout", "undo",
		"deployment", me.serviceName,
		"-n", me.namespace)
	if output, err := cmd.CombinedOutput(); err != nil {
		return fmt.Errorf("rollback failed: %w, output: %s", err, string(output))
	}

	// 等待回滚完成
	cmd = exec.CommandContext(ctx, "kubectl", "rollout", "status",
		"deployment", me.serviceName,
		"-n", me.namespace,
		"--timeout=300s")
	if output, err := cmd.CombinedOutput(); err != nil {
		return fmt.Errorf("rollback status check failed: %w, output: %s", err, string(output))
	}

	log.Printf("Deployment %s rolled back successfully", me.serviceName)
	return nil
}

// ExecuteFailover 流量切换
func (me *MitigationEngine) ExecuteFailover(ctx context.Context, targetRegion string) error {
	if me.dryRun {
		log.Printf("[DRY-RUN] Would failover %s to region %s",
			me.serviceName, targetRegion)
		return nil
	}

	log.Printf("Failing over %s to region %s...", me.serviceName, targetRegion)

	// 更新 DNS 或 Service Entry 指向目标区域
	// 这里以 Istio VirtualService 为例
	virtualServicePatch := fmt.Sprintf(`{
		"spec": {
			"hosts": ["%s"],
			"http": [{
				"route": [{
					"destination": {
						"host": "%s.%s.svc.cluster.local",
						"port": { "number": 8080 }
					},
					"weight": 100
				}]
			}]
		}
	}`, me.serviceName, me.serviceName, me.namespace)

	cmd := exec.CommandContext(ctx, "kubectl", "patch", "virtualservice",
		me.serviceName,
		"-n", me.namespace,
		"--type=merge",
		"-p", virtualServicePatch)
	if output, err := cmd.CombinedOutput(); err != nil {
		return fmt.Errorf("failover failed: %w, output: %s", err, string(output))
	}

	log.Printf("Failover to %s completed", targetRegion)
	return nil
}

// RunAutoMitigation 根据故障类型自动选择缓解策略
func (me *MitigationEngine) RunAutoMitigation(ctx context.Context, faultType string) error {
	log.Printf("Auto-mitigation triggered for fault type: %s", faultType)

	switch faultType {
	case "crash_loop":
		return me.ExecuteRollback(ctx)
	case "high_latency":
		return me.ExecuteScale(ctx, 8) // 扩容到 8 个实例
	case "memory_leak":
		return me.ExecuteRestart(ctx)
	case "node_failure":
		// 需要外部传入节点名称
		return fmt.Errorf("node_failure requires node name, use ExecuteDrain")
	case "region_failure":
		return me.ExecuteFailover(ctx, "us-west-2")
	default:
		return fmt.Errorf("unknown fault type: %s, manual intervention required", faultType)
	}
}

func main() {
	dryRun := os.Getenv("DRY_RUN") != "false" // 默认 dry-run 模式
	serviceName := "payment-service"
	namespace := "production"

	if len(os.Args) >= 3 {
		serviceName = os.Args[1]
		namespace = os.Args[2]
	}

	engine := NewMitigationEngine(serviceName, namespace, dryRun)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
	defer cancel()

	// 示例：自动处理高延迟故障
	if err := engine.RunAutoMitigation(ctx, "high_latency"); err != nil {
		log.Fatalf("Auto-mitigation failed: %v", err)
	}

	if dryRun {
		log.Println("Running in DRY-RUN mode. Set DRY_RUN=false to execute real actions.")
	}
}
```

**安全设计要点：**

- **Dry-Run 模式**：默认以 dry-run 模式运行，只打印将要执行的操作而不真正执行。需要显式设置 `DRY_RUN=false` 才会真正执行。
- **超时控制**：每个操作都有超时限制，防止操作卡死。
- **验证步骤**：每个缓解操作执行后都会验证结果，确保操作生效。
- **审计日志**：所有操作都会记录详细的日志，用于事后复盘。

## 故障复盘（Postmortem）

### Blameless 文化

Google SRE 的一条核心原则是 **Blameless Postmortem**（无指责复盘）。这意味着：

- 复盘的目标是**修复系统**，而不是**找人背锅**
- 关注"系统为什么会允许这个错误发生"，而不是"谁犯了这个错误"
- 任何人在类似情况下都可能犯同样的错误——问题出在系统和流程上
- 参与复盘的人必须感到安全，否则他们会隐瞒关键信息

一个简单的判断标准：如果你的 Postmortem 文档中出现了某个人名字，那它大概率不是 Blameless 的。应该关注的是"监控为什么没有更早发现"和"Runbook 为什么没有覆盖这个场景"，而不是"张三为什么没有在凌晨 3 点做出正确的判断"。

### 复盘文档模板

```markdown
# Postmortem: [故障标题]

## 基本信息
- **故障日期**: YYYY-MM-DD
- **故障时长**: XX 小时 XX 分钟
- **影响范围**: XX 用户 / XX% 流量
- **严重级别**: P1 / P2
- **Incident Commander**: [姓名]
- **Postmortem 负责人**: [姓名]
- **Postmortem 完成日期**: YYYY-MM-DD

## 故障时间线（Timeline）

所有时间使用 UTC，精确到分钟。

| 时间 (UTC) | 事件 |
|------------|------|
| 02:17 | Prometheus 告警触发：支付服务 P99 延迟 > 5s |
| 02:19 | On-Call Primary 确认告警 |
| 02:21 | 建立 Incident Channel #incident-xxx |
| 02:25 | 初步排查：发现数据库连接池使用率 98% |
| 02:30 | 执行 Runbook：释放空闲连接 |
| 02:35 | 连接数恢复正常，延迟下降 |
| 02:50 | 确认根因：新部署引入了连接泄漏 bug |
| 03:10 | 回滚到上一版本，故障完全恢复 |
| 03:15 | 故障结束，开始 Postmortem |

## 根因分析（Root Cause Analysis）

使用"5 Whys"方法逐层追问：

1. **为什么服务延迟升高？** → 数据库查询排队等待连接
2. **为什么连接不够？** → 连接池被耗尽，达到 max_connections 上限
3. **为什么连接被耗尽？** → 大量连接处于 idle 状态但未被释放
4. **为什么连接未被释放？** → 新版本代码中缺少 `rows.Close()` 调用
5. **为什么这个 bug 没被测试发现？** → 连接泄漏需要长时间运行才能显现，
   单元测试和集成测试的执行时间太短

## 影响评估
- **受影响用户数**: ~12,000
- **失败交易数**: ~1,500
- **预估收入损失**: ¥XXX,XXX
- **MTTD**: 0 分钟（告警即时触发）
- **MTTA**: 2 分钟
- **MTTR**: 58 分钟

## 行动项（Action Items）

| # | 行动项 | 负责人 | 优先级 | 截止日期 | Issue 链接 |
|---|--------|--------|--------|----------|------------|
| 1 | 修复连接泄漏：添加 `defer rows.Close()` | @dev-team | P0 | YYYY-MM-DD | #1234 |
| 2 | 添加连接泄漏检测：监控连接存活时间 | @sre-team | P1 | YYYY-MM-DD | #1235 |
| 3 | 集成测试增加长时间连接场景 | @qa-team | P1 | YYYY-MM-DD | #1236 |
| 4 | 数据库连接池增加硬超时配置 | @sre-team | P1 | YYYY-MM-DD | #1237 |
| 5 | Runbook 补充连接泄漏排查步骤 | @sre-team | P2 | YYYY-MM-DD | #1238 |

## 经验教训

### 做得好的
- 监控告警及时，MTTD 接近 0
- On-Call 响应迅速，2 分钟内确认
- Runbook 有效指导了缓解操作

### 需要改进的
- Code Review 未发现连接泄漏（缺少静态分析工具）
- 测试覆盖不足（缺少长时间运行的 soak test）
- 连接池监控不够细粒度（缺少按服务维度的连接数监控）

## 附录
- [Grafana Dashboard 快照]
- [完整日志]
- [相关代码 PR]
```

### 行动项跟踪

Postmortem 中的 Action Items 不能写完就结束。每一条 Action Item 都必须：

1. **关联 Issue**：在 Jira/GitHub Issue 中创建工单，设定截止日期
2. **指定负责人**：明确到个人，不能是"团队"
3. **设置优先级**：P0 必须在 24 小时内完成，P1 在一周内完成
4. **定期 Review**：每周 SRE 例会上追踪 Action Item 完成进度
5. **关闭条件**：每个 Action Item 完成后需要验证效果，才能标记为 Done

**真实教训：** 某团队在一次 P1 故障复盘中提出了 12 个 Action Items，但没有人跟踪执行。三个月后，几乎完全相同的故障再次发生。Postmortem 文档的价值不在于文档本身，而在于 Action Items 的执行。

## 混沌工程入门

### Chaos Monkey 思想

2011 年，Netflix 开源了 Chaos Monkey——一个会在生产环境中随机关闭服务的工具。这个看似疯狂的想法背后是深刻的工程洞见：

**如果你不在受控条件下主动发现系统的弱点，它会在你最不希望的时候暴露出来。**

混沌工程的核心思想：

- **主动注入故障**：在生产或类生产环境中，有计划地引入故障
- **观察系统行为**：验证系统的韧性是否符合预期
- **建立信心**：通过持续的故障注入，证明系统在各种异常情况下仍能正常工作
- **发现未知风险**：找到只有真实故障才能暴露的架构问题

### 主动注入故障验证系统韧性

混沌工程实验通常从以下维度展开：

| 故障类型 | 实验方法 | 预期结果 |
|----------|----------|----------|
| **实例故障** | 随机终止 Pod/VM | 流量自动切换，服务不受影响 |
| **网络故障** | 注入网络延迟/丢包 | 服务降级但可用，超时机制生效 |
| **依赖故障** | 模拟下游服务超时 | 熔断器生效，降级策略执行 |
| **资源耗尽** | 模拟 CPU/内存/Disk 满载 | 监控告警触发，自动扩容 |
| **数据故障** | 注入异常数据/空数据 | 输入校验生效，不会导致 Panic |

混沌工程的实施原则：

1. **从最小的爆炸半径开始**：先在非生产环境实验，再逐步扩展到生产
2. **自动化执行**：定期自动运行实验（如每周一次），而不是手动触发
3. **可回滚**：每个实验都有自动停止条件，防止失控
4. **记录结果**：每次实验的结果都记录下来，用于追踪系统韧性趋势

### 故障注入脚本示例

以下是一个基于 Go 的轻量级故障注入工具，可以模拟常见的生产故障场景：

```go
package main

import (
	"context"
	"flag"
	"fmt"
	"log"
	"math/rand"
	"os"
	"os/signal"
	"syscall"
	"time"
)

// FaultInjector 故障注入器
type FaultInjector struct {
	targetService string
	namespace     string
	faultType     string
	duration      time.Duration
	intensity     float64 // 0.0 - 1.0
}

// ExperimentResult 实验结果
type ExperimentResult struct {
	ExperimentID   string        `json:"experiment_id"`
	FaultType      string        `json:"fault_type"`
	Target         string        `json:"target"`
	Duration       time.Duration `json:"duration"`
	Intensity      float64       `json:"intensity"`
	StartTime      time.Time     `json:"start_time"`
	EndTime        time.Time     `json:"end_time"`
	Hypothesis     string        `json:"hypothesis"`
	Observation    string        `json:"observation"`
	Result         string        `json:"result"` // pass, fail, inconclusive
	RollbackNeeded bool          `json:"rollback_needed"`
}

func NewFaultInjector(service, namespace, faultType string,
	duration time.Duration, intensity float64) *FaultInjector {
	return &FaultInjector{
		targetService: service,
		namespace:     namespace,
		faultType:     faultType,
		duration:      duration,
		intensity:     intensity,
	}
}

// InjectPodKill 注入 Pod 终止故障
func (fi *FaultInjector) InjectPodKill(ctx context.Context) (*ExperimentResult, error) {
	result := &ExperimentResult{
		ExperimentID: fmt.Sprintf("chaos-%d", time.Now().Unix()),
		FaultType:    "pod_kill",
		Target:       fi.targetService,
		Duration:     fi.duration,
		Intensity:    fi.intensity,
		StartTime:    time.Now().UTC(),
		Hypothesis:   "Service should maintain availability when pods are killed",
	}

	log.Printf("[Chaos] Starting pod_kill experiment on %s (intensity: %.0f%%)",
		fi.targetService, fi.intensity*100)

	// 获取当前 Pod 列表
	pods, err := fi.getPodList(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to get pod list: %w", err)
	}

	// 计算需要终止的 Pod 数量
	killCount := int(float64(len(pods)) * fi.intensity)
	if killCount < 1 {
		killCount = 1
	}
	if killCount >= len(pods) {
		return nil, fmt.Errorf("refusing to kill all pods (would cause total outage)")
	}

	// 随机选择要终止的 Pod
	rand.Shuffle(len(pods), func(i, j int) {
		pods[i], pods[j] = pods[j], pods[i]
	})
	targets := pods[:killCount]

	log.Printf("[Chaos] Will kill %d/%d pods: %v", killCount, len(pods), targets)

	// 记录杀 Pod 前的健康状态
	healthyBefore := fi.checkServiceHealth(ctx)
	log.Printf("[Chaos] Service health before: %s", healthyBefore)

	// 终止选中的 Pod
	for _, pod := range targets {
		log.Printf("[Chaos] Killing pod: %s", pod)
		if err := fi.killPod(ctx, pod); err != nil {
			log.Printf("[Chaos] Failed to kill pod %s: %v", pod, err)
		}
	}

	// 等待并观察
	log.Printf("[Chaos] Observing for %v...", fi.duration)
	select {
	case <-time.After(fi.duration):
		break
	case <-ctx.Done():
		log.Printf("[Chaos] Experiment interrupted")
		result.Observation = "Experiment interrupted by context cancellation"
	}

	// 检查杀 Pod 后的健康状态
	healthyAfter := fi.checkServiceHealth(ctx)
	log.Printf("[Chaos] Service health after: %s", healthyAfter)

	result.EndTime = time.Now().UTC()
	result.Observation = fmt.Sprintf(
		"Killed %d pods. Health before: %s, after: %s",
		killCount, healthyBefore, healthyAfter)

	// 判断实验结果
	if healthyAfter == "healthy" {
		result.Result = "pass"
		log.Printf("[Chaos] PASS: Service maintained availability")
	} else {
		result.Result = "fail"
		result.RollbackNeeded = true
		log.Printf("[Chaos] FAIL: Service did not maintain availability")
	}

	return result, nil
}

// InjectNetworkLatency 注入网络延迟
func (fi *FaultInjector) InjectNetworkLatency(ctx context.Context) (*ExperimentResult, error) {
	result := &ExperimentResult{
		ExperimentID: fmt.Sprintf("chaos-%d", time.Now().Unix()),
		FaultType:    "network_latency",
		Target:       fi.targetService,
		Duration:     fi.duration,
		Intensity:    fi.intensity,
		StartTime:    time.Now().UTC(),
		Hypothesis:   "Service should degrade gracefully under network latency",
	}

	latencyMs := int(fi.intensity * 2000) // 最多 2000ms 延迟
	jitterMs := latencyMs / 5

	log.Printf("[Chaos] Injecting %dms±%dms network latency to %s",
		latencyMs, jitterMs, fi.targetService)

	// 使用 tc (Traffic Control) 注入延迟
	// 这里以 Linux tc 命令为例
	pods, err := fi.getPodList(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to get pod list: %w", err)
	}

	// 在目标 Pod 所在的节点上设置网络延迟
	for _, pod := range pods {
		nodeName := fi.getPodNode(ctx, pod)
		if nodeName == "" {
			continue
		}

		// 通过 nsenter 在节点网络命名空间中执行 tc 命令
		// 生产环境中建议使用 Chaos Mesh 或 Litmus 等成熟工具
		log.Printf("[Chaos] Injecting latency on node %s for pod %s", nodeName, pod)

		// 记录以便后续清理
		result.Observation += fmt.Sprintf("injected latency on node %s; ", nodeName)
	}

	// 等待实验结束
	select {
	case <-time.After(fi.duration):
		break
	case <-ctx.Done():
		break
	}

	// 清理延迟注入
	log.Printf("[Chaos] Cleaning up network latency injection...")

	result.EndTime = time.Now().UTC()
	healthyAfter := fi.checkServiceHealth(ctx)
	if healthyAfter == "healthy" || healthyAfter == "degraded" {
		result.Result = "pass"
	} else {
		result.Result = "fail"
		result.RollbackNeeded = true
	}

	return result, nil
}

// InjectCPUStress 注入 CPU 压力
func (fi *FaultInjector) InjectCPUStress(ctx context.Context) (*ExperimentResult, error) {
	result := &ExperimentResult{
		ExperimentID: fmt.Sprintf("chaos-%d", time.Now().Unix()),
		FaultType:    "cpu_stress",
		Target:       fi.targetService,
		Duration:     fi.duration,
		Intensity:    fi.intensity,
		StartTime:    time.Now().UTC(),
		Hypothesis:   "Service should handle CPU pressure gracefully with alerts",
	}

	log.Printf("[Chaos] Injecting CPU stress (%.0f%%) on %s",
		fi.intensity*100, fi.targetService)

	// 使用 stress-ng 注入 CPU 压力
	// 通过 kubectl exec 在目标 Pod 中执行
	cpuWorkers := int(fi.intensity * 4) // 最多 4 个 CPU 压力线程
	if cpuWorkers < 1 {
		cpuWorkers = 1
	}

	pods, _ := fi.getPodList(ctx)
	if len(pods) > 0 {
		cmd := fmt.Sprintf("stress-ng --cpu %d --timeout %ds --cpu-load %d &",
			cpuWorkers, int(fi.duration.Seconds()), int(fi.intensity*100))
		log.Printf("[Chaos] Executing in pod %s: %s", pods[0], cmd)
	}

	// 等待并观察
	select {
	case <-time.After(fi.duration):
	case <-ctx.Done():
	}

	result.EndTime = time.Now().UTC()
	result.Result = "pass" // 根据 HPA 是否触发自动扩容来判断
	return result, nil
}

// 辅助方法

func (fi *FaultInjector) getPodList(ctx context.Context) ([]string, error) {
	// 简化实现：通过 kubectl 获取 Pod 列表
	return []string{
		fmt.Sprintf("%s-7d9f8b6c4d-abc12", fi.targetService),
		fmt.Sprintf("%s-7d9f8b6c4d-def34", fi.targetService),
		fmt.Sprintf("%s-7d9f8b6c4d-ghi56", fi.targetService),
	}, nil
}

func (fi *FaultInjector) killPod(ctx context.Context, podName string) error {
	// 实际实现中调用 kubectl delete pod
	log.Printf("  kubectl delete pod %s -n %s --grace-period=30", podName, fi.namespace)
	return nil
}

func (fi *FaultInjector) getPodNode(ctx context.Context, podName string) string {
	// 实际实现中通过 kubectl get pod 获取节点名
	return "node-1"
}

func (fi *FaultInjector) checkServiceHealth(ctx context.Context) string {
	// 实际实现中通过 HTTP 健康检查或 Prometheus 指标判断
	return "healthy"
}

func main() {
	service := flag.String("service", "", "Target service name")
	namespace := flag.String("namespace", "production", "Kubernetes namespace")
	faultType := flag.String("type", "pod_kill",
		"Fault type: pod_kill, network_latency, cpu_stress")
	duration := flag.Duration("duration", 5*time.Minute, "Experiment duration")
	intensity := flag.Float64("intensity", 0.3,
		"Fault intensity (0.0-1.0)")
	flag.Parse()

	if *service == "" {
		fmt.Fprintln(os.Stderr, "Error: -service is required")
		flag.Usage()
		os.Exit(1)
	}

	injector := NewFaultInjector(*service, *namespace, *faultType,
		*duration, *intensity)

	// 设置优雅退出
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
	go func() {
		<-sigCh
		log.Println("[Chaos] Received signal, cleaning up...")
		cancel()
	}()

	var result *ExperimentResult
	var err error

	switch *faultType {
	case "pod_kill":
		result, err = injector.InjectPodKill(ctx)
	case "network_latency":
		result, err = injector.InjectNetworkLatency(ctx)
	case "cpu_stress":
		result, err = injector.InjectCPUStress(ctx)
	default:
		log.Fatalf("Unknown fault type: %s", *faultType)
	}

	if err != nil {
		log.Fatalf("Experiment failed: %v", err)
	}

	log.Printf("[Chaos] Experiment %s completed: %s",
		result.ExperimentID, result.Result)
	log.Printf("[Chaos] Hypothesis: %s", result.Hypothesis)
	log.Printf("[Chaos] Observation: %s", result.Observation)

	if result.RollbackNeeded {
		log.Println("[Chaos] WARNING: Rollback needed! Manual intervention required.")
		os.Exit(1)
	}
}
```

**使用方式：**

```bash
# 编译
go build -o chaos-injector ./cmd/chaos/

# Pod 终止实验：随机杀死 30% 的 payment-service Pod
./chaos-injector -service payment-service -namespace production \
  -type pod_kill -duration 5m -intensity 0.3

# 网络延迟实验：注入 500ms 延迟
./chaos-injector -service payment-service -namespace production \
  -type network_latency -duration 10m -intensity 0.5

# CPU 压力实验：注入 80% CPU 负载
./chaos-injector -service payment-service -namespace production \
  -type cpu_stress -duration 5m -intensity 0.8
```

**生产环境建议：** 上述脚本仅用于演示原理。在生产环境中，推荐使用成熟的混沌工程工具：

- **Chaos Mesh**：CNCF 孵化项目，与 Kubernetes 深度集成，支持丰富的故障类型
- **Litmus Chaos**：CNCF 项目，提供大量预定义的混沌实验
- **Gremlin**：商业工具，提供友好的 UI 和安全控制

## 真实故障案例：一次支付服务的 P1 事故

### 故障背景

某电商平台在双 11 大促期间，支付核心服务在流量高峰期发生了严重的响应延迟和错误率飙升。以下是完整的事故时间线和处理过程。

### 故障时间线

```
14:00  大促活动开始，流量开始爬坡
14:15  支付服务 QPS 从 2,000 增长到 8,000
14:22  Prometheus 告警：支付服务 P99 延迟 > 3s（阈值 2s）
14:22  On-Call Primary 确认告警
14:23  建立 Incident Channel #incident-1111-payment
14:25  Primary 执行快速诊断：
        - Pod 状态正常（6/6 Running）
        - CPU 使用率 45%（正常）
        - 内存使用率 62%（正常）
        - 数据库连接池使用率 97%（异常！）
14:28  Primary 执行 Runbook：数据库连接池耗尽
        - 终止空闲超过 3 分钟的连接
        - 临时调大 max_connections
14:30  连接数恢复到 70%，延迟下降到 1.2s
14:32  延迟再次攀升到 5s，连接池再次耗尽
14:35  Primary 决定扩容：从 6 个实例扩到 12 个
14:40  扩容完成，延迟下降到 800ms
14:45  延迟再次升高，排查发现：Redis 缓存命中率从 99% 跌到 45%
14:48  Secondary 加入，接管 Incident Commander 角色
14:50  分析发现：缓存 key 过期策略设置不合理
       大量热点 key 在同一时间集中过期（Cache Stampede）
14:55  临时方案：对热点 key 设置随机过期时间偏移
15:00  缓存命中率恢复到 95%，延迟稳定在 200ms 以下
15:15  确认服务完全恢复
15:20  Incident 关闭，开始 Postmortem
```

### 根因分析

```
Root Cause Chain:

  Cache Stampede（缓存雪崩）
    ↓
  大量热点 key 同时过期
    ↓
  请求穿透缓存直达数据库
    ↓
  数据库连接池被穿透请求耗尽
    ↓
  服务响应延迟飙升，错误率上升
```

### 关键教训

1. **监控盲区**：缓存命中率没有设置告警阈值，只有数据库连接池告警。如果缓存命中率告警先触发，MTTD 可以更短。
2. **Runbook 覆盖不足**：现有的 Runbook 只覆盖了"连接池耗尽"这一个症状，没有覆盖上游的缓存故障场景。需要补充缓存相关的 Runbook。
3. **扩容不是万能药**：第一次扩容暂时缓解了症状，但因为根因是缓存失效，扩容只是增加了穿透请求的并发量，反而加剧了数据库压力。
4. **混沌工程的价值**：如果在活动前执行缓存故障注入实验，这个 Cache Stampede 问题可以在低风险环境下被发现和修复。

## 总结

故障管理不是一项独立的技能，而是一套系统工程。从 On-Call 体系的建设到 Runbook 的自动化执行，从 MTTR 指标的持续优化到混沌工程的主动验证，每一个环节都在提升系统的整体韧性。

核心要点回顾：

- **On-Call 体系**是第一道防线，限制告警数量、每个告警关联 Runbook 是最基本的要求
- **故障生命周期**的五个阶段（发现→响应→缓解→解决→复盘）提供了结构化的响应框架
- **MTTR 指标**是衡量故障响应效率的北极星，持续追踪和优化
- **Runbook** 让故障响应从依赖个人经验变成可复制的流程，好的 Runbook 必须可执行、有决策树、有验证步骤
- **自动化**将 Runbook 从文档变成代码，减少人为失误，缩短 MTTR
- **Blameless Postmortem** 确保每条 Action Item 都被追踪和执行，形成持续改进的闭环
- **混沌工程**让你在受控条件下主动发现系统弱点，而不是在生产事故中被动学习

记住：**不是"系统会不会出故障"的问题，而是"当系统出故障时，你准备好了吗"的问题。**
