---
title: 提示工程（Prompt Engineering）
icon: pen-to-square
date: 2026-05-29
category:
  - AI 概念
tag:
  - prompt-engineering
  - llm
  - nlp
---

# 提示工程（Prompt Engineering）

提示工程是与大语言模型交互的核心技能，指通过精心设计输入文本（prompt）来引导模型产生期望输出的技术与方法。在模型能力既定的情况下，prompt 的设计质量直接决定了输出效果的优劣。理解 [concepts/llm-training-pipeline](/posts/wiki/concepts/llm-training-pipeline.html) 中的训练机制，有助于更有效地设计 prompt。

## 基本概念

LLM 本质上是文本补全引擎——它根据输入上下文预测最可能的后续 token。提示工程的核心在于：**如何构造这个上下文，使模型的预测方向与用户意图高度对齐**。优秀的 prompt 不仅是"提问题"，更是为模型设定清晰的任务框架、输出格式和约束条件。

## 常用技巧

### Zero-shot Prompting

直接给出任务描述，不提供示例。适用于模型已经具备相关能力的简单任务。

### Few-shot Prompting

在 prompt 中提供若干输入-输出示例，让模型通过上下文学习（in-context learning）理解任务模式。示例的选择和顺序会显著影响输出质量。

### Chain-of-Thought（CoT）

要求模型展示推理过程，而非直接给出答案。经典表述为 "Let's think step by step"。CoT 特别适用于数学推理、逻辑推导等需要多步思考的任务。其变体包括 Self-Consistency（多次采样取多数）和 Tree-of-Thought（探索多条推理路径）。

### ReAct

结合推理（Reasoning）和行动（Acting），让模型交替进行思考和工具调用。模型先分析问题，再决定使用什么工具获取信息，最后基于工具返回的结果继续推理。这一范式是 AI Agent 系统的基础。

## 系统提示（System Prompt）设计

System Prompt 是设定模型行为的高级指令，通常用于定义角色、设定约束和规定输出格式。好的系统提示应包含：角色定义、任务描述、输出格式要求、边界条件和安全约束。[entities/claude](/posts/wiki/entities/claude.html) 在系统提示的遵循能力上表现优异。

## 结构化输出

- **JSON Mode**：强制模型输出合法的 JSON 格式，便于程序化处理
- **Function Calling**：定义函数签名，让模型生成结构化的函数调用参数
- **XML/Markdown 格式化**：通过格式标签引导模型输出结构化内容

## 最佳实践

1. **明确具体**：避免模糊表述，提供充分的上下文和约束
2. **迭代优化**：从简单 prompt 开始，根据输出逐步调整
3. **角色设定**：为模型赋予专业角色（如"你是一位资深数据科学家"）
4. **输出约束**：明确指定输出长度、格式和范围
5. **负面指令**：告诉模型"不要做什么"和"要做什么"同样重要

## 常见陷阱

- **Prompt 注入**：用户输入中包含恶意指令，试图覆盖系统提示
- **过度依赖技巧**：复杂的 prompt 技巧不如清晰的任务描述
- **忽视版本差异**：不同模型对同一 prompt 的响应可能差异很大
- **缺乏评估**：没有系统化评估 prompt 效果的变化

## 相关概念

- [concepts/llm-training-pipeline](/posts/wiki/concepts/llm-training-pipeline.html)：理解模型训练有助于设计更有效的 prompt
- [entities/claude](/posts/wiki/entities/claude.html)：在 prompt 遵循方面表现突出的 AI 助手
