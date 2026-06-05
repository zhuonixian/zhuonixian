---
title: Function Calling
icon: pen-to-square
date: 2026-05-29
category:
  - AI 概念
tag:
  - function-calling
  - tools
  - llm
  - api
---

# Function Calling

Function Calling（函数调用）是指 LLM 根据用户请求，输出结构化的工具调用请求（而非纯文本回复）的能力。它使 LLM 能够与外部系统交互——执行搜索、查询数据库、调用 API——从而突破模型自身知识和能力的边界。

## 工作原理

开发者通过 JSON Schema 描述可用函数的名称、参数和语义，连同用户消息一起发送给模型。模型分析用户意图后，可以选择生成一个结构化的函数调用请求（包含函数名和参数），而非直接生成文本回复。客户端执行实际函数调用后，将结果返回给模型，模型再基于结果生成最终回复。

## 与 MCP 的关系

[concepts/model-context-protocol](/posts/wiki/concepts/model-context-protocol.html)（MCP）是 Function Calling 的标准化协议层。MCP 定义了模型与工具之间的统一通信标准，使工具可以跨不同 LLM 提供商复用。MCP 的设计理念是：任何符合 MCP 规范的工具服务器，都可以被任何支持 MCP 的 LLM 客户端使用，避免了工具集成为每个模型重复开发的问题。

## 并行调用与流式调用

**并行调用**（Parallel Function Calling）允许模型在单次推理中生成多个独立的函数调用请求，例如同时查询天气和航班信息。这减少了多轮交互的延迟，对需要聚合多个数据源的场景尤为重要。

**流式调用**（Streaming Function Calling）在模型生成长参数（如搜索查询字符串）时，以流式方式输出部分结果，降低用户感知的首字延迟。

## 实际应用场景

- **信息检索**：调用搜索引擎获取实时信息，弥补训练数据的时间滞后
- **数据库查询**：将自然语言转换为 SQL 查询并执行
- **代码执行**：运行 Python 代码进行数值计算或数据处理
- **API 集成**：操作日历、发送邮件、管理文件等第三方服务
- **多模态处理**：调用图像生成或语音合成服务

Function Calling 与 [concepts/prompt-engineering](/posts/wiki/concepts/prompt-engineering.html) 深度结合——prompt 中对工具的描述质量直接影响模型选择和使用工具的准确性。

## 相关页面

- [concepts/model-context-protocol](/posts/wiki/concepts/model-context-protocol.html)：Function Calling 的标准化协议
- [concepts/prompt-engineering](/posts/wiki/concepts/prompt-engineering.html)：工具描述的 prompt 设计
- [topics/ai-agents](/posts/wiki/topics/ai-agents.html)：Function Calling 是 AI Agent 的核心能力
