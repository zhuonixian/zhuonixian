---
title: GPT
icon: pen-to-square
date: 2026-05-29
category:
  - 公司与人物
tag:
  - product
  - llm
  - openai
  - chatgpt
---

# GPT

> OpenAI 的 Generative Pre-trained Transformer 系列，定义了大语言模型的技术范式。

## 简介

GPT（Generative Pre-trained Transformer）是 [OpenAI](/posts/wiki/entities/openai.html) 开发的大语言模型系列，基于 [Transformer 架构](/posts/wiki/concepts/transformer-architecture.html) 的 Decoder 部分。从 2018 年的 GPT-1 到 2024 年的 GPT-4o，每一代都在规模和能力上实现了质的飞跃，深刻塑造了整个 AI 行业的技术路线。

## 模型演进

### GPT-1（2018）

1.17 亿参数，首次验证了"生成式预训练 + 刡精调"的范式，在 12 项 NLP 任务中 9 项达到 SOTA。

### GPT-2（2019）

15 亿参数，展示了零样本（zero-shot）学习的能力。因生成文本质量过高，初期只发布小模型版本，引发关于 AI 安全的广泛讨论。

### GPT-3（2020）

1750 亿参数，few-shot learning 成为核心能力。API 开放后催生了大量应用生态，标志着 Foundation Model 时代的到来。

### GPT-4（2023）

多模态模型（文本 + 图像输入），在专业考试、代码生成、推理任务上大幅超越前代。技术报告首次系统披露了 RLHF 对齐方法。

### GPT-4o（2024）

"omni"模型，实现原生多模态能力（文本、音频、图像、视频），实时语音交互延迟降至毫秒级，标志着人机交互范式的转变。

## ChatGPT

ChatGPT 于 2022 年 11 月基于 GPT-3.5 发布，是有史以来增长最快的消费级应用。后续迭代包括：

- **GPTs / GPT Store**：用户自定义 AI Agent 的市场
- **Custom Instructions**：个性化指令持久化
- **Memory**：跨对话记忆能力

## 技术特点

- 基于 Transformer Decoder 的自回归生成
- 规模法则（Scaling Law）驱动的性能提升
- RLHF（人类反馈强化学习）实现行为对齐
- 上下文学习（In-context Learning）能力

## 相关页面

- [entities/openai](/posts/wiki/entities/openai.html)
- [concepts/transformer-architecture](/posts/wiki/concepts/transformer-architecture.html)
- [concepts/reinforcement-learning-from-human-feedback](/posts/wiki/concepts/reinforcement-learning-from-human-feedback.html)
- [comparisons/rag-vs-compiled-wiki](/posts/wiki/comparisons/rag-vs-compiled-wiki.html)
