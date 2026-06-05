---
title: Anthropic
icon: pen-to-square
date: 2026-05-29
category:
  - 公司与人物
tag:
  - company
  - ai
  - safety
---

# Anthropic

Anthropic 是一家专注于 AI 安全的美国人工智能公司，由前 OpenAI 核心成员于 2021 年创立。公司以"构建可靠、可解释、可控的 AI 系统"为使命，其旗舰产品 [entities/claude](/posts/wiki/entities/claude.html) 系列模型在 AI 助手市场中占据重要地位。

## 简介

Anthropic 的创立源于对 AI 安全问题的深刻关注。创始团队认为，随着 AI 能力的快速增长，确保 AI 系统的安全性和可控性是当前最重要的技术挑战。公司采取了"安全优先"的研发策略，在追求模型能力提升的同时，投入大量资源研究 AI 对齐（alignment）技术。

## 创始团队

Anthropic 的创始团队汇聚了 AI 安全研究领域的顶尖人才：

- **Dario Amodei**（CEO）：前 OpenAI 副总裁，负责 AI 政策和安全研究
- **Chris Amodei**（总裁）：前 OpenAI 工程负责人
- **Tom Brown**：前 OpenAI 研究科学家，GPT-3 论文共同作者
- **Daniela Amodei**（前总裁）：负责运营和商业化
- 其他多位来自 OpenAI、Google DeepMind 的资深研究员

这一团队的共同特点是深度参与了 GPT-2/GPT-3 的研发，对大语言模型的能力和风险有第一手的理解。

## 核心理念

### Constitutional AI

Constitutional AI（宪法 AI）是 Anthropic 提出的核心安全框架。其核心思想是让 AI 系统遵循一组显式的"宪法原则"（constitutional principles）来指导自身行为，而非仅仅依赖人类标注者的反馈。模型通过自我批评（self-critique）和修正来学习符合这些原则的行为模式。这一方法与 [concepts/llm-training-pipeline](/posts/wiki/concepts/llm-training-pipeline.html) 中描述的 RLHF 流程密切相关。

### 可扩展监督（Scalable Oversight）

Anthropic 认为，随着 AI 能力超越人类评估者，传统的 RLHF 方法将面临瓶颈。可扩展监督研究探索如何让较弱的监督者有效评估更强模型的输出，包括辩论（debate）、递归奖励建模等方法。

### Mechanistic Interpretability

Anthropic 积极研究机械可解释性（mechanistic interpretability），试图理解神经网络内部的表征和计算机制，而不仅仅是黑箱行为分析。

## 重要里程碑

| 时间 | 事件 |
|------|------|
| 2021 | 公司成立，获得首轮融资 |
| 2022 | 发布 Constitutional AI 论文，提出新的安全对齐方法 |
| 2023.03 | 发布 Claude 1.0，首次公开展示产品能力 |
| 2023.07 | 发布 Claude 2，大幅提升上下文窗口至 100K tokens |
| 2024.03 | 发布 Claude 3 系列（Haiku、Sonnet、Opus），能力全面提升 |
| 2024.10 | 发布 Claude 3.5 Sonnet，在代码生成和推理方面取得突破 |
| 2025 | 持续迭代 Claude 系列模型，推进 AI 安全研究 |

## 核心产品

Anthropic 的旗舰产品是 [entities/claude](/posts/wiki/entities/claude.html) 系列 AI 助手，包括不同能力级别的模型（Opus、Sonnet、Haiku）以及面向开发者的 API 和 Claude Code CLI 工具。

## 行业影响

Anthropic 在 AI 安全领域的系统性研究深刻影响了行业对 AI 对齐问题的认识。Constitutional AI 方法为业界提供了一种可扩展的安全对齐方案，减少了 AI 系统产生有害输出的风险。公司在 [concepts/llm-training-pipeline](/posts/wiki/concepts/llm-training-pipeline.html) 的后训练阶段投入了大量研究资源。

## 相关概念

- [entities/claude](/posts/wiki/entities/claude.html)：Anthropic 开发的 AI 助手系列
- [concepts/llm-training-pipeline](/posts/wiki/concepts/llm-training-pipeline.html)：Anthropic 在 RLHF 和安全对齐方面的研究贡献
