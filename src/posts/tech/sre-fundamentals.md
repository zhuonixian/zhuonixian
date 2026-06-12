---
title: SRE 理念与实践：SLI/SLO/SLA 体系构建
icon: gauge-high
date: 2026-06-13
category:
  - 技术
tag:
  - SRE
  - 可靠性
  - SLI
  - SLO
---

# SRE 理念与实践：SLI/SLO/SLA 体系构建

当你凌晨 3 点被电话叫醒处理故障时，是否想过：这个服务到底需要多可靠？99.9% 够不够？多出来的一个 9 意味着多少成本？SRE（Site Reliability Engineering）不是让系统永远不宕机，而是用工程化的方法在**可靠性**与**业务速度**之间找到最优平衡。本文从 SLI/SLO/SLA 体系出发，系统梳理 SRE 的核心方法论和落地实践。

<!-- more -->

## SRE 的起源与核心思想

### Google SRE 的诞生

2003 年，Google 成立了全球第一个 SRE 团队，由 Ben Treynor Sloss 主导。初衷很简单：让运维工作像软件工程一样可度量、可优化、可扩展。2016 年出版的《Site Reliability Engineering: How Google Runs Production Systems》将这一理念推向业界，随后《The Site Reliability Workbook》进一步补全了实践方法。

SRE 的核心哲学可以用一句话概括：**把运维当工程问题来解决**。

### SRE 与传统运维的区别

| 维度 | 传统运维 | SRE |
|------|----------|-----|
| **工作方式** | 手工操作、脚本驱动 | 代码驱动、自动化优先 |
| **故障响应** | 事件驱动、被动救火 | 基于 Error Budget 主动管理 |
| **可靠性目标** | 越高越好、模糊不清 | 用 SLO 量化、可讨论 |
| **变更管理** | 审批流程、人工把关 | 自动化 CI/CD、渐进式发布 |
| **组织关系** | 开发与运维对立 | SRE 嵌入产品团队、共享目标 |
| **衡量标准** | 故障数量、MTTR | SLO 达成率、Error Budget 消耗 |

传统运维倾向于追求 100% 可靠性，但 SRE 明确指出：**超过用户需求的可靠性是浪费**。用户在手机上访问 Web 服务时，网络本身可能有 99% 的不可用时段，所以服务端做到 99.999% 对终端用户来说几乎没有感知差异。这正是 SLI/SLO/SLA 体系的价值所在——用数据定义"够好"的标准。

## 核心概念：SLI / SLO / SLA

三个概念从底层指标到顶层承诺，层层递进：

```
SLI（指标）──→ SLO（目标）──→ SLA（协议）
  可量化度量      内部质量目标      外部商业承诺
```

### SLI：Service Level Indicator（服务等级指标）

SLI 是对服务行为的具体量化度量，是你选择用来衡量服务好坏的指标。一个好的 SLI 应该：

- **可量化**：有明确的数值和单位
- **与用户体验直接相关**：用户真正关心的，不是系统内部的指标
- **可聚合计算**：能在时间窗口内计算比率

常见的 SLI 类型：

| SLI 类型 | 具体指标 | 说明 |
|----------|----------|------|
| **可用性** | 成功请求数 / 总请求数 | 请求是否被正确处理 |
| **延迟** | P50 / P95 / P99 延迟 | 请求响应有多快 |
| **吞吐量** | 每秒处理请求数（QPS） | 系统承载能力 |
| **错误率** | HTTP 5xx 响应数 / 总请求数 | 服务异常的比例 |
| **耐久性** | 数据写入成功读取的概率 | 数据是否安全存储（对象存储类服务） |
| **正确性** | 处理结果与预期一致的比例 | 批处理任务特有 |

**关键原则：SLI 要测量的是"好事件"占总事件的比例。**

```
SLI = 好事件数 / 总事件数 × 100%

例如：
- 可用性 SLI = HTTP 200 响应数 / 总请求数 = 99.95%
- 延迟 SLI  = P99 延迟 < 200ms 的请求数 / 总请求数 = 99.8%
```

### SLO：Service Level Objective（服务等级目标）

SLO 是 SLI 的目标值，是团队对服务可靠性的内部承诺。SLO 的核心价值在于：**它让"够不够可靠"这个问题从主观争论变成客观数据讨论。**

