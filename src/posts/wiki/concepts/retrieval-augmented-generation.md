---
title: 检索增强生成（RAG）
icon: pen-to-square
date: 2026-05-29
category:
  - AI 概念
tag:
  - rag
  - retrieval
  - llm
  - knowledge-base
---

# 检索增强生成（RAG）

RAG（Retrieval-Augmented Generation）是一种将外部知识检索与 LLM 生成能力相结合的技术范式。它通过在推理时动态检索相关文档，将检索结果注入 prompt 上下文，从而让模型在不修改参数的情况下获取最新、特定的知识。

## 基本原理

RAG 的工作流程分为两个核心阶段：

1. **检索（Retrieval）**：用户查询经过 **embedding** 模型编码为向量，在**向量数据库**（如 Pinecone、Milvus、Weaviate）中进行**语义搜索**，找到最相关的文档片段。语义搜索相比关键词匹配能更好地理解查询意图。
2. **生成（Generation）**：检索到的文档片段作为上下文，与用户查询一起送入 LLM，由模型基于这些上下文生成回答。

这种"检索 + 生成"的架构使 RAG 能够处理模型训练数据中未涵盖的最新信息，同时减少幻觉（hallucination）问题。

## 核心组件

- **Embedding 模型**：将文本转换为稠密向量表示，如 OpenAI text-embedding-3、BGE 系列
- **向量数据库**：存储和高效检索 embedding 向量，支持近似最近邻（ANN）搜索
- **Chunking 策略**：将长文档切分为合适大小的片段，直接影响检索质量
- **Reranking**：对初步检索结果进行二次排序，提升相关性

## RAG 的局限性

尽管 RAG 在实践中被广泛采用，但它存在根本性的局限：

- **无知识积累**：每次查询都需要重新检索和发现知识，系统不会从历史交互中学习和记忆
- **上下文窗口瓶颈**：检索到的内容受限于模型的上下文长度，难以处理大量文档
- **检索质量依赖**：回答质量高度依赖检索的准确性，错误的检索会直接导致错误的回答
- **缺乏深层推理**：RAG 本质上是"找到相关片段再总结"，无法对知识进行深层整合和推理

## 与 Compiled Wiki 的对比

RAG 和 Compiled Wiki 代表了两种不同的知识管理哲学。RAG 是"按需检索"模式，而 Compiled Wiki 是"预先编译"模式，将知识系统地组织并嵌入到模型的理解中。详见 [comparisons/rag-vs-compiled-wiki](/posts/wiki/comparisons/rag-vs-compiled-wiki.html)。

## 应用场景

RAG 目前广泛应用于企业知识库问答、客户支持自动化、法律文档检索、医疗辅助诊断等需要结合最新外部知识的场景。[concepts/prompt-engineering](/posts/wiki/concepts/prompt-engineering.html) 中的技巧对于优化 RAG 的 prompt 构造至关重要。

## 相关主题

- [comparisons/rag-vs-compiled-wiki](/posts/wiki/comparisons/rag-vs-compiled-wiki.html)：RAG 与 Compiled Wiki 的详细对比
- [concepts/prompt-engineering](/posts/wiki/concepts/prompt-engineering.html)：优化 RAG prompt 的技巧
- [topics/knowledge-management](/posts/wiki/topics/knowledge-management.html)：更广泛的知识管理讨论
