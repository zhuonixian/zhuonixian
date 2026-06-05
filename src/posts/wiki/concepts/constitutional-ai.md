---
title: Constitutional AI
icon: pen-to-square
date: 2026-05-29
category:
  - AI 概念
tag:
  - constitutional-ai
  - alignment
  - safety
  - anthropic
---

# Constitutional AI

Constitutional AI（CAI，宪法 AI）是由 [entities/anthropic](/posts/wiki/entities/anthropic.html) 提出的一种 AI 对齐方法。其核心思想是让 AI 系统遵循一组明确的"宪法原则"（Constitutional Principles）来指导自身行为，通过 AI 反馈代替人类反馈来实现规模化对齐，是 Anthropic 安全方法论的核心组成部分。

## 动机

传统的 RLHF（基于人类反馈的强化学习）依赖大量人类标注者对模型输出进行偏好评判。这一方式面临三个瓶颈：人类标注成本高昂且难以规模化；标注者对有害内容的判断标准不一致；更根本的问题——当模型变得比人类更擅长生成看似合理的回答时，人类是否还能提供可靠的监督？CAI 正是为了解决这些问题而提出的。

## 两阶段训练过程

**阶段一：监督学习（SL）**。给定一个可能产生有害输出的提示，模型首先生成一个初始回复（可能包含有害内容），然后被要求根据宪法原则对该回复进行**批评**（Critique），指出其中的问题，最后生成一个**修订版本**（Revision）。整个过程由模型自身完成，生成的修订回复作为 SFT 训练数据。

**阶段二：强化学习（RL）**。使用阶段一训练的 SFT 模型，对同一提示生成两个回复，让另一个 AI 模型（而非人类）根据宪法原则评判哪个更好。这些 AI 偏好数据用于训练奖励模型，再通过 PPO 进行策略优化。整个过程完全不需要人类标注。

## RLAIF vs RLHF

CAI 的核心创新是用 AI 反馈（RLAIF, Reinforcement Learning from AI Feedback）替代人类反馈（RLHF）。RLAIF 的优势在于：可无限生成训练数据，成本远低于人类标注；评判标准由宪法原则统一定义，一致性强；可以设计针对特定安全问题的宪法原则。RLAIF 并非要完全取代 RLHF，实践中两者常结合使用。

## 宪法原则

宪法原则是一组自然语言指令，定义了模型应遵循的行为准则。典型的原则包括："选择最无害且最有帮助的回复"、"不要协助非法活动"、"尊重个人隐私"等。Anthropic 的 Claude 模型基于一组精炼的原则进行对齐，这些原则本身也随着研究和反馈不断迭代。

## 与其他对齐方法的对比

相比 InstructGPT 风格的 RLHF，CAI 更强调**可扩展性**和**透明性**——对齐标准以明确文本形式存在，而非隐含在人类标注数据中。相比红队测试（Red Teaming），CAI 是系统性的训练方法而非评估手段。CAI 与 [concepts/llm-training-pipeline](/posts/wiki/concepts/llm-training-pipeline.html) 中的 RLHF 阶段紧密衔接，是对对齐方法论的进一步发展。

## 相关页面

- [entities/anthropic](/posts/wiki/entities/anthropic.html)：Constitutional AI 的提出者和践行者
- [concepts/llm-training-pipeline](/posts/wiki/concepts/llm-training-pipeline.html)：CAI 在训练流程中的位置
- [concepts/prompt-engineering](/posts/wiki/concepts/prompt-engineering.html)：宪法原则本质上是一种结构化的 prompt
