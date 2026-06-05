---
title: Chain-of-Thought
icon: pen-to-square
date: 2026-05-29
category:
  - AI 概念
tag:
  - cot
  - reasoning
  - prompt-engineering
  - llm
---

# Chain-of-Thought 推理

Chain-of-Thought（CoT，思维链）是一种通过引导 LLM 逐步展开中间推理步骤来提升复杂任务表现的 [concepts/prompt-engineering](/posts/wiki/concepts/prompt-engineering.html) 技术。其核心观察是：当模型被要求"展示推理过程"而非直接给出答案时，在数学、逻辑和多步推理任务上的准确率显著提升。

## Zero-shot CoT

Kojima 等人发现，仅需在提示末尾添加 "Let's think step by step"，就能在无示例的情况下激活模型的推理能力。这种 Zero-shot CoT 方法无需构造复杂的示例，使用成本极低，适用于快速验证推理任务。其效果在不同模型上差异较大，通常在较大参数量（100B+）的模型上表现更稳定。

## Few-shot CoT

Few-shot CoT 在提示中提供几个包含完整推理过程的示例，让模型学习输出格式和推理风格。示例的质量和相关性至关重要——好的示例应涵盖不同的推理模式（如分解、类比、验证），并且推理步骤应清晰无跳跃。研究表明，即便示例中的推理过程包含错误，只要格式正确，模型仍能从中受益。

## Tree of Thought

Tree of Thought（ToT）将 CoT 的线性推理扩展为树状搜索结构。模型在每一步生成多个候选思路，通过评估函数选择最有前景的分支继续探索，支持回溯和剪枝。ToT 在需要探索和试错的规划类任务（如 24 点游戏、创意写作）中表现出色，但计算成本显著高于线性 CoT。

## 在数学推理和代码生成中的效果

CoT 在数学推理（GSM8K、MATH）上的提升最为显著，准确率可提高 2-5 倍。在代码生成中，CoT 等价于让模型先写伪代码或算法描述再实现，显著减少了逻辑错误。值得注意的是，CoT 的效果与模型规模正相关——小模型可能出现"看似合理实则错误"的推理链，需要结合验证机制使用。

## 与其他推理策略的对比

与直接回答相比，CoT 通过增加计算量换取推理深度。与 [concepts/function-calling](/posts/wiki/concepts/function-calling.html) 结合时，模型可以调用外部工具（如计算器、代码解释器）来验证中间步骤，进一步提升可靠性。Self-Consistency 方法通过对同一问题生成多条推理链并投票选择最常见答案，在 CoT 基础上进一步提升鲁棒性。

## 相关页面

- [concepts/prompt-engineering](/posts/wiki/concepts/prompt-engineering.html)：CoT 是提示工程的核心技术之一
- [concepts/function-calling](/posts/wiki/concepts/function-calling.html)：外部工具调用可辅助验证推理步骤
- [concepts/llm-training-pipeline](/posts/wiki/concepts/llm-training-pipeline.html)：训练流程中对推理能力的培养
