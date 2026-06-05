---
title: Tokenization
icon: pen-to-square
date: 2026-05-29
category:
  - AI 概念
tag:
  - tokenization
  - llm
  - nlp
  - bpe
---

# 分词（Tokenization）

分词（Tokenization）是将原始文本拆分为模型可处理的基本单元（token）的过程。它是 [concepts/llm-training-pipeline](/posts/wiki/concepts/llm-training-pipeline.html) 的第一步，直接影响模型的词汇量、处理效率和生成质量。分词粒度的选择是效率与表达能力之间的关键权衡。

## BPE（Byte Pair Encoding）

BPE 是当前 LLM 最广泛使用的分词算法。其核心思路是迭代合并频率最高的字符对：从字符级别出发，统计相邻字符对的频率，将最高频的对合并为新符号，重复直至达到目标词汇量。BPE 自动学习子词单元，在常见词保持完整（如"learning"）的同时，将罕见词拆分为有意义的子词片段（如"un" + "familiar"），有效平衡了词汇量与覆盖度。

## WordPiece 与 SentencePiece

**WordPiece**（用于 BERT）与 BPE 类似，但选择合并对时基于语言模型似然增益而非频率，倾向于合并能提升整体概率的子词对。

**SentencePiece** 是一个语言无关的分词工具包，直接从原始文本（不依赖预分词）训练子词模型，支持 BPE 和 Unigram 两种算法。它被 LLaMA、Gemma 等模型采用，尤其适合多语言场景。

## 分词对模型性能的影响

分词质量直接决定模型的输入表示效率。词汇量过大会导致嵌入矩阵膨胀、训练不充分；词汇量过小则文本被切分过细（如中文逐字切分），增加序列长度和计算成本。不同语言在相同 tokenizer 下的效率差异显著——同样的含义，日文和韩文所需的 token 数通常是英文的 2-4 倍，这直接影响了 API 调用成本和处理速度。

## 中文分词的特殊挑战

中文没有天然的词边界（空格），分词面临独特挑战。主流 LLM 的 tokenizer 对中文的处理通常处于字级别和子词级别之间，效率低于英文。一些中文优化模型（如 ChatGLM）专门设计了中文友好的 tokenizer，通过在中文语料上训练词汇表来提高中文的压缩率。

## Tokenizer 与上下文窗口

上下文窗口（Context Window）以 token 数为单位度量。分词粒度越细，同一文本消耗的 token 越多，有效上下文越短。理解所用模型的 tokenizer 行为对于合理利用上下文窗口、控制 API 成本至关重要。

## 相关页面

- [concepts/llm-training-pipeline](/posts/wiki/concepts/llm-training-pipeline.html)：分词是训练流程的起点
- [concepts/transformer-architecture](/posts/wiki/concepts/transformer-architecture.html)：token 作为 Transformer 输入的基本单元
- [concepts/embedding](/posts/wiki/concepts/embedding.html)：token 到向量表示的映射
