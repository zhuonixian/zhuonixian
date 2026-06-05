---
title: 自然语言处理
icon: pen-to-square
date: 2026-05-29
category:
  - 技术领域
tag:
  - nlp
  - text
  - ai
  - linguistics
---

# 自然语言处理

自然语言处理（Natural Language Processing, NLP）是人工智能与语言学的交叉领域，旨在让计算机理解、生成和处理人类语言。NLP 技术贯穿搜索引擎、智能助手、机器翻译和文本分析等核心应用。

## 任务分类

NLP 任务按复杂度可分为多个层次：

- **基础处理**：[分词](/posts/wiki/concepts/tokenization.html)（Tokenization）、词性标注（POS Tagging）、依存句法分析
- **信息提取**：命名实体识别（NER）、关系抽取、事件抽取
- **语义理解**：情感分析、文本分类、自然语言推理（NLI）
- **生成任务**：机器翻译、文本摘要、对话生成

## 方法论的演进

NLP 经历了三个主要阶段：**规则方法**（正则表达式、上下文无关文法）→ **统计方法**（HMM、CRF、TF-IDF + SVM）→ **神经网络方法**（Word2Vec、CNN/RNN、[Transformer](/posts/wiki/concepts/transformer-architecture.html)）。每次范式转换都带来了显著的性能跃迁。

## 预训练语言模型的突破

2018 年 BERT 引入双向预训练，刷新了多项 NLU 基准。GPT 系列则证明了大规模生成式预训练在文本生成任务上的强大能力。预训练 + 微调的范式成为 NLP 的主流方法论。

## LLM 时代的新范式

大语言模型（LLM）正在重塑 NLP 的研究范式：Prompt Engineering 替代了传统的特征工程，In-Context Learning 使得少样本甚至零样本学习成为可能。许多传统 NLP 任务（NER、情感分析、翻译）现在可以通过统一的 LLM 接口完成。

## 中文 NLP 的特殊挑战

中文缺乏天然的词边界，分词质量直接影响下游任务效果。此外，中文的句法灵活性、丰富的指代表达和成语/典故的语义理解都给 NLP 带来独特挑战。

## 相关页面

- [concepts/transformer-architecture](/posts/wiki/concepts/transformer-architecture.html)
- [concepts/tokenization](/posts/wiki/concepts/tokenization.html)
