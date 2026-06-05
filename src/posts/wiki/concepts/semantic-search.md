---
title: Semantic Search
icon: pen-to-square
date: 2026-05-29
category:
  - AI 概念
tag:
  - semantic-search
  - information-retrieval
  - embedding
  - nlp
---

# 语义搜索

语义搜索（Semantic Search）是一种基于语义理解而非关键词匹配的信息检索方式。它通过 [concepts/embedding](/posts/wiki/concepts/embedding.html) 技术将查询和文档映射到同一向量空间，利用向量相似度来衡量语义相关性，从而检索到"意思相近"而不仅仅是"字面匹配"的结果。

## 语义搜索 vs 关键词搜索

关键词搜索（如 BM25、TF-IDF）基于词频统计和精确匹配，擅长处理包含特定专有名词、产品型号等精确查询。其优势是速度快、可解释性强，但无法理解同义词（"汽车" vs "轿车"）、上下位关系（"水果" vs "苹果"）和语义隐含。

语义搜索基于 [concepts/embedding](/posts/wiki/concepts/embedding.html) 的语义表示，能够理解查询的真正意图，跨越词汇鸿沟找到语义相关的结果。但它可能在精确匹配场景下不如关键词搜索（如搜索特定错误代码），且计算成本更高。

## 工作原理

标准语义搜索流程分为三步：**Query Embedding**（将用户查询通过嵌入模型转换为向量）$\rightarrow$ **向量相似度匹配**（在 [concepts/vector-database](/posts/wiki/concepts/vector-database.html) 中检索最相似的候选文档）$\rightarrow$ **重排序**（对初检结果进行精细化排序）。

初检阶段通常使用双编码器（Bi-Encoder）快速召回 Top-K 候选，重排序阶段使用 Cross-Encoder 对每个候选与查询进行深度交互计算精确的相关性分数，虽然速度更慢但精度显著更高。

## 混合搜索

混合搜索（Hybrid Search）将关键词搜索和语义搜索的结果融合，兼顾精确匹配和语义理解。常见策略是分别执行 BM25 和向量检索，通过 Reciprocal Rank Fusion（RRF）或加权分数合并两组结果。混合搜索已成为生产环境中的标准实践，效果通常优于单一方法。

## 应用场景

- **企业知识库**：员工用自然语言查询内部文档
- **客服系统**：匹配用户问题与知识库中的解决方案
- **代码搜索**：根据功能描述查找相关代码片段
- **电商平台**：根据购物意图而非关键词推荐商品
- **RAG 系统**：作为 [concepts/retrieval-augmented-generation](/posts/wiki/concepts/retrieval-augmented-generation.html) 的检索组件

## 相关页面

- [concepts/embedding](/posts/wiki/concepts/embedding.html)：语义搜索的底层表示技术
- [concepts/vector-database](/posts/wiki/concepts/vector-database.html)：语义搜索的存储和检索引擎
- [concepts/retrieval-augmented-generation](/posts/wiki/concepts/retrieval-augmented-generation.html)：语义搜索在 RAG 中的应用