制定 SLO 时需要明确三个要素：

1. **SLI**：度量什么（如可用性）
2. **目标值**：达到多少（如 99.9%）
3. **时间窗口**：在多长时间内衡量（如 30 天滚动窗口）

示例：

```
SLO 1：API 服务可用性
  SLI：HTTP 非 5xx 响应比例
  目标：≥ 99.9%
  窗口：30 天滚动

SLO 2：API 响应延迟
  SLI：请求延迟 < 200ms 的比例
  目标：≥ 99%
  窗口：30 天滚动
```

**注意事项：**

- SLO 是**内部目标**，不是对用户的承诺。内部可以设定得比对外承诺更激进
- SLO 应该由**产品团队和 SRE 共同制定**，不是单方面决定
- 初期不要定得太紧，留出调优空间。先"可用"再"精确"

### SLA：Service Level Agreement（服务等级协议）

SLA 是带有商业约束力的合同条款，定义了服务提供者向客户承诺的最低服务水平，以及未达标时的赔偿机制。

| 维度 | SLO | SLA |
|------|-----|-----|
| **性质** | 内部质量目标 | 外部商业合同 |
| **约束力** | 团队自驱 | 法律约束 |
| **未达标后果** | Error Budget 消耗，触发复盘 | 赔偿、折扣、合同违约 |
| **目标值** | 通常高于 SLA | 略低于 SLO，留安全余量 |
| **受众** | 工程团队 | 客户、法务、销售 |

**实践建议：SLA 的目标值应该低于 SLO。** 比如 SLO 是 99.95%，SLA 可以设为 99.9%。这 0.05% 的缓冲区让你在触发 SLA 赔偿之前有足够的时间处理问题。

真实案例：AWS EC2 的 SLA 承诺月度可用性 99.99%，未达标时赔偿服务费用的 10%（低于 99.99% 但高于 99%）到 25%（低于 99%）。而 Google Cloud Compute Engine 的 SLA 承诺月度可用性 99.99%（单区域），未达标赔偿 10%-50% 不等。

## Error Budget：错误预算

### 概念

Error Budget（错误预算）是 SRE 体系中最具操作性的概念之一。它的计算方式极为简单：

```
Error Budget = 100% - SLO

例如：
SLO = 99.9%
Error Budget = 0.1%（即允许 0.1% 的不可用）
```

将百分比转换为具体时间（以月为单位）：

| SLO | 月度 Error Budget | 允许宕机时间/月 |
|-----|-------------------|-----------------|
| 99% | 1% | 7 小时 18 分钟 |
| 99.9% | 0.1% | 43 分钟 50 秒 |
| 99.95% | 0.05% | 21 分钟 55 秒 |
| 99.99% | 0.01% | 4 分钟 23 秒 |
| 99.999% | 0.001% | 26 秒 |

### Error Budget 的战略价值

Error Budget 的核心思想：**可靠性不是越高越好，而是在用户满意度和业务创新速度之间找到平衡。**

```
Error Budget 充足时：
  ├── 允许发布新功能
  ├── 允许进行架构实验
  ├── 可以承担更多风险
  └── 团队重心：速度优先

Error Budget 耗尽时：
  ├── 停止非紧急变更
  ├── 专注修复可靠性问题
  ├── 增加测试覆盖
  └── 团队重心：稳定优先
```

这种方式把"是否可以发布新版本"从管理者的主观判断变成了数据驱动的决策。Error Budget 还有剩余？放心发布。耗尽了？先还技术债。

## 如何制定 SLI/SLO

### 用户旅程分析方法

制定 SLI/SLO 的第一步不是看监控系统有什么指标，而是从用户视角梳理关键路径。

**步骤：**

1. **识别用户旅程**：用户使用服务的核心路径是什么？
2. **定义关键步骤**：旅程中哪些步骤是最关键的？
3. **确定衡量方式**：每个关键步骤用什么指标衡量"好"与"坏"？
4. **设定初始目标**：根据历史数据和业务需求设定目标值

以一个电商平台为例：

