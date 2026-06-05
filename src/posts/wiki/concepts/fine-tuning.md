---
title: Fine-Tuning
icon: pen-to-square
date: 2026-05-29
category:
  - AI 概念
tag:
  - fine-tuning
  - llm
  - transfer-learning
  - sft
---

# 微调（Fine-Tuning）

微调是指在预训练模型的基础上，使用特定领域或任务的数据继续训练模型参数，使模型适应下游需求的过程。它是 [concepts/llm-training-pipeline](/posts/wiki/concepts/llm-training-pipeline.html) 中连接预训练与实际应用的关键环节。

## 全量微调 vs 参数高效微调

**全量微调（Full Fine-Tuning）** 更新模型的所有参数。效果通常最好，但显存需求极高（需要存储完整模型梯度和优化器状态），对于 70B+ 参数的大模型，实际部署成本往往不可承受。

**LoRA（Low-Rank Adaptation）** 是当前最流行的参数高效微调方法。其核心思想是冻结原始权重矩阵 $W$，仅训练低秩分解矩阵 $\Delta W = AB$（其中 $A \in \mathbb{R}^{d \times r}$，$B \in \mathbb{R}^{r \times d}$，$r \ll d$），将可训练参数量降低几个数量级。推理时将 $\Delta W$ 合并回 $W$，不增加推理延迟。

**QLoRA** 在 LoRA 基础上引入 4-bit NormalFloat 量化和分页优化器，使 65B 模型的微调可在单张 48GB GPU 上完成，大幅降低了微调的硬件门槛。

**Adapter** 在 Transformer 层中插入小型前馈模块，仅训练 Adapter 参数。虽然比 LoRA 多一些推理开销，但在多任务切换场景下更具灵活性。

## 监督微调（SFT）流程

SFT 的标准流程包括：构造高质量的指令-回复对数据集 $\rightarrow$ 选择合适的基座模型 $\rightarrow$ 配置训练超参数（学习率通常为预训练的 1/10 到 1/100）$\rightarrow$ 训练并监控验证集损失 $\rightarrow$ 评估生成质量。关键原则是**数据质量远比数量重要**——数千条精心标注的高质量样本往往优于百万条噪声数据。

## 领域适应微调

领域适应微调（Domain Adaptation Fine-Tuning）使用特定领域的专业数据（如医学文献、法律文书、金融报告）对通用模型进行微调，使模型在目标领域内表现更准确。实践中通常先进行持续预训练（Continue Pre-training）注入领域知识，再进行 SFT 对齐任务格式。

## 数据质量要求

微调数据的质量直接决定模型表现。核心要求包括：标注准确性（回复内容正确无误）、多样性（覆盖目标任务的各类场景）、格式一致性（指令和回复遵循统一模板）、以及合理的难度梯度。低质量数据不仅浪费算力，还可能导致模型能力退化。

## 相关页面

- [concepts/llm-training-pipeline](/posts/wiki/concepts/llm-training-pipeline.html)：微调在完整训练流程中的位置
- [concepts/reinforcement-learning-from-human-feedback](/posts/wiki/concepts/reinforcement-learning-from-human-feedback.html)：微调后的对齐阶段
- [concepts/prompt-engineering](/posts/wiki/concepts/prompt-engineering.html)：微调的轻量替代方案
