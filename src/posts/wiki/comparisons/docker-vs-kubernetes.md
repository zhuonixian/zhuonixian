---
title: Docker vs Kubernetes
icon: pen-to-square
date: 2026-05-29
category:
  - 技术对比
tag:
  - comparison
  - containerization
  - orchestration
  - devops
---

# Docker vs Kubernetes

Docker 和 Kubernetes 解决的是不同层面的问题：Docker 关注容器的构建和运行，Kubernetes 关注容器的编排和管理。两者是互补关系而非竞争关系。

## Docker：容器运行时

Docker 让应用的打包和运行标准化。核心概念包括：

- **镜像（Image）**：包含应用及所有依赖的只读模板
- **容器（Container）**：镜像的运行实例，隔离的轻量级运行环境
- **Dockerfile**：定义镜像构建步骤的声明式脚本
- **Docker Compose**：定义和运行多容器应用的编排工具

Docker 解决了环境一致性问题，是现代开发工作流的基础。

## Kubernetes：容器编排平台

K8s 在容器之上提供大规模集群管理：**Pod**（最小调度单元）、**Service**（稳定访问入口和负载均衡）、**Deployment**（声明式管理副本数和更新策略）。K8s 解决的是高可用、弹性伸缩和滚动更新等运维难题。

## 两者关系

两者处于不同层级：`代码 → Dockerfile → 镜像 → K8s Pod → K8s Service`。Docker 负责"打包和运行"，K8s 负责"调度和管理"。类比：Docker 是集装箱，K8s 是港口调度系统。单机开发用 Docker Compose，多节点生产部署用 K8s。

## 使用场景

- **Docker 独立**：本地开发环境、CI/CD 构建、单机部署
- **Docker + K8s**：微服务架构、大规模生产、自动扩缩容

容器化和编排是 [DevOps](/posts/wiki/topics/devops.html) 的技术基石。

## 相关页面

- [topics/devops](/posts/wiki/topics/devops.html)