```
用户旅程：
  搜索商品 → 浏览详情 → 加入购物车 → 提交订单 → 支付完成

关键步骤与 SLI：
  ├── 搜索：搜索响应延迟（P99 < 500ms）、搜索成功率（> 99.5%）
  ├── 商品详情：页面加载时间（P95 < 1s）
  ├── 购物车：添加购物车成功率（> 99.9%）
  ├── 下单：订单提交成功率（> 99.95%）
  └── 支付：支付成功率（> 99.99%）
```

注意越靠近"付费"环节，SLO 越严格。这是业务逻辑决定的：搜索偶尔慢一下用户可以接受，但付不了钱会直接造成损失。

### Google 四个金色信号

Google SRE 提出了四个 Golden Signals，是选择 SLI 的经典框架：

| 信号 | 含义 | 典型 SLI |
|------|------|----------|
| **Latency（延迟）** | 服务处理请求需要多长时间 | P50/P95/P99 响应时间 |
| **Traffic（流量）** | 服务的请求量有多大 | QPS、并发连接数、日活用户数 |
| **Errors（错误）** | 请求失败的比例 | HTTP 5xx 比例、业务错误率 |
| **Saturation（饱和度）** | 服务资源使用有多满 | CPU 使用率、内存使用率、连接池使用率 |

**实践建议：** 优先覆盖 Latency 和 Errors，这两个信号与用户体验最直接相关。Traffic 和 Saturation 更多用于容量规划和提前预警。

### 具体示例

#### Web 服务

```yaml
# Web 服务的 SLI/SLO 设计
service: 用户门户
slos:
  - name: 可用性
    sli: "HTTP 非 5xx 响应比例"
    target: 99.9%
    window: 30d

  - name: 页面加载延迟
    sli: "首屏加载时间 < 2s 的请求比例"
    target: 95%
    window: 30d

  - name: API 延迟
    sli: "API 响应时间 P99 < 500ms 的请求比例"
    target: 99%
    window: 30d
```

#### API 服务

```yaml
# API 网关的 SLI/SLO 设计
service: API 网关
slos:
  - name: 可用性
    sli: "非 5xx 响应比例（不含 429 限流）"
    target: 99.95%
    window: 30d

  - name: 尾部延迟
    sli: "P99 延迟 < 200ms 的请求比例"
    target: 99%
    window: 30d

  - name: 正确性
    sli: "响应内容与 Schema 一致的请求比例"
    target: 99.99%
    window: 30d
```

#### 批处理任务

```yaml
# 批处理任务的 SLI/SLO 设计
service: 每日对账任务
slos:
  - name: 完成度
    sli: "在截止时间前完成的比例"
    target: 99.5%
    window: 30d

  - name: 数据正确性
    sli: "对账结果与人工抽检一致的比例"
    target: 100%
    window: 30d

  - name: 处理延迟
    sli: "实际完成时间 - 计划完成时间 < 30min 的比例"
    target: 95%
    window: 30d
```

批处理任务的 SLI 与在线服务不同，通常关注**完成度**、**正确性**和**时效性**，而非实时延迟。

## SLO 监控与告警

### 传统阈值告警的问题

传统的告警方式（如 CPU > 80% 就报警）存在明显缺陷：

- **告警风暴**：短暂的毛刺触发大量告警，造成告警疲劳
- **漏报**：缓慢的性能退化不触发任何告警
- **与用户体验脱节**：CPU 80% 时用户体验可能完全正常

SRE 推荐的做法是：**基于 SLO 和 Error Budget 设计告警**，直接关联用户影响。

### Burn Rate 告警方法

Burn Rate（燃烧速率）是衡量 Error Budget 消耗速度的核心指标：

```
Burn Rate = 实际错误率 / 允许错误率

例如：
SLO = 99.9%（允许错误率 = 0.1%）
当前小时错误率 = 1%
Burn Rate = 1% / 0.1% = 10x
```

Burn Rate = 1 表示 Error Budget 正好按计划均匀消耗；Burn Rate = 10 表示预算以 10 倍速度燃烧，如果持续下去会很快耗尽。

Google 推荐的多窗口告警策略：

| 条件 | 短窗口 | 长窗口 | Burn Rate | 严重程度 |
|------|--------|--------|-----------|----------|
| 快速恶化 | 5 分钟 | 1 小时 | 14.4x | Page（立即通知） |
| 中等恶化 | 30 分钟 | 6 小时 | 6x | Page |
| 缓慢退化 | 6 小时 | 3 天 | 1x | Ticket（工单通知） |

