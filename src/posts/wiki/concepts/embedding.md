---
title: Embedding
icon: pen-to-square
date: 2026-05-29
category:
  - AI 概念
tag:
  - embedding
  - vector
  - representation-learning
---

# 嵌入（Embedding）

嵌入（Embedding）是将离散的符号（词、句子、实体）映射到连续的低维向量空间的技术。好的嵌入能够捕获语义关系——语义相近的元素在向量空间中距离相近。嵌入是连接自然语言与数值计算的桥梁，是 [concepts/attention-mechanism](/posts/wiki/concepts/attention-mechanism.html) 和 [concepts/vector-database](/posts/wiki/concepts/vector-database.html) 的基础。

## 从 Word2Vec 到 Contextual Embedding

**Word2Vec（2013）** 通过在大规模语料上训练浅层神经网络，为每个词学习一个固定的稠密向量。它揭示了一个重要性质：向量空间中的线性运算可以编码语义关系（如 $\vec{king} - \vec{man} + \vec{woman} \approx \vec{queen}$）。但 Word2Vec 是静态的——"bank"在"河岸"和"银行"中拥有相同的向量。

**Contextual Embedding** 由 ELMo 和 BERT 开创，根据上下文动态生成每个词的向量表示，解决了多义词消歧问题。在现代 [concepts/transformer-architecture](/posts/wiki/concepts/transformer-architecture.html) 中，嵌入层输出经过多层自注意力的不断更新，最终每个 token 的表示都融合了整个序列的上下文信息。

## 句子与文档嵌入

句子嵌入（Sentence Embedding）将整句话或段落映射为一个向量，用于句子级别的语义比较。SBERT（Sentence-BERT）通过 Siamese 网络结构在语义相似度任务上微调 BERT，生成高质量的句子向量。文档嵌入则处理更长的文本，通常采用分段嵌入后聚合的策略。

## 在检索和 RAG 中的应用

嵌入是 [concepts/retrieval-augmented-generation](/posts/wiki/concepts/retrieval-augmented-generation.html) 和 [concepts/semantic-search](/posts/wiki/concepts/semantic-search.html) 的核心组件。工作流程为：将文档库分块后计算嵌入向量并索引到 [concepts/vector-database](/posts/wiki/concepts/vector-database.html) 中；查询时计算查询文本的嵌入，通过向量相似度检索最相关的文档片段，再送入 LLM 生成回答。

## 常见嵌入模型

当前主流的嵌入模型包括：OpenAI 的 text-embedding-3 系列、Cohere 的 embed 模型、开源的 BGE（BAAI General Embedding）和 E5 系列。选择模型时需关注嵌入维度、最大输入长度、多语言支持以及 MTEB（Massive Text Embedding Benchmark）排行榜上的综合表现。

## 相关页面

- [concepts/vector-database](/posts/wiki/concepts/vector-database.html)：嵌入向量的存储与检索基础设施
- [concepts/semantic-search](/posts/wiki/concepts/semantic-search.html)：基于嵌入的语义搜索
- [concepts/retrieval-augmented-generation](/posts/wiki/concepts/retrieval-augmented-generation.html)：嵌入在 RAG 系统中的应用
