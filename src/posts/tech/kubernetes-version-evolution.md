---
title: Kubernetes 版本演进：v1.33 到 v1.35 新特性解读
icon: code-branch
date: 2026-06-13
category:
  - 技术
tag:
  - Kubernetes
  - 版本更新
  - 新特性
---

# Kubernetes 版本演进：v1.33 到 v1.35 新特性解读

Kubernetes 自 2015 年开源以来，保持着每年 3 个小版本的稳定发布节奏（约每 4 个月一次）。本文聚焦 2025 年的三个版本——v1.33 Octarine、v1.34 Of Wind & Will、v1.35 Timbernetes，解读关键特性变化及其对生产环境的影响。

<!-- more -->

## 版本发布概览

| 版本 | 代号 | 发布日期 | 增强总数 | GA | Beta | Alpha | 废弃 |
|------|------|----------|----------|----|------|-------|------|
| **v1.33** | Octarine | 2025-04-23 | 64 | 18 | 20 | 24 | 2 |
| **v1.34** | Of Wind & Will | 2025-08-27 | 58 | — | — | 13+ | — |
| **v1.35** | Timbernetes | 2025-12-17 | 60 | 17 | 19 | 22 | — |

Kubernetes 的特性成熟路径：**Alpha → Beta → GA（Stable）**。Alpha 默认禁用，Beta 默认启用，GA 表示生产可用。

## v1.33 Octarine（2025 年 4 月）

### 关键特性

#### 1. MatchLabelKeys 增强 Pod 调度亲和性

支持在 Pod 亲和性/反亲和性中使用 `matchLabelKeys`，可以按 Pod 版本标签自动匹配，避免滚动更新时新旧版本 Pod 被强制调度到一起。

```yaml
affinity:
  podAntiAffinity:
    preferredDuringSchedulingIgnoredDuringExecution:
      - weight: 100
        podAffinityTerm:
          labelSelector:
            matchExpressions:
              - key: app
                operator: In
                values: ["web-app"]
          matchLabelKeys:
            - app-version  # 按 Pod 的 app-version 标签精确匹配
          topologyKey: kubernetes.io/hostname
```

#### 2. Go 1.24 构建

K8s 组件全面迁移到 Go 1.24 编译，带来性能提升和安全修复。

#### 3. 资源管理增强

- 改进了 kubelet 的资源监控精度
- 优化了大集群（5000+ 节点）的调度性能

#### 4. 安全改进

- 加强了 API Server 的审计日志粒度
- 改进了 ServiceAccount Token 的轮换机制

### 废弃项

- 部分旧版 `kubectl` 命令参数标记为废弃
- `flowcontrol.apiserver.k8s.io/v1beta2` 升级到 `v1`

## v1.34 Of Wind & Will（2025 年 8 月）

### 关键特性

#### 1. DRA（动态资源分配）正式 GA

**这是 v1.34 最重要的里程碑。** DRA 允许 Pod 请求特定类型的硬件资源（GPU、FPGA、RDMA 网卡等），类似于持久卷的动态分配，但面向的是通用硬件资源。

```yaml
apiVersion: resource.k8s.io/v1beta1
kind: ResourceClaim
metadata:
  name: gpu-claim
spec:
  devices:
    requests:
      - name: gpu
        deviceClassName: gpu.nvidia.com
```

这对 AI/ML 工作负载的意义：

- 不再需要手动管理 GPU 节点标签和调度约束
- 支持多个 GPU 厂商的统一资源请求
- 可以共享 GPU（MIG、时间分片）

#### 2. Swap 支持毕业

K8s 正式支持 Linux Swap 分区：

- 节点可以配置 Swap 空间
- 内存紧张时 Pod 可以使用 Swap 而非直接被 OOM Kill
- 适合开发环境和内存波动大的工作负载

```bash
# kubelet 配置启用 swap
--fail-on-swap=false
--system-reserved=memory=2Gi
```

#### 3. PSI（Pressure Stall Information）进入 Beta

PSI 指标可以精确追踪 CPU、内存、IO 的竞争情况：

- 比传统负载平均值更精确
- 帮助识别资源瓶颈和 Noisy Neighbor 问题
- kubelet 可以基于 PSI 做出更好的驱逐决策

#### 4. TLS 强化

- 默认启用更严格的 TLS 配置
- 废弃部分弱密码套件
- API Server 和 kubelet 间通信强制 TLS 1.2+