**关键原则：**

- **Page（电话/短信告警）**：需要立即人工介入的紧急情况
- **Ticket（工单告警）**：需要在工作时间内处理的非紧急问题
- 如果一个告警触发后你什么都不做，那这个告警就不应该存在

基于 Burn Rate 的告警规则示例（Prometheus 规则伪代码）：

```yaml
# 快速恶化告警：5 分钟内 Burn Rate > 14.4
- alert: HighErrorBudgetBurn
  expr: |
    (
      rate(http_requests_total{code=~"5.."}[5m])
      /
      rate(http_requests_total[5m])
    )
    >
    (1 - 0.999) * 14.4
  for: 5m
  labels:
    severity: page
  annotations:
    summary: "SLO 即将被打破：Error Budget 燃烧速率过高"
```

## SLO 评审会议

SLO 体系不是"设完就忘"，需要持续的评审和迭代。

### 评审会议的节奏

| 频率 | 内容 | 参与者 |
|------|------|--------|
| **每周** | Error Budget 消耗趋势、告警回顾 | SRE、值班工程师 |
| **每月** | SLO 达成情况、重大事件复盘 | SRE、开发团队负责人 |
| **每季度** | SLO 目标是否需要调整、SLI 是否有效 | SRE、产品经理、开发团队 |

### 季度评审的核心议题

1. **SLO 达成情况回顾**：过去一季度的 SLO 是否达标？
2. **SLO 是否需要调整**：
   - 连续超额完成（SLO 达成率 > SLO + 0.5%）→ 考虑收紧 SLO，释放更多 Error Budget 用于创新
   - 连续未达标 → 分析原因，是 SLO 过于激进还是确有可靠性问题
3. **SLI 有效性验证**：当前的 SLI 是否仍然反映用户体验？
4. **Error Budget 使用分析**：预算花在了哪里？是计划内的发布消耗还是意外故障？
5. **告警有效性**：过去一季度的告警中有多少是有效的？是否有漏报？

## 真实案例：一个在线服务的 SLO 制定全过程

### 背景

某公司在 2024 年上线了一个在线文档协作平台，核心功能包括文档编辑、实时协作、评论和分享。上线半年后，团队决定引入 SLO 体系来系统管理服务可靠性。

### 第一步：梳理用户旅程

```
用户核心路径：
  登录 → 打开文档 → 编辑内容 → 实时同步 → 分享/导出

辅助路径：
  搜索文档 → 查看评论 → 管理权限
```

### 第二步：选择关键 SLI

团队基于用户旅程和四个 Golden Signals，选定 3 个核心 SLI：

| SLI | 度量方式 | 理由 |
|-----|----------|------|
| 文档可用性 | 成功打开文档 / 打开文档请求总数 | 最基础的用户需求 |
| 编辑同步延迟 | 协作者看到变更的 P99 延迟 | 实时协作的核心体验 |
| API 错误率 | HTTP 5xx 比例 | 覆盖所有后端接口 |

### 第三步：设定初始 SLO

团队收集了过去 3 个月的历史数据：

| 指标 | P30 历史 | 初始 SLO | 理由 |
|------|----------|----------|------|
| 文档可用性 | 99.92% | 99.9% | 略低于历史表现，留合理缓冲 |
| 同步延迟（P99 < 500ms） | 99.5% | 99% | 当前表现稳定，但延迟受网络影响大 |
| API 错误率（< 0.1%） | 0.04% | 99.9% | 对应 0.1% 的错误率上限 |

### 第四步：构建监控与告警

基于 Prometheus + Grafana 搭建 SLO Dashboard，配置 Burn Rate 告警：

```
Error Budget 计算示例（30 天窗口）：

文档可用性 SLO = 99.9%
总请求数/月 ≈ 50,000,000
允许失败请求数 = 50,000,000 × 0.1% = 50,000 次/月
Burn Rate 告警阈值：
  - Page: 14.4x（约 347 秒内花光 30 天预算的速度）
  - Ticket: 1x（按计划速度燃烧，需要关注）
```

### 第五步：运行与迭代

第一个季度运行后发现：

