---
title: AI Agents
icon: pen-to-square
date: 2026-05-29
category:
  - 技术领域
tag:
  - ai-agents
  - llm
  - automation
  - tools
---

# AI Agents

## 定义

AI Agent（智能体）是以大语言模型（LLM）作为推理引擎，结合工具调用能力和自主决策机制，能够完成复杂任务的软件系统。与传统聊天机器人不同，AI Agent 不仅回答问题，还能主动规划步骤、调用外部工具、根据反馈调整策略，最终达成目标。

Andrej Karpathy 将当前阶段概括为 "vibe coding" 时代——人类提供意图，AI Agent 负责执行。这一范式的核心正是 Agent 架构。

## 核心组件

一个典型的 AI Agent 系统包含四个关键模块：

- **规划（Planning）**：将复杂目标拆解为可执行的子任务序列。常见策略包括 Chain-of-Thought、Tree-of-Thought 和 LATS（Language Agent Tree Search）。
- **记忆（Memory）**：分为短期记忆（上下文窗口内的对话历史）和长期记忆（向量数据库、知识库等持久化存储）。记忆机制使 Agent 能够在多轮交互中保持连贯性。
- **工具（Tools）**：Agent 通过 Function Calling 调用外部工具——搜索引擎、代码执行器、文件系统、API 接口等。工具扩展了 LLM 的能力边界，使其不再局限于文本生成。
- **行动（Action）**：将规划结果转化为具体操作，执行后收集反馈，驱动下一轮决策循环。

## ReAct 模式

ReAct（Reasoning + Acting）是目前最主流的 Agent 模式。其核心思想是让 LLM 交替进行推理（Thought）和行动（Action），并通过观察（Observation）结果来指导下一步。这种 Thought-Action-Observation 循环使 Agent 能够在不确定环境中渐进式地解决问题。

## Multi-Agent 系统

随着任务复杂度增加，单一 Agent 难以应对所有场景。Multi-Agent 系统通过角色分工协作解决这一问题——例如一个 Agent 负责代码编写，另一个负责审查，第三个负责测试。CrewAI、AutoGen、LangGraph 等框架为 Multi-Agent 编排提供了基础设施。

## MCP（Model Context Protocol）

Anthropic 提出的 MCP 是一种开放协议，标准化了 LLM 应用与外部数据源和工具之间的连接方式。MCP 使 Agent 能够以统一接口访问文件系统、数据库、API 等资源，大幅降低了工具集成的开发成本。

## 实际应用

- **代码 Agent**：[Claude Code](/posts/wiki/entities/claude.html)、Cursor、Copilot 等，能够理解代码库上下文并自主编写、调试、重构代码。
- **研究 Agent**：自动搜索文献、总结论文、生成研究报告，如 Perplexity 的 Deep Research 功能。
- **自动化工作流**：结合 Zapier、n8n 等平台，Agent 可以编排跨系统的业务流程。

AI Agent 正从实验室走向生产环境，其能力边界仍在快速扩展中。

## 相关页面

- [Prompt Engineering](/posts/wiki/concepts/prompt-engineering.html)：Agent 的推理质量高度依赖 Prompt 设计
- [Claude](/posts/wiki/entities/claude.html)：Anthropic 的旗舰模型，在 Agent 场景中表现突出
- [MCP](/posts/wiki/concepts/model-context-protocol.html)：Agent 工具调用的标准化协议基础设施
