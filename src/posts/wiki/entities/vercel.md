---
title: Vercel
icon: pen-to-square
date: 2026-05-29
category:
  - 公司与人物
tag:
  - company
  - cloud
  - frontend
  - developer-tools
---

# Vercel

> 前端部署平台和 Next.js 维护方，以极致的开发者体验推动现代 Web 和 AI 应用开发。

## 简介

Vercel 由 Guillermo Rauch 于 2015 年创立（前身为 ZEIT），总部位于旧金山。作为 Next.js 框架的维护方和最大的前端部署平台，Vercel 在现代 [Web 开发](/posts/wiki/topics/web-development.html) 生态中扮演着关键角色。

## 核心产品

### 部署平台

提供零配置的前端部署服务，支持 Git 集成自动部署、Preview Deployments 和 Edge Network 全球分发。支持 Next.js、Nuxt、SvelteKit 等主流框架。

### Next.js

由 Vercel 主导开发和维护的 React 框架，是目前最流行的全栈 React 方案。核心特性包括 Server-Side Rendering（SSR）、Static Site Generation（SSG）、App Router 和 Server Actions。

### Vercel AI SDK

开源的 AI 应用开发工具包，提供统一的流式 API 接口，支持 OpenAI、Anthropic、Google 等多家模型提供商。极大简化了 AI Chat 界面和流式响应的开发。

### Edge Functions

基于 V8 isolates 的边缘计算能力，支持在 Vercel 的全球边缘节点运行服务端逻辑。冷启动时间低于 1ms，适合 AI 应用的低延迟场景。

### Serverless Functions

按需执行的服务端函数，支持 Node.js 运行时，可用于 API 路由、数据处理和 AI 推理调用。

## AI 应用开发场景

Vercel 在 AI 应用开发中的角色日益重要：

- Vercel AI SDK 统一了多模型 API 的调用方式
- Streaming 架构天然适配 LLM 的流式输出
- Edge Runtime 满足 AI 应用的低延迟需求
- [AI 编程](/posts/wiki/concepts/agentic-coding.html) 工具（如 Cursor）生成的代码往往默认使用 Vercel 部署

## 时间线

| 时间 | 事件 |
|------|------|
| 2015 | ZEIT 成立，推出 now.sh 部署平台 |
| 2016 | Next.js 开源发布 |
| 2020 | 品牌更名为 Vercel |
| 2023 | 推出 Vercel AI SDK |
| 2024 | v0.dev（AI 生成前端代码）上线 |

## 相关页面

- [topics/web-development](/posts/wiki/topics/web-development.html)
- [concepts/agentic-coding](/posts/wiki/concepts/agentic-coding.html)
- [entities/cursor](/posts/wiki/entities/cursor.html)
- [entities/openai](/posts/wiki/entities/openai.html)
