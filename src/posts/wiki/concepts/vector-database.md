---
title: Vector Database
icon: pen-to-square
date: 2026-05-29
category:
  - AI 概念
tag:
  - vector-database
  - embedding
  - similarity-search
  - ann
---

# 向量数据库

向量数据库（Vector Database）是专门为存储、索引和检索高维向量而设计的数据库系统。它是 [concepts/embedding](/posts/wiki/concepts/embedding.html) 技术和 [concepts/retrieval-augmented-generation](/posts/wiki/concepts/retrieval-augmented-generation.html) 架构的基础设施层，使大规模语义检索成为可能。

## 与传统数据库的区别

传统数据库基于精确匹配或范围查询（如 SQL 的 WHERE 子句），适合结构化数据检索。向量数据库则基于相似度度量（余弦相似度、欧氏距离、内积），解决的是"找出与查询最相似的 N 个向量"这一最近邻搜索问题。两者的互补性催生了混合检索方案——同时支持元数据过滤和向量相似度排序。

## ANN 搜索算法

精确的 k-NN（k-Nearest Neighbors）搜索在大规模数据集上计算代价极高（$O(n \times d)$）。近似最近邻（Approximate Nearest Neighbor, ANN）算法通过牺牲少量精度换取数量级的速度提升：

**HNSW（Hierarchical Navigable Small World）** 构建多层图结构，查询时从顶层开始逐层向下贪心搜索，时间复杂度约为 $O(\log n)$。它是当前综合性能最优的 ANN 索引之一，查询延迟低且召回率高，被大多数向量数据库作为默认索引。

**IVF（Inverted File Index）** 将向量空间划分为多个 Voronoi 单元（cluster），查询时只搜索与查询最近的几个 cell，大幅减少计算量。IVF 常与 PQ 结合使用（IVF-PQ），在亿级数据集上实现高效检索。

**PQ（Product Quantization）** 将高维向量拆分为多个子空间并分别量化，用短编码代替原始向量存储。它是一种有损压缩方法，可将存储空间压缩 8-32 倍，适合内存受限的大规模场景。

## 主流产品

- **Pinecone**：全托管服务，零运维，适合快速集成
- **Weaviate**：开源，内置向量化和混合搜索，支持 GraphQL 查询
- **Milvus**：开源，支持亿级数据，架构高度可扩展
- **Chroma**：开源轻量，面向 AI 应用开发者，API 简洁
- **Qdrant**：开源，Rust 实现，性能优异，支持复杂过滤

## 应用场景

向量数据库在 [concepts/retrieval-augmented-generation](/posts/wiki/concepts/retrieval-augmented-generation.html) 系统中用于存储文档的嵌入向量并实现语义检索。在推荐系统中，将用户和物品映射为向量后进行相似度匹配。在去重、以图搜图、语义缓存等场景中也有广泛应用。

## 相关页面

- [concepts/embedding](/posts/wiki/concepts/embedding.html)：向量数据库中存储的数据来源
- [concepts/retrieval-augmented-generation](/posts/wiki/concepts/retrieval-augmented-generation.html)：向量数据库在 RAG 中的核心角色
- [concepts/semantic-search](/posts/wiki/concepts/semantic-search.html)：基于向量数据库的语义搜索
