---
title: Agentic Coding
icon: pen-to-square
date: 2026-05-29
category:
  - AI 概念
tag:
  - agentic-coding
  - ai-coding
  - developer-tools
  - automation
---

# Agentic Coding

Agentic Coding（智能体编程）是指 AI Agent 在人类指导下自主完成编码任务的新范式。它超越了传统的代码补全，使 AI 能够理解需求、规划方案、编写代码、运行测试并进行迭代修改。Agentic Coding 是 [topics/ai-agents](/posts/wiki/topics/ai-agents.html) 在软件开发领域的具体落地。

## 从代码补全到自主编程

AI 辅助编程经历了三个阶段：**代码补全**（Copilot 式的行级建议）$\rightarrow$ **对话式编程**（Chat 模式，人类描述需求、AI 生成代码片段）$\rightarrow$ **Agentic Coding**（AI 拥有文件系统读写、终端执行、代码搜索等工具权限，在人类监督下自主完成多文件、多步骤的编码任务）。关键跃迁在于 Agent 获得了"动手能力"——不再只是建议，而是直接操作代码库。

## 核心工作流

典型的 Agentic Coding 工作流包括五个阶段：**理解需求**（读取相关代码、文档、项目结构）$\rightarrow$ **规划方案**（分析修改范围、确定实施步骤）$\rightarrow$ **编码实现**（跨多文件编写和修改代码）$\rightarrow$ **测试验证**（运行测试套件、检查编译错误）$\rightarrow$ **迭代修正**（根据测试结果或人类反馈调整代码）。每个阶段 Agent 都可以利用 [concepts/function-calling](/posts/wiki/concepts/function-calling.html) 调用工具获取信息或执行操作。

## 主要工具

- **Claude Code**：[entities/claude](/posts/wiki/entities/claude.html) 的命令行 Agent，具备文件读写、终端执行、Git 操作和代码搜索能力，支持复杂的跨文件重构任务
- **Cursor**：AI-native IDE，集成了代码理解、多文件编辑和终端操作，提供 Agent 模式和 Chat 模式
- **GitHub Copilot**：从代码补全进化到 Workspace 级别的任务规划和执行
- **Devin**：Cognition 推出的全自主 AI 软件工程师，能独立完成完整的开发任务

## 对软件开发的影响

Agentic Coding 正在改变开发者的工作方式：从逐行编写代码转向审查和指导 AI 的输出。开发者需要培养新技能——精确描述需求、有效审查 AI 生成的代码、设计适合 Agent 理解的项目结构。它也推动了项目规范文件（如本项目的 CLAUDE.md）的流行，这些文件帮助 AI 快速理解项目上下文和约束。

## 局限与挑战

当前 Agentic Coding 仍有明确局限：对复杂架构决策的判断力不足、长链条任务中容易累积错误、对隐含业务逻辑的理解有限。最佳实践是让 Agent 处理定义明确、边界清晰的任务，而将架构设计和关键决策留给人类。

## 相关页面

- [topics/ai-agents](/posts/wiki/topics/ai-agents.html)：Agentic Coding 的理论基础
- [entities/claude](/posts/wiki/entities/claude.html)：Claude Code 是 Agentic Coding 的代表性工具
- [concepts/prompt-engineering](/posts/wiki/concepts/prompt-engineering.html)：有效指导 Agent 的 prompt 技巧
