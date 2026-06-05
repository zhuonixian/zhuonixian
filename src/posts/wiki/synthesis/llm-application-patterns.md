---
title: LLM 应用架构模式
icon: pen-to-square
date: 2026-05-29
category:
  - 综合分析
tag:
  - synthesis
  - llm
  - application
  - patterns
  - architecture
---

# LLM 应用架构模式

从简单的聊天机器人到复杂的多智能体系统，LLM 应用的架构模式已形成相对成熟的分类。本页面梳理常见的架构模式及其适用场景。

## 单轮对话

最基本的模式：用户发送一条消息，LLM 返回一次回复。

- **适用场景**：翻译、摘要、文本改写等无状态任务
- **架构要点**：无需维护会话状态，每次请求独立处理
- **成本控制**：输入 token 即输出 token，最简单直接的成本模型

## 多轮对话

在单轮基础上维护会话上下文，LLM 能理解之前的交互历史。

- **适用场景**：客服机器人、教学助手、持续讨论
- **架构要点**：会话管理（内存或 Redis）、上下文窗口管理（超过限制时截断或摘要历史消息）、对话状态追踪
- **挑战**：长对话的 token 消耗线性增长，需要策略性地压缩或裁剪历史

## RAG 模式

[RAG](/posts/wiki/concepts/retrieval-augmented-generation.html) 通过外部知识检索增强 LLM 的回答质量：

```
用户问题 → 向量检索相关文档 → 文档 + 问题组合为 Prompt → LLM 生成回答
```

- **适用场景**：企业知识库、技术文档问答、客服系统
- **关键组件**：文档处理管线、向量数据库、检索策略、Prompt 模板
- **进阶**：多路召回 + 重排序、查询改写、迭代检索

## Agent 模式

Agent 将 LLM 从"被动回答"升级为"主动执行"：

- LLM 作为决策核心，自主选择和调用工具
- 基于 [函数调用](/posts/wiki/concepts/function-calling.html) 能力与外部系统交互
- 适用于需要多步骤推理和执行的任务

详见 [AI Agents](/posts/wiki/topics/ai-agents.html)。

## Multi-Agent 编排

多个 Agent 各司其职，协同完成复杂任务：

- **角色分工**：不同 Agent 扮演不同角色（研究员、写作者、审查者）
- **通信模式**：顺序传递、并行执行、层级汇报
- **适用场景**：复杂的内容创作、多领域分析、软件开发流水线
- **挑战**：Agent 间的上下文传递效率、错误传播和全局状态管理

## Workflow 编排（DAG）

将 LLM 调用和工具操作编排为有向无环图（DAG）：

- **适用场景**：数据处理管线、内容生成流水线、自动化审核流程
- **工具**：LangGraph（状态机编排）、Prefect / Airflow（任务调度）
- **优势**：流程可视化、可重试、可并行、易调试

## Human-in-the-Loop

在自动化流程中嵌入人工审核节点：

- LLM 完成初步处理后，关键决策交由人类确认
- 适用于高风险场景（医疗、法律、金融）
- 实现方式：异步审批队列、实时协作界面、邮件/消息通知

## 缓存策略

LLM 调用成本高、延迟大，缓存是优化的关键手段：

- **Prompt Cache（语义缓存）**：对语义相似的请求复用之前的响应。Anthropic 的 Prompt Caching 可缓存共享的前缀
- **结果缓存**：对完全相同的请求直接返回缓存结果，适合 FAQ 类场景
- **分层缓存**：精确匹配 → 语义匹配 → 重新生成，平衡准确性和成本

## 流式输出

对长文本生成场景，流式输出（Streaming）显著改善用户体验：

- 逐 token 返回，用户无需等待完整生成
- 结合"思考中"指示器和打字效果，提升感知响应速度
- 实现需使用 SSE（Server-Sent Events）或 WebSocket

## 成本优化

LLM 应用的运营成本需要持续优化：

- **模型分层**：简单任务用小模型（Haiku），复杂任务用大模型（Sonnet/Opus）
- **Prompt 精简**：减少不必要的上下文，每 token 都是成本
- **批量处理**：非实时任务使用 Batch API，成本降低 50%
- **缓存利用**：最大化 Prompt Cache 命中率

## 可观测性

生产环境的 LLM 应用需要完善的可观测性：

- **请求追踪**：记录每次 LLM 调用的输入、输出、延迟和 token 用量
- **质量监控**：抽样评估输出质量，设置异常检测阈值
- **成本追踪**：按功能模块和用户维度统计 API 调用成本
- **工具推荐**：LangSmith、Helicone、Arize Phoenix

## 相关页面

- [检索增强生成](/posts/wiki/concepts/retrieval-augmented-generation.html)：RAG 模式的技术详解
- [AI Agents](/posts/wiki/topics/ai-agents.html)：Agent 模式的核心概念
- [函数调用](/posts/wiki/concepts/function-calling.html)：LLM 调用外部工具的技术机制
