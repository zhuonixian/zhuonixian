---
title: RAG vs Compiled Wiki
icon: pen-to-square
date: 2026-05-29
category:
  - 技术对比
tag:
  - comparison
  - rag
  - knowledge-base
  - llm-wiki
---

# RAG vs Compiled Wiki

## 核心差异

[RAG](/posts/wiki/concepts/retrieval-augmented-generation.html) 和 Compiled Wiki 代表了两种不同的"LLM + 知识"范式，它们在知识的存储、组织和利用方式上存在根本差异。

## RAG 的工作方式

RAG（Retrieval-Augmented Generation）的工作流程是：

1. 用户提出查询
2. 系统将查询转换为向量，在知识库中检索相关文档片段
3. 将检索结果作为上下文注入 Prompt
4. LLM 基于注入的上下文生成回答

RAG 的本质是**查询时检索**——每次回答问题都需要重新搜索和发现知识。知识库中的文档保持原始状态，LLM 对这些文档的理解是即时的、临时的。

RAG 的优势在于实施成本低、可快速覆盖大量非结构化数据，适合企业文档问答、客服机器人等场景。

## Compiled Wiki 的工作方式

Compiled Wiki 的工作流程是：

1. LLM Agent 主动阅读原始资料
2. 将知识编译为结构化、精炼的 Wiki 页面
3. 页面包含 YAML 元数据、标题层级、双向链接
4. 知识库随着编译过程持续积累和精化

Compiled Wiki 的本质是**预处理编译**——知识在被查询之前就已经被消化、组织和结构化。每次查询直接利用已有的高质量知识页面，无需重新从原始材料中提取信息。

[Andrej Karpathy](/posts/wiki/entities/andrej-karpathy.html) 在构建个人 LLM Wiki 时强调：知识应该是"编译后的"，而非每次都从源码重新编译。

## 对比维度

| 维度 | RAG | Compiled Wiki |
|------|-----|---------------|
| **知识积累** | 无积累效应，每次查询独立 | 复利增长，知识越用越丰富 |
| **查询质量** | 受限于检索精度和上下文窗口 | 高质量页面直接提供精炼知识 |
| **维护成本** | 需维护向量索引和 Embedding 模型 | 需维护 Wiki 页面结构和内容 |
| **扩展性** | 线性扩展，文档量增大后检索质量下降 | 有机生长，交叉引用增强知识网络 |
| **可解释性** | 难以追溯知识来源和组织逻辑 | 透明的页面结构和双向链接 |
| **人机协作** | 人主要作为数据提供者 | 人与 LLM Agent 共同构建知识 |

## 各自适用场景

**RAG 更适合**：
- 大规模非结构化数据的快速问答
- 企业内部文档检索
- 实时性要求高的信息获取
- 不需要知识积累的一次性查询场景

**Compiled Wiki 更适合**：
- 个人或团队知识体系的长期构建
- 学习和研究中需要深度理解的知识管理
- 需要知识复用和交叉引用的场景
- LLM Agent 的持久化知识底座

## 结论：互补而非替代

RAG 和 Compiled Wiki 并非对立关系，而是互补的。在实践中，可以将 RAG 作为 Compiled Wiki 的补充——当 Wiki 中尚未覆盖某领域知识时，回退到 RAG 模式从原始资料中检索；同时将 RAG 检索到的高价值内容编译进 Wiki，实现知识的持续积累。

这种混合模式兼顾了覆盖广度和知识深度，是 LLM 时代知识管理的理想架构。

## 相关页面

- [检索增强生成](/posts/wiki/concepts/retrieval-augmented-generation.html)：RAG 技术的详细解析
- [Andrej Karpathy](/posts/wiki/entities/andrej-karpathy.html)：LLM Wiki 理念的提出者
