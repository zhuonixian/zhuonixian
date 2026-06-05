---
title: Cursor
icon: pen-to-square
date: 2026-05-29
category:
  - 公司与人物
tag:
  - product
  - ai-coding
  - ide
  - developer-tools
---

# Cursor

> AI 原生 IDE，以深度 LLM 集成重新定义开发者与代码的交互方式。

## 简介

Cursor 由 Anysphere 公司开发，于 2023 年发布。它基于 VS Code 的 fork 构建，但在架构层面深度集成了 AI 能力，而非以插件形式附加。Cursor 是 [AI 编程](/posts/wiki/concepts/agentic-coding.html) 工具浪潮中的代表性产品。

## 核心功能

### Tab 补全

基于编辑器上下文的智能代码补全，支持多行补全和跨文件推断。相比传统补全，能理解代码意图而非仅做模式匹配。

### Cmd+K（Inline Edit）

选中代码后通过自然语言指令直接修改，AI 在行内生成 diff 预览，开发者确认后应用。这是 Cursor 最具标志性的交互模式。

### Chat

侧边栏对话界面，支持引用代码库中的文件、符号和文档作为上下文。可以用 `@` 符号注入特定文件或文档。

### Composer / Agent

多文件编辑的 Agent 模式，能自主规划和执行跨文件的代码修改任务。支持自动读取相关文件、生成修改方案并应用。

### Cursor Rules

通过 `.cursorrules` 文件定义项目级别的 AI 行为规则，如编码风格、架构约束、命名规范等。这是 Cursor 在 [IDE 对比](/posts/wiki/comparisons/vscode-vs-cursor-vs-windsurf.html) 中的差异化特性。

## 与 Copilot 的差异化

| 特性 | Cursor | GitHub Copilot |
|------|--------|----------------|
| 产品形态 | 独立 IDE | VS Code 插件 |
| AI 集成深度 | 架构级 | 插件级 |
| 多文件编辑 | Composer | Workspace |
| 项目规则 | .cursorrules | 无原生支持 |
| 模型选择 | 多模型可选 | OpenAI 模型 |

## 定价

| 套餐 | 月费 | 说明 |
|------|------|------|
| Free | $0 | 基础功能，有限请求 |
| Pro | $20/月 | 无限补全，高级模型 |
| Business | $40/月 | 团队管理，隐私模式 |

## 相关页面

- [concepts/agentic-coding](/posts/wiki/concepts/agentic-coding.html)
- [comparisons/vscode-vs-cursor-vs-windsurf](/posts/wiki/comparisons/vscode-vs-cursor-vs-windsurf.html)
- [entities/github-copilot](/posts/wiki/entities/github-copilot.html)
- [topics/web-development](/posts/wiki/topics/web-development.html)
