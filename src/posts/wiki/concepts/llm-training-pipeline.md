---
title: LLM 训练流程
icon: pen-to-square
date: 2026-05-29
category:
  - AI 概念
tag:
  - llm
  - training
  - deep-learning
---

# LLM 训练流程

LLM（Large Language Model）的训练流程是一个多阶段的系统工程，从原始数据到最终可用的模型，通常需要经历预训练、微调和对齐等关键阶段。理解这一流程对于把握 LLM 的能力边界和局限性至关重要。

## 预训练（Pre-training）

预训练是 LLM 训练的第一阶段，也是最耗费计算资源的阶段。模型在大规模语料（通常为 TB 级别的文本数据，涵盖网页、书籍、代码等）上进行自监督学习，核心目标是 **next-token prediction**——给定前文，预测下一个 token 的概率分布。这一过程使模型习得语言的统计规律、世界知识以及推理能力的雏形。代表性的预训练框架包括 Decoder-only Transformer（如 GPT 系列）和 Encoder-Decoder 架构（如 T5）。

## 监督微调（Supervised Fine-Tuning, SFT）

预训练后的模型虽然具备丰富的语言知识，但并不天然善于遵循指令。SFT 阶段通过高质量的指令-回复对数据，教会模型以对话的方式响应用户请求。数据质量远比数量重要——数千条精心标注的样本往往比百万条低质量数据更有效。这一阶段也被称为"指令微调"（Instruction Tuning）。

## 人类反馈强化学习（RLHF）

RLHF 是当前主流的对齐方法。其流程分为两步：首先训练一个**奖励模型**（Reward Model），该模型学习人类对回复质量的偏好判断；然后使用 **PPO**（Proximal Policy Optimization）等强化学习算法，根据奖励模型的反馈优化语言模型的输出策略。RLHF 显著提升了模型的有用性（helpfulness）和无害性（harmlessness）。[entities/anthropic](/posts/wiki/entities/anthropic.html) 在这一领域做出了开创性贡献。

## 直接偏好优化（DPO）

DPO（Direct Preference Optimization）是 RLHF 的简化替代方案。它跳过奖励模型的训练步骤，直接利用人类偏好数据（preferred vs. dispreferred 回复对）通过简单的分类损失函数来优化策略模型。DPO 在工程实现上更简洁，训练稳定性更好，近年来被广泛采用。

## 后训练（Post-training）

Post-training 是模型发布前的最后阶段，涵盖多个维度的优化：**安全对齐**（确保模型拒绝有害请求）、**能力增强**（如代码生成、数学推理的专项提升）、**红队测试**（Red Teaming）以及**安全 guardrails** 的部署。这一阶段决定了模型的最终用户体验和安全水平。

## 相关概念

- [concepts/prompt-engineering](/posts/wiki/concepts/prompt-engineering.html)：理解训练流程有助于更好地设计 prompt
- [entities/anthropic](/posts/wiki/entities/anthropic.html)：在 RLHF 和安全对齐领域的重要贡献者
