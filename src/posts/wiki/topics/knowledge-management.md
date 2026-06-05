---
title: 知识管理
icon: pen-to-square
date: 2026-05-29
category:
  - 技术领域
tag:
  - knowledge-management
  - pkm
  - productivity
---

# 知识管理

## 个人知识管理的演进

个人知识管理（Personal Knowledge Management, PKM）经历了从纸质笔记到数字化、再到智能化的三个阶段。早期以文件夹分类为主，中期以标签系统为代表，当前阶段则以双向链接和知识图谱为核心范式。

每一次范式转移都在降低知识组织的摩擦，同时提升知识检索和联结的效率。

## Zettelkasten 方法

Zettelkasten（卡片盒笔记法）由德国社会学家 Niklas Luhmann 创立，其核心理念是：

- **原子化**：每条笔记只包含一个独立的概念或想法。
- **链接优先**：通过笔记间的链接而非层级分类来组织知识。
- **持续生长**：知识库通过不断添加新笔记和链接而有机生长。

这一方法启发了现代双向链接工具的设计哲学。

## 双向链接与知识图谱

双向链接（Bidirectional Links）是现代 PKM 工具的标志性特性。当页面 A 链接到页面 B 时，B 页面会自动显示反向引用。这种机制使知识联结变得可见、可追溯，形成知识图谱。

知识图谱的价值在于：它不仅存储知识，还揭示知识之间的关系。随着节点和边增多，图谱中涌现出的结构本身就是新的洞见。

## LLM 驱动的知识管理新范式

大语言模型为知识管理带来了根本性变革：

- **LLM Wiki 模式**：用 LLM Agent 将原始资料编译为结构化知识页面，知识库以复利方式增长。参见 [RAG vs Compiled Wiki](/posts/wiki/comparisons/rag-vs-compiled-wiki.html)。
- **智能检索增强**：LLM 理解查询意图，提供语义级而非关键词级的检索。
- **自动摘要与联结**：LLM 可以自动生成摘要、发现隐含关联、建议相关页面。

[RAG](/posts/wiki/concepts/retrieval-augmented-generation.html) 技术使 LLM 能够利用外部知识库回答问题，而编译式 Wiki 则将知识预先结构化以获得更高质量的输出。

## 工具生态

- **Obsidian**：本地优先的 Markdown 知识库，以双向链接和插件生态著称。是 LLM Wiki 的理想载体。
- **Notion**：云端协作工具，数据库功能强大，适合团队场景。
- **Logseq**：大纲式笔记工具，强调块级链接和查询能力。

## Karpathy 的 LLM Wiki 理念

Andrej Karpathy 提出 LLM Wiki 的核心思想：将 LLM Agent 视为知识工作者，让它在 Obsidian 知识库中持续编写、更新、维护结构化知识页面。知识库不是被检索的原始数据，而是经过编译的、可复用的知识资产。详见 [构建 LLM Wiki 指南](/posts/wiki/guides/how-to-build-llm-wiki.html)。

## 相关页面

- [检索增强生成](/posts/wiki/concepts/retrieval-augmented-generation.html)：LLM + 外部知识的技术基础
- [构建 LLM Wiki 指南](/posts/wiki/guides/how-to-build-llm-wiki.html)：实践方法论
