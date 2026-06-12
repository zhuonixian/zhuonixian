---
title: Kubernetes 核心概念与架构详解
icon: docker
date: 2026-06-13
category:
  - 技术
tag:
  - Kubernetes
  - 云原生
  - 容器编排
---

# Kubernetes 核心概念与架构详解

Kubernetes（简称 K8s）是 Google 开源的容器编排系统，也是云原生领域的事实标准。截至 2026 年，全球已有近 2000 万开发者在使用 Kubernetes 及相关云原生技术。本文系统梳理 K8s 的核心概念、架构设计与关键组件。

<!-- more -->

## 什么是 Kubernetes

Kubernetes 是一个可移植、可扩展的开源平台，用于管理容器化的工作负载和服务，同时提供声明式的配置和自动化能力。它于 2014 年由 Google 基于内部系统 Borg 的经验开源，2015 年捐赠给 CNCF（Cloud Native Computing Foundation），并成为其第一个毕业项目。

核心能力：

- **服务发现与负载均衡**：自动暴露容器服务，分发网络流量
- **自动部署与回滚**：声明期望状态，K8s 自动驱动实际状态向期望状态收敛
- **自动装箱**：根据资源需求和约束自动调度容器到节点
- **自愈**：自动重启失败容器、替换和重新调度 Pod
- **密钥与配置管理**：集中管理敏感信息和应用配置，无需重建镜像
- **水平扩缩容**：根据 CPU 利用率或其他指标自动扩缩 Pod 数量

## 整体架构

Kubernetes 采用经典的 **控制平面（Control Plane）+ 数据平面（Data Plane）** 架构：

```
┌─────────────────── Control Plane ───────────────────┐
│                                                       │
│  ┌──────────┐  ┌──────────────┐  ┌───────────────┐  │
│  │  API      │  │  Scheduler   │  │ Controller    │  │
│  │  Server   │  │              │  │ Manager       │  │
│  └──────────┘  └──────────────┘  └───────────────┘  │
│                                                       │
│  ┌──────────────────────────────────────────────────┐ │
│  │              etcd (分布式 KV 存储)                │ │
│  └──────────────────────────────────────────────────┘ │
└───────────────────────────────────────────────────────┘

┌─────────────────── Node (Worker) ───────────────────┐
│                                                       │
│  ┌──────────┐  ┌──────────────┐  ┌───────────────┐  │
│  │ kubelet  │  │  kube-proxy  │  │ 容器运行时     │  │
│  │          │  │              │  │ (containerd)   │  │
│  └──────────┘  └──────────────┘  └───────────────┘  │
│                                                       │
│  ┌─────┐ ┌─────┐ ┌─────┐                            │
│  │ Pod │ │ Pod │ │ Pod │  ...                        │
│  └─────┘ └─────┘ └─────┘                            │
└───────────────────────────────────────────────────────┘
```

### 控制平面组件

| 组件 | 作用 |
|------|------|
| **kube-apiserver** | 集群入口，所有操作通过 REST API 经由它处理。是唯一与 etcd 直接通信的组件 |
| **etcd** | 一致性分布式键值存储，保存集群所有状态数据。建议奇数节点部署（3 或 5 个） |
| **kube-scheduler** | 监听未调度的 Pod，根据资源、亲和性、污点等策略选择合适的 Node |
| **kube-controller-manager** | 运行各类控制器（Deployment、ReplicaSet、Node 等），通过控制循环驱动状态收敛 |

### 节点组件

| 组件 | 作用 |
|------|------|
| **kubelet** | 每个 Node 上的代理，确保 Pod 中的容器按照期望状态运行 |
| **kube-proxy** | 维护节点上的网络规则，实现 Service 的负载均衡（默认 iptables 模式，可切换 IPVS） |
| **容器运行时** | 负责运行容器的软件。目前主流是 **containerd**，Docker 作为运行时已在 v1.24 被移除 |

## 核心资源对象

### Pod — 最小调度单元

Pod 是 K8s 中最小的可部署单元，包含一个或多个共享网络和存储的容器。

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: nginx
spec:
  containers:
    - name: nginx
      image: nginx:1.27
      ports:
        - containerPort: 80
      resources:
        requests:
          cpu: "100m"
          memory: "128Mi"
        limits:
          cpu: "500m"
          memory: "512Mi"
```

关键设计：

- 同一 Pod 内容器共享 **网络命名空间**（同一 IP、端口空间）
- 同一 Pod 内容器共享 **存储卷**
- Pod 是短暂的，不应依赖特定 Pod 的持久存在

### Deployment — 无状态应用管理

Deployment 管理 ReplicaSet，提供声明式更新、滚动发布和回滚能力。

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: web-app
spec:
  replicas: 3
  selector:
    matchLabels:
      app: web-app
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1
      maxUnavailable: 0
  template:
    metadata:
      labels:
        app: web-app
    spec:
      containers:
        - name: web-app
          image: myapp:v2.0
          ports:
            - containerPort: 8080
```

