---
title: Knowledge Graph
icon: pen-to-square
date: 2026-05-29
category:
  - AI 概念
tag:
  - knowledge-graph
  - graph
  - ontology
  - knowledge-representation
---

# 知识图谱

知识图谱（Knowledge Graph）是一种以图结构组织知识的方式，通过"实体-关系-实体"的三元组（如 `(巴黎, 是首都, 法国)`）表示事实和概念之间的关联。它是结构化知识表示的经典范式，与基于自由文本的 Wiki 知识库形成互补。

## 核心概念

知识图谱的基本组成单元是**三元组**（Triple）：主语（Subject）- 谓词（Predicate）- 宾语（Object）。大量三元组构成一个有向图，节点是实体或概念，边是关系类型。**本体**（Ontology）定义了图谱中允许的实体类型和关系类型，是图谱的 Schema 层。

知识图谱中的关键操作包括：实体链接（Entity Linking，将文本中的 mention 映射到图谱实体）、关系抽取（Relation Extraction，从文本中提取三元组）、知识推理（Knowledge Reasoning，通过已有三元组推导新事实）。

## RDF 与属性图模型

**RDF（Resource Description Framework）** 是 W3C 的知识图谱标准，使用 URI 标识实体，支持 SPARQL 查询语言，适合开放世界的知识共享和互操作。RDF 数据库称为 Triple Store。

**属性图（Property Graph）** 是工业界更流行的模型，节点和边都可以携带属性键值对，支持复杂查询（如 Neo4j 的 Cypher），在社交网络分析和推荐系统中应用广泛。

## 知识图谱嵌入

知识图谱嵌入（Knowledge Graph Embedding）将实体和关系映射到低维向量空间，使得真实三元组的得分高于虚假三元组。代表性方法包括 TransE、DistMult、ComplEx 和 RotatE。嵌入使得知识图谱可以与神经网络模型无缝集成，用于链接预测和关系推理。

## 与 Wiki 知识库的互补关系

本 LLM Wiki 项目本身可以视为一种轻量级知识图谱：每个 Wiki 页面对应一个概念实体，[concepts/xxx](/posts/wiki/concepts/xxx.html) 双链对应关系边。与正式知识图谱相比，Wiki 的优势在于人类可读性和灵活的文本表达；知识图谱的优势在于支持精确的图查询和自动推理。两者结合的方向是：用 LLM 从 Wiki 文本中提取三元组，构建可查询的知识图谱层。

## 应用

知识图谱被广泛应用于搜索引擎（Google Knowledge Graph 提供知识面板）、智能问答（IBM Watson）、推荐系统（利用实体关系增强协同过滤）、以及 [concepts/retrieval-augmented-generation](/posts/wiki/concepts/retrieval-augmented-generation.html) 的知识增强（GraphRAG）。

## 相关页面

- [topics/knowledge-management](/posts/wiki/topics/knowledge-management.html)：知识图谱与知识管理方法论
- [concepts/retrieval-augmented-generation](/posts/wiki/concepts/retrieval-augmented-generation.html)：知识图谱增强的 RAG（GraphRAG）
- [concepts/embedding](/posts/wiki/concepts/embedding.html)：知识图谱嵌入的向量表示
