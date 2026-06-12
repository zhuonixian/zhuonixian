---
title: 云原生生态全景：CNCF 项目与选型指南
icon: globe
date: 2026-06-13
category:
  - 技术
tag:
  - 云原生
  - CNCF
  - 开源
  - 选型
---

# 云原生生态全景：CNCF 项目与选型指南

云原生（Cloud Native）不仅仅是 Kubernetes，它是一整套围绕容器化、微服务、声明式 API 和自动化运维的技术体系。CNCF（Cloud Native Computing Foundation）作为这一生态的治理组织，截至 2026 年已拥有 **36 个毕业项目** 和 **37 个孵化项目**。本文梳理云原生生态的核心分类、代表性项目及选型建议。

<!-- more -->

## CNCF 是什么

CNCF 成立于 2015 年，是 Linux 基金会旗下的非营利组织，致力于推广云原生技术。它的核心工作：

- **项目管理**：为开源项目提供中立治理、法务支持、市场营销
- **认证体系**：CKA（管理员）、CKAD（开发者）、CKS（安全专家）认证
- **社区活动**：KubeCon + CloudNativeCon 全球大会
- **全景图维护**：[landscape.cncf.io](https://landscape.cncf.io/) 持续追踪生态项目

### 项目成熟度级别

| 级别 | 说明 | 要求 |
|------|------|------|
| **Sandbox（沙箱）** | 早期探索阶段 | 有创新价值，符合 CNCF 章程 |
| **Incubating（孵化）** | 成长阶段 | 有至少 2 个生产用户，健康的贡献者群体 |
| **Graduated（毕业）** | 生产就绪 | 高度成熟，广泛采用，治理完善 |

## 云原生全景图分类

CNCF 将云原生技术划分为以下核心类别，每一类都有对应的开源项目和商业产品。

### 1. 容器运行时

| 项目 | 级别 | 说明 |
|------|------|------|
| **containerd** | 毕业 | 最主流的容器运行时，Docker 和 K8s 的底层引擎 |
| **CRI-O** | 毕业 | 专为 Kubernetes 设计的轻量运行时 |
| **runc** | 毕业 | OCI 容器运行时参考实现 |
| **Kata Containers** | 孵化 | 基于 VM 的安全容器运行时 |

**选型建议：** 生产环境默认选 containerd。对安全隔离要求高的场景（多租户、金融），考虑 Kata Containers。

### 2. 调度与编排

| 项目 | 级别 | 说明 |
|------|------|------|
| **Kubernetes** | 毕业 | 事实标准的容器编排平台 |
| **Crossplane** | 孵化 | 基础设施编排，用 K8s API 管理云资源 |
| **Volcano** | 孵化 | 批处理调度，适合 AI/ML 任务 |

### 3. 服务网格

| 项目 | 级别 | 说明 |
|------|------|------|
| **Istio** | 毕业 | 功能最全面的服务网格，Google/IBM/Lyft 联合开发 |
| **Linkerd** | 毕业 | 轻量级服务网格，专注简洁和性能 |

**选型建议：** 大规模微服务（50+ 服务）选 Istio；中小规模或团队资源有限选 Linkerd。v1.35 的 Gang Scheduling 对 Istio 的 sidecar 注入有更好的兼容性。

### 4. 可观测性

| 类别 | 项目 | 级别 | 说明 |
|------|------|------|------|
| 监控 | **Prometheus** | 毕业 | 指标采集与告警，云原生监控标准 |
| 日志 | **Fluentd** | 毕业 | 统一日志采集、处理、转发 |
| 追踪 | **OpenTelemetry** | 孵化 | 统一的可观测性框架（指标+日志+追踪） |
| 追踪 | **Jaeger** | 毕业 | 分布式链路追踪 |
| 可视化 | **Grafana** | — | 数据可视化面板（非 CNCF 项目，但生态核心） |

**典型可观测性方案：**

```
应用 → OpenTelemetry SDK
         ├─ 指标 → Prometheus → Grafana
         ├─ 日志 → Fluentd → Elasticsearch/Loki → Grafana
         └─ 追踪 → Jaeger → Grafana Tempo
```

### 5. CI/CD 与 GitOps

| 项目 | 级别 | 说明 |
|------|------|------|
| **Argo CD** | 孵化 | 声明式 GitOps 持续交付，K8s 原生 |
| **Flux** | 毕业 | GitOps 工具，CNCF 毕业项目 |
| **Tekton** | 孵化 | 云原生 CI/CD 框架 |
| **Jenkins X** | 孵化 | 基于 Jenkins 的云原生 CI/CD |

**选型建议：** GitOps 方案首选 Argo CD（UI 友好、社区活跃）或 Flux（轻量、CNCF 毕业）。CI 流水线选 Tekton 或 GitHub Actions。

### 6. 容器网络（CNI）

| 项目 | 级别 | 说明 |
|------|------|------|
| **Cilium** | 毕业 | 基于 eBPF 的高性能网络，支持 L3-L7 策略 |
| **Calico** | 毕业 | BGP 路由方案，生产环境广泛使用 |
| **CNI-Genie** | 沙箱 | 多 CNI 插件管理 |

**选型建议：** 新集群推荐 Cilium（eBPF 性能优势，可观测性好）。传统环境 Calico 依然可靠。

### 7. 容器存储（CSI）

| 项目 | 级别 | 说明 |
|------|------|------|
| **Rook** | 毕业 | K8s 上编排 Ceph、NFS 等存储的 Operator |
| **Vitess** | 毕业 | MySQL 数据库集群管理 |
| **TiKV** | 毕业 | 分布式事务型键值存储 |

### 8. 密钥与安全

| 项目 | 级别 | 说明 |
|------|------|------|
| **Notary** | 毕业 | 容器镜像签名与验证 |
| **SPIFFE/SPIRE** | 毕业 | 服务身份框架 |
| **Open Policy Agent (OPA)** | 毕业 | 统一策略引擎 |
| **Falco** | 毕业 | 运行时安全监控，检测异常行为 |
| **Trivy** | 毕业 | 容器镜像和文件系统漏洞扫描 |
| **cert-manager** | 孵化 | TLS 证书自动化管理 |

### 9. Serverless

| 项目 | 级别 | 说明 |
|------|------|------|
| **Knative** | 孵化 | K8s 上的 Serverless 框架 |
| **OpenFaaS** | 孵化 | 简单易用的 Serverless 函数平台 |
| **Dapr** | 毕业 | 微服务构建块，事件驱动 |

### 10. 平台与发行版

| 项目 | 说明 |
|------|------|
| **K3s** | Rancher 出品的轻量 K8s，适合边缘和 IoT |
| **kind** | 用 Docker 运行 K8s 集群，本地开发首选 |
| **minikube** | 本地 K8s 集群工具 |
| **k0s** | 单二进制 K8s 发行版，零依赖 |

## 云原生路线图

CNCF Trail Map 定义了企业采用云原生的推荐路径：

```
阶段 1 ─── 容器化
          将应用打包为容器镜像（Dockerfile、OCI 镜像标准）

阶段 2 ─── CI/CD
          建立自动化构建、测试、部署流水线

阶段 3 ─── 服务编排
          引入 Kubernetes 进行容器编排和管理

阶段 4 ─── 可观测性
          部署监控（Prometheus）、日志（Fluentd）、追踪（Jaeger）

阶段 5 ─── 服务代理 / 发现 / 网格
          服务间通信治理（Istio/Linkerd）

阶段 6 ─── 网络 / 安全策略
          网络策略、RBAC、镜像扫描、运行时安全

阶段 7 ─── 分布式数据库 / 存储
          有状态应用管理、持久化存储方案
```

## 2026 年云原生趋势

| 趋势 | 说明 |
|------|------|
| **平台工程** | 内部开发者平台（IDP）减轻开发者的认知负载 |
| **AI 工作负载** | K8s 成为 AI/ML 训练和推理的基础设施（GPU 调度、Gang Scheduling） |
| **eBPF** | Cilium 驱动网络、安全、可观测性的统一 |
| **FinOps** | K8s 成本优化成为企业关注焦点 |
| **边缘计算** | K3s、MicroK8s 等轻量方案向边缘延伸 |
| **GitOps** | Argo CD 和 Flux 成为持续交付的事实标准 |

## 选型速查表

| 场景 | 推荐方案 |
|------|----------|
| 容器运行时 | containerd |
| 容器编排 | Kubernetes（托管集群优先） |
| 容器网络 | Cilium（新集群）/ Calico（传统集群） |
| 服务网格 | Istio（大规模）/ Linkerd（轻量） |
| 监控 | Prometheus + Grafana |
| 日志 | Fluentd + Loki |
| 追踪 | OpenTelemetry + Jaeger |
| CI/CD | Tekton + Argo CD |
| 镜像扫描 | Trivy |
| 密钥管理 | cert-manager + Vault |
| 策略引擎 | OPA / Kyverno |

**参考资源：**

- [CNCF 全景图](https://landscape.cncf.io/)
- [CNCF 项目列表](https://www.cncf.io/projects/)
- [CNCF Cloud Native Trail Map](https://github.com/cncf/trailmap)
- [云原生发展状态报告 2026 Q1](https://www.cncf.io/reports/state-of-cloud-native-development-q1-2026/)
