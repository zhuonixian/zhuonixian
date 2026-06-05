---
title: Model Context Protocol (MCP)
icon: pen-to-square
date: 2026-05-29
category:
  - AI 概念
tag:
  - mcp
  - protocol
  - llm
  - tools
  - anthropic
---

# Model Context Protocol (MCP)

> Anthropic 推出的开放协议，标准化 LLM 应用与外部工具/数据源的通信方式。

## 概述

MCP（Model Context Protocol）是一个开放标准，解决了 LLM 应用与外部系统集成的碎片化问题。在 MCP 之前，每个 AI 工具的集成都需要定制开发；MCP 提供统一协议，一次开发即可在任何兼容的 AI 应用中使用。

## 架构

MCP 采用客户端-服务器架构：

- **MCP Host** — 发起连接的 LLM 应用（如 Claude Desktop、IDE 插件）
- **MCP Client** — 与服务器维持一对一连接的协议客户端
- **MCP Server** — 提供具体能力的轻量级服务

## 三种原语

| 原语 | 用途 | 示例 |
|------|------|------|
| **Tools** | LLM 可调用的函数 | 执行代码、查询数据库、搜索文件 |
| **Resources** | LLM 可读取的数据 | 文件内容、数据库记录、API 响应 |
| **Prompts** | 预定义的提示模板 | 可接受参数，动态生成系统提示 |

## 传输方式

- **stdio** — 标准输入输出，适用于本地进程间通信
- **SSE** — Server-Sent Events，适用于远程服务连接

## 生态

目前已有数百个社区开发的 MCP Server，涵盖文件系统、GitHub 操作、数据库查询、浏览器自动化等场景。

## 相关页面

- [Anthropic](/posts/wiki/entities/anthropic.html) — MCP 协议的提出者
- [Claude](/posts/wiki/entities/claude.html) — 首批支持 MCP 的 AI 应用
- [AI Agents](/posts/wiki/topics/ai-agents.html) — MCP 是 Agent 工具调用的基础设施
- [Prompt Engineering](/posts/wiki/concepts/prompt-engineering.html) — MCP Prompts 原语与提示工程相关

## 待补充

- [ ] MCP 协议的具体消息格式
- [ ] MCP Server 开发教程
- [ ] 与 Function Calling 的对比
