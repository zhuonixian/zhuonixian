---
title: DevOps
icon: pen-to-square
date: 2026-05-29
category:
  - 技术领域
tag:
  - devops
  - ci-cd
  - infrastructure
  - automation
---

# DevOps

DevOps 是一种融合开发（Development）和运维（Operations）的文化与实践，旨在通过自动化和持续反馈加速软件交付，同时提升系统可靠性和团队协作效率。

## CI/CD 流水线

持续集成（CI）要求开发者频繁将代码合并到主分支，每次合并触发自动化构建和测试。持续交付/部署（CD）将通过测试的变更自动发布到生产环境。GitHub Actions、GitLab CI 和 Jenkins 是主流的 CI/CD 工具。

## 容器化与编排

Docker 通过容器技术将应用及其依赖打包为标准化单元，消除了"在我的机器上能运行"的问题。Kubernetes 作为容器编排平台，管理容器的部署、扩缩和故障恢复，已成为云原生基础设施的事实标准。

## 基础设施即代码（IaC）

Terraform、Ansible 和 Pulumi 等工具将基础设施配置用代码定义和版本管理，实现了基础设施的可复现、可审计和自动化管理。IaC 是 GitOps 实践的基础。

## 监控与可观测性

可观测性三大支柱——日志（Logging）、指标（Metrics）和追踪（Tracing）——构成了生产环境健康监控的核心。Prometheus + Grafana 是指标监控的经典组合，ELK/EFK 技术栈用于日志聚合，Jaeger 用于分布式追踪。

## GitOps 与 AIOps

GitOps 将 Git 仓库作为基础设施和应用状态的唯一可信来源，所有变更通过 Pull Request 触发。AIOps 利用机器学习分析运维数据，实现异常检测、根因分析和自动修复，代表了 DevOps 与 AI 结合的未来方向。

DevOps 实践是 [软件工程](/posts/wiki/topics/software-engineering.html)在运维维度的延伸，[AI 编程](/posts/wiki/concepts/agentic-coding.html)工具也在逐步渗透到 DevOps 工作流中。

## 相关页面

- [topics/software-engineering](/posts/wiki/topics/software-engineering.html)
- [concepts/agentic-coding](/posts/wiki/concepts/agentic-coding.html)
