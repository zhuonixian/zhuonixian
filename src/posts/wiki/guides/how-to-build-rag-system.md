---
title: 如何构建 RAG 系统
icon: pen-to-square
date: 2026-05-29
category:
  - 实践指南
tag:
  - guide
  - rag
  - tutorial
  - vector-database
---

# 如何构建 RAG 系统

本指南从工程实践角度讲解如何构建 [RAG（检索增强生成）](/posts/wiki/concepts/retrieval-augmented-generation.html) 系统，覆盖文档处理到质量评估的完整链路。

## 文档加载和分块

文档分块（Chunking）是 RAG 效果的基础：

- **固定长度分块**：按 token 数（通常 256-1024）切分，简单但可能切断语义完整段落
- **语义分块**：按段落或章节边界切分，保持语义完整性，推荐作为首选策略
- **递归分块**：先按大单位（章节）切分，再对过长段落递归切分，兼顾粒度和完整性
- **重叠窗口**：相邻块之间保留 10-20% 的重叠内容，避免关键信息恰好在切分边界被截断

工具推荐：LangChain 的 `RecursiveCharacterTextSplitter`、LlamaIndex 的 `SentenceSplitter`。

## 嵌入模型选择

[嵌入模型](/posts/wiki/concepts/embedding.html) 将文本转化为向量表示，直接影响检索质量：

| 模型 | 特点 | 适用场景 |
|------|------|----------|
| OpenAI text-embedding-3-small | 效果好、成本低、API 调用 | 通用英文场景 |
| BGE-M3（BAAI） | 多语言支持强、可本地部署 | 中文和多语言场景 |
| Nomic Embed | 开源、长文本支持 | 注重隐私和本地部署 |
| Cohere Embed v3 | 多语言、支持不同任务类型 | 企业级应用 |

选型原则：优先在自有数据集上对比候选模型的检索召回率，而非仅看通用基准。

## 向量数据库选型

[向量数据库](/posts/wiki/concepts/vector-database.html) 负责存储和检索向量：

- **原型阶段**：Chroma（轻量、零配置）或 FAISS（Facebook 开源、纯内存）
- **生产环境**：Qdrant（Rust 实现、高性能）、Milvus（分布式、大规模数据）、Weaviate（内置混合搜索）
- **已有基础设施**：pgvector（PostgreSQL 扩展）、Elasticsearch（8.x 支持向量搜索）

选型维度：数据规模、查询延迟要求、是否需要过滤（metadata filtering）、运维复杂度。

## 检索策略

单纯的向量相似度搜索往往不够，进阶策略：

- **混合搜索（Hybrid Search）**：结合向量搜索和关键词搜索（BM25），两者互补。大多数向量数据库已内置支持
- **重排序（Reranking）**：先用向量搜索召回 Top-K（如 K=20）候选，再用 Cross-Encoder 模型精排，取 Top-N（如 N=5）
- **查询改写（Query Rewriting）**：让 LLM 将用户原始问题改写为更适合检索的形式，或拆解为多个子查询
- **Parent-Child 检索**：对小块做检索，返回所属的大块原文，兼顾检索精度和上下文完整性

## Prompt 模板设计

检索到的文档需要通过 Prompt 注入到 LLM 的上下文中：

```
你是一个知识助手。请根据以下参考资料回答用户的问题。
如果参考资料中没有相关信息，请明确说明"根据现有资料无法回答"。

参考资料：
{retrieved_documents}

用户问题：{user_query}
```

关键原则：明确告诉 LLM 可以使用和不可以使用的信息范围，设置"不知道"的兜底行为。

## 评估 RAG 质量

量化评估是持续优化的基础：

- **检索准确率**：Recall@K（前 K 个结果是否包含正确答案）、MRR（正确答案的平均排名）
- **回答质量**：使用 RAGAS 框架评估 Faithfulness（忠实度）、Answer Relevancy（相关性）、Context Precision（上下文精确度）
- **端到端测试**：构建问答测试集（50-100 对），对比人工标注的期望答案

## 常见陷阱

- **分块过小**：丢失上下文，模型无法理解完整语义。块大小不要低于 200 token
- **忽略元数据**：文档来源、时间、类别等元数据可大幅提升检索精度
- **不处理表格和图片**：纯文本提取会丢失结构化信息，需要特殊处理
- **一次检索解决所有问题**：复杂问题需要多轮检索或迭代检索

## 相关页面

- [检索增强生成](/posts/wiki/concepts/retrieval-augmented-generation.html)：RAG 技术的概念解析
- [向量数据库](/posts/wiki/concepts/vector-database.html)：向量存储和检索技术详解
- [嵌入](/posts/wiki/concepts/embedding.html)：文本向量化的原理和方法