### Service — 服务发现与负载均衡

Service 为一组 Pod 提供稳定的访问入口。

| 类型 | 说明 |
|------|------|
| **ClusterIP** | 集群内部 IP（默认） |
| **NodePort** | 在每个节点上开放端口（30000-32767） |
| **LoadBalancer** | 云厂商提供的负载均衡器 |
| **ExternalName** | 映射到外部 DNS 名称 |

### ConfigMap 与 Secret

- **ConfigMap**：存储非敏感配置数据
- **Secret**：存储敏感信息（密码、Token、密钥），Base64 编码，可配合 RBAC 限制访问

### PersistentVolume 与 PersistentVolumeClaim

将存储从 Pod 生命周期中解耦，支持 NFS、Ceph、云盘等多种存储后端。

### Ingress

HTTP/HTTPS 路由规则，将外部流量路由到集群内的 Service。常用 Controller：NGINX Ingress Controller、Traefik。

### Namespace

资源隔离的逻辑分区。内置 Namespace：

- `default` — 默认空间
- `kube-system` — 系统组件
- `kube-public` — 公共可读资源
- `kube-node-lease` — 节点心跳

## 调度与资源管理

### 资源请求与限制

```yaml
resources:
  requests:    # 调度依据（保证最低资源）
    cpu: "100m"     # 0.1 核
    memory: "128Mi"
  limits:      # 硬上限（超限 OOM Kill 或 CPU 节流）
    cpu: "500m"
    memory: "512Mi"
```

最佳实践：始终设置 requests 和 limits，避免资源争抢导致不可预测的行为。

### 亲和性与反亲和性

- **nodeSelector**：简单标签匹配调度
- **nodeAffinity**：更灵活的节点亲和性规则
- **podAffinity / podAntiAffinity**：Pod 间的亲和/反亲和，用于同机架部署或打散部署

### 污点与容忍

- **Taint** 加在 Node 上，排斥不满足条件的 Pod
- **Toleration** 加在 Pod 上，允许调度到有特定 Taint 的 Node

典型场景：专用节点（GPU 节点、监控节点）。

## 网络模型

Kubernetes 网络遵循以下基本约束：

1. **Pod 间直接通信**：无需 NAT
2. **Node 与 Pod 间直接通信**：无需 NAT
3. **Pod 自身 IP 可见**：Pod 看到的 IP 与其他 Pod 看到的一致

常见 CNI 插件：

| 插件 | 特点 |
|------|------|
| **Calico** | BGP 路由、NetworkPolicy 支持、生产首选 |
| **Cilium** | 基于 eBPF，高性能，可观测性强，支持 L7 策略 |
| **Flannel** | 简单易用，适合入门和小集群 |
| **Weave** | 自动配置，无需额外存储 |

## 安全机制

### RBAC（基于角色的访问控制）

```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  namespace: production
  name: pod-reader
rules:
  - apiGroups: [""]
    resources: ["pods"]
    verbs: ["get", "list", "watch"]
```

### Pod 安全标准

K8s v1.25 起移除 PodSecurityPolicy，改为 **Pod Security Standards**，通过 Namespace 标签实施三个策略级别：

- **Privileged**：不受限制（系统组件用）
- **Baseline**：最小限制，阻止已知的提权风险
- **Restricted**：严格限制（推荐生产使用）

## 从 Docker 到 containerd

| 时间 | 事件 |
|------|------|
| 2016 | Docker 是默认容器运行时 |
| 2020 | K8s 弃用 Docker shim，引入 CRI 标准 |
| 2022 | K8s v1.24 正式移除 dockershim |
| 2026 | containerd 成为主流运行时，占比超过 85% |

迁移对开发者基本透明：镜像格式兼容（OCI 标准），构建仍可使用 `docker build`，运行时由 K8s 管理。

## 总结

Kubernetes 的核心设计围绕 **声明式 API + 控制循环**：用户声明期望状态，系统持续驱动实际状态向期望状态收敛。理解这一理念，是掌握 K8s 的关键。

**参考资源：**

- [Kubernetes 官方文档](https://kubernetes.io/zh-cn/docs/home/)
- [CNCF 云原生全景图](https://landscape.cncf.io/)
- [Kubernetes v1.35 Release Notes](https://kubernetes.io/blog/2025/12/17/kubernetes-v1-35-release/)
