---
title: Claude
icon: pen-to-square
date: 2026-05-29
category:
  - 公司与人物
tag:
  - product
  - llm
  - ai-assistant
---

# Claude

Claude 是由 [entities/anthropic](/posts/wiki/entities/anthropic.html) 开发的大语言模型 AI 助手系列，以安全性、有用性和诚实性为设计原则。Claude 系列模型在长上下文理解、代码生成、多模态处理等方面具有行业领先的能力。

## 简介

Claude 的命名灵感来源于信息论之父 Claude Shannon，象征着对语言理解和信息处理的追求。作为 Anthropic 的核心产品，Claude 体现了公司在 AI 安全领域的深厚积累——通过 Constitutional AI 方法，Claude 在保持高能力的同时展现出业界领先的安全性和可控性。

## 模型系列

Claude 采用分层模型架构，为不同场景提供差异化能力：

- **Opus**：旗舰模型，具备最强的推理能力和创造力，适合复杂分析、研究和创作任务
- **Sonnet**：平衡性能与成本的中端模型，适合日常工作和生产环境部署
- **Haiku**：轻量快速模型，响应延迟极低，适合实时交互和大规模部署场景

每一代模型都在能力、速度和安全性上持续迭代提升。

## 核心能力

### 长上下文理解

Claude 支持高达 200K tokens 的上下文窗口，能够处理整本书籍、大型代码库和长篇文档。在长上下文的"大海捞针"测试中表现出色，能准确定位和理解超长文本中的信息。

### 工具使用与 Function Calling

Claude 具备强大的工具调用能力，能够与外部 API、数据库和服务集成。开发者可以定义工具 schema，Claude 会根据用户需求智能选择和调用合适的工具，构建复杂的自动化工作流。

### 多模态能力

Claude 支持图像理解，能够分析图表、文档截图、UI 设计等视觉内容，并结合文本进行综合推理。这一能力在文档分析、数据解读等场景中尤为实用。

### 代码生成

Claude 在代码生成、调试和代码审查方面表现卓越。它精通主流编程语言，能够理解复杂代码库的架构，提供准确的重构建议和 bug 修复方案。

## Claude Code

Claude Code 是 Anthropic 推出的命令行工具，将 Claude 的能力直接集成到开发者的终端环境中。它能够理解项目上下文、读写文件、执行命令，作为 AI 结对编程助手协助软件开发全流程。Claude Code 支持与 Git、测试框架和 CI/CD 系统的深度集成。

## Constitutional AI

Claude 的安全对齐基于 [entities/anthropic](/posts/wiki/entities/anthropic.html) 提出的 Constitutional AI 方法。与传统的 RLHF 不同，Constitutional AI 引入了一组显式的原则来指导模型行为：

1. 模型首先生成对潜在有害请求的回复
2. 根据宪法原则对回复进行自我批评
3. 修改回复以符合原则要求
4. 通过这一过程训练模型内化安全行为

这一方法使 Claude 能够在减少有害输出的同时保持有用性，避免了过度拒绝（over-refusal）的问题。

## 与提示工程的关系

Claude 对 [concepts/prompt-engineering](/posts/wiki/concepts/prompt-engineering.html) 的响应具有高度一致性和可预测性。它擅长遵循复杂的系统提示指令，在结构化输出、JSON 格式化、角色扮演等场景中表现稳定。这使得 Claude 成为 prompt engineering 实践和实验的理想平台。

## 相关概念

- [entities/anthropic](/posts/wiki/entities/anthropic.html)：Claude 的开发公司
- [concepts/prompt-engineering](/posts/wiki/concepts/prompt-engineering.html)：优化与 Claude 交互的提示工程技巧
