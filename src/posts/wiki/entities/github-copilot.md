---
title: GitHub Copilot
icon: pen-to-square
date: 2026-05-29
category:
  - 公司与人物
tag:
  - product
  - ai-coding
  - github
  - developer-tools
---

# GitHub Copilot

> 由 GitHub 和 OpenAI 联合开发的 AI 编程助手，开创了 AI 辅助编码的产品品类。

## 简介

GitHub Copilot 于 2021 年推出，是最早面向大众的 AI 编程助手。它通过分析代码上下文，实时提供代码补全和建议，标志着 [AI 编程](/posts/wiki/concepts/agentic-coding.html) 时代的开启。由 GitHub 与 [OpenAI](/posts/wiki/entities/openai.html) 合作开发，底层基于 OpenAI 的 Codex 模型。

## 核心功能演进

### 代码补全

初始版本即支持基于上下文的单行和多行代码补全。编辑器内以灰色虚线形式展示建议，按 Tab 键即可采纳。

### Copilot Chat（2023）

在编辑器内集成对话式 AI 助手，支持自然语言提问、代码解释、Bug 修复建议和单元测试生成。支持 VS Code 和 JetBrains 系列 IDE。

### Copilot Workspace（2024）

从 Issue 到 PR 的全流程 AI 辅助工具，能够自动分析 Issue、规划方案、编写代码并创建 Pull Request。

### Agent 模式（2025）

引入 [Agent](/posts/wiki/concepts/agentic-coding.html) 能力，Copilot 可以自主执行多步骤编码任务，包括读取代码库、规划修改、编写和测试代码。

## 工作原理

Copilot 的核心流程：采集编辑器上下文（当前文件、打开的标签页、项目结构）→ 构造 Prompt → 调用 LLM → 返回建议。后续版本引入了 RAG 机制，能检索代码库中的相关片段。

## 影响力

- GitHub 报告 Copilot 用户编码速度提升约 55%
- 推动了"AI-first"编程理念的普及
- 催生了 Cursor、Codeium 等竞品

## 定价

| 套餐 | 月费 | 功能 |
|------|------|------|
| Free | $0 | 基础补全，有限 Chat |
| Pro | $10/月 | 无限补全和 Chat，Agent 模式 |
| Business | $19/月 | 组织管理，策略控制 |
| Enterprise | $39/月 | 私有化索引，SSO |

## 相关页面

- [concepts/agentic-coding](/posts/wiki/concepts/agentic-coding.html)
- [entities/openai](/posts/wiki/entities/openai.html)
- [entities/cursor](/posts/wiki/entities/cursor.html)
- [comparisons/vscode-vs-cursor-vs-windsurf](/posts/wiki/comparisons/vscode-vs-cursor-vs-windsurf.html)