#### 5. HPA 支持 Pod 级资源规格

HPA 现在可以正确处理 Pod 中每个容器的资源请求和限制，而不是简单地使用 Pod 总量。

## v1.35 Timbernetes（2025 年 12 月）

### 关键特性

#### 1. Gang Scheduling（ gang 调度）

**AI/ML 训练场景的核心需求。** Gang Scheduling 确保一组 Pod 要么全部调度成功，要么全部等待，避免部分 Pod 调度后因等待其他 Pod 而浪费资源。

```
传统调度：
┌─ Pod A (GPU) ─── ✅ 已调度，占用 GPU 等待中
├─ Pod B (GPU) ─── ❌ GPU 不足，Pending
└─ Pod C (GPU) ─── ✅ 已调度，占用 GPU 等待中
结果：A 和 C 白白占用 GPU，任务无法执行

Gang Scheduling：
┌─ Pod A ─── ⏳ 等待全部就绪
├─ Pod B ─── ⏳ 等待全部就绪
└─ Pod C ─── ⏳ 等待全部就绪
结果：要么全部调度，要么全部等待，资源不浪费
```

这对分布式训练（PyTorch、TensorFlow）意义重大。

#### 2. 有状态工作负载垂直扩缩容

StatefulSet 支持在线调整资源请求和限制，无需重建 Pod。配合 VPA（Vertical Pod Autoscaler），可以自动调整有状态应用（数据库、中间件）的资源配额。

#### 3. SLA 管理

引入更完善的服务等级目标管理能力：

- 更精细的 Pod 优先级和抢占策略
- 改进了 Descheduler 的策略引擎
- 支持基于可用区的故障域感知调度

#### 4. KYAML 格式

引入专门的 Kubernetes YAML 处理格式，提升：

- YAML 序列化性能
- 大规模配置文件的处理速度
- kubectl 和控制器间的一致性

## 版本选择建议

| 场景 | 推荐版本 | 理由 |
|------|----------|------|
| 新部署 | v1.35 | 最新特性，安全补丁最全 |
| 稳定优先 | v1.34 | DRA GA，经过半年验证 |
| 保守升级 | v1.33 | 成熟稳定，社区支持最长 |
| GPU/AI 工作负载 | v1.35 | Gang Scheduling + DRA |
| 开发测试 | v1.35 | 体验所有新特性 |

### 升级路径

```
v1.32 → v1.33 → v1.34 → v1.35
       ↑        ↑        ↑
     2025-04   2025-08   2025-12

规则：一次只升一个小版本，逐步推进
```

### 检查 API 兼容性

```bash
# 查看集群中使用的废弃 API
kubectl get --raw /metrics | grep apiserver_requested_deprecated_apis

# 启用废弃 API 告警
kubectl apply -f - <<EOF
apiVersion: monitoring.coreos.com/v1
kind: PrometheusRule
metadata:
  name: deprecated-api-alerts
spec:
  groups:
    - name: deprecated-apis
      rules:
        - alert: DeprecatedAPIInUse
          expr: apiserver_requested_deprecated_apis > 0
          for: 1h
          labels:
            severity: warning
EOF
```

## 总结

从 v1.33 到 v1.35，Kubernetes 的演进方向清晰：

| 方向 | 具体体现 |
|------|----------|
| **AI 基础设施** | DRA（GPU 管理）、Gang Scheduling（分布式训练） |
| **资源效率** | Swap 支持、垂直扩缩容、PSI 指标 |
| **安全加固** | TLS 强化、API 审计增强 |
| **性能优化** | Go 1.24、KYAML、调度器加速 |
| **成熟度** | 更多特性从 Alpha 走向 GA |

Kubernetes 正在从"容器编排工具"进化为"通用计算基础设施"，尤其对 AI 工作负载的支持已成为其发展的核心驱动力之一。

**参考资源：**

- [Kubernetes v1.33 Release](https://kubernetes.io/blog/2025/04/23/kubernetes-v1-33-release/)
- [Kubernetes v1.34 Release](https://kubernetes.io/blog/2025/08/27/kubernetes-v1-34-release/)
- [Kubernetes v1.35 Release](https://kubernetes.io/blog/2025/12/17/kubernetes-v1-35-release/)
- [Kubernetes Releases](https://kubernetes.io/releases/)