- **文档可用性 SLO 轻松达成**（实际 99.94%），团队决定将 SLO 提升至 99.95%
- **同步延迟 SLO 触发了 2 次告警**，根因是一家云厂商的区域网络抖动。团队在架构层增加了多区域容灾，并将 P99 目标放宽到 800ms（覆盖更多尾部延迟场景）
- **API 错误率 SLO 未达成**（实际 99.85%），根因是一个批量导出功能的超时问题。团队将导出功能从主链路拆分为异步任务，下季度 API 错误率降至 99.97%

经过一个季度的迭代，SLO 体系从"粗略估算"变成了团队可靠性和发布决策的核心依据。

## 工具推荐

### Sloth：Prometheus SLO 生成器

[Sloth](https://github.com/slok/sloth) 是一个基于 Prometheus 的 SLO 规则生成器。它遵循 Google 的 SLO 实践，自动生成 Burn Rate 告警规则和 Error Budget 仪表盘所需的 Recording Rules。

核心优势：

- 用简洁的 YAML 定义 SLO，自动生成复杂的 Prometheus 规则
- 内置多窗口 Burn Rate 告警模板
- 支持 Prometheus 和 Thanos/VictoriaMetrics 等兼容后端

```yaml
# Sloth SLO 定义示例
version: "prometheus/v1"
service: "api-gateway"
slos:
  - name: "api-availability"
    objective: 99.9
    description: "API 网关可用性 SLO"
    sli:
      events:
        error_query: sum(rate(http_requests_total{job="api-gateway",code=~"5.."}[{{.window}}]))
        total_query: sum(rate(http_requests_total{job="api-gateway"}[{{.window}}]))
    alerting:
      name: ApiAvailabilitySLOBurn
      labels:
        team: sre
      page_alert:
        labels:
          severity: page
      ticket_alert:
        labels:
          severity: warning
```

### OpenSLO 规范

[OpenSLO](https://github.com/OpenSLO/OpenSLO) 是一个开放标准，定义了 SLO 的声明式格式。它不绑定特定的监控后端，目标是让 SLO 定义可以在不同工具之间迁移。

核心价值：

- **标准化**：统一的 SLO 定义格式，避免厂商锁定
- **可组合**：支持与 Sloth、Nobl9、Bigeye 等工具集成
- **GitOps 友好**：SLO 定义可以纳入版本控制，走 Code Review 流程

```yaml
# OpenSLO 定义示例
apiVersion: openslo/v1
kind: SLO
metadata:
  name: api-availability
  displayName: API 可用性
spec:
  service: api-gateway
  indicator:
    thresholdMetric:
      metricSource:
        type: Prometheus
        spec:
          query: "sum(rate(http_requests_total{code!~\"5..\"}[5m])) / sum(rate(http_requests_total[5m]))"
  objectives:
    - displayName: 月度可用性
      target: 0.999
      timeSliceTarget: 0.9995
      timeSliceWindow: 5m
  timeWindows:
    - duration: 30d
      isRolling: true
```

### 工具生态一览

| 工具 | 用途 | 特点 |
|------|------|------|
| **Sloth** | Prometheus SLO 规则生成 | 轻量、专注、Go 实现 |
| **OpenSLO** | SLO 定义标准规范 | 厂商中立、可迁移 |
| **Pyrra** | SLO 监控与可视化 | 基于 Sloth，提供 Web UI |
| **Nob9** | 商业 SLO 平台 | 多数据源支持、企业级 |
| **Grafana SLO** | Grafana 原生 SLO 功能 | 与 Grafana 生态深度集成 |

## 总结

SRE 不是一套工具，而是一种思维方式。SLI/SLO/SLA 体系的核心价值在于：

1. **用数据替代直觉**：不再争论"够不够稳定"，而是看 SLO 达成率
2. **用预算替代恐惧**：Error Budget 让团队敢于发布，而不是畏手畏脚
3. **用工程替代救火**：从被动响应转向主动管理可靠性
4. **用对齐替代对立**：产品、开发、SRE 团队在同一个 SLO 上达成共识

落地建议：从一个小服务开始，选 1-2 个核心 SLI，设定一个宽松的 SLO，运行一个季度后迭代。SLO 体系不需要一步到位，关键是开始度量。
