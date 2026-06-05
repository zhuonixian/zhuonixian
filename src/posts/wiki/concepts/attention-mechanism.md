---
title: Attention Mechanism
icon: pen-to-square
date: 2026-05-29
category:
  - AI 概念
tag:
  - attention
  - transformer
  - deep-learning
  - nlp
---

# 注意力机制

注意力机制（Attention Mechanism）是深度学习中用于建模序列元素间依赖关系的核心计算范式。它使模型能够动态地"关注"输入中最相关的部分，而非依赖固定长度的上下文窗口。注意力是 [concepts/transformer-architecture](/posts/wiki/concepts/transformer-architecture.html) 的计算核心。

## 演进历程

**Bahdanau Attention（2014）** 首次在机器翻译中引入可学习的对齐机制，让解码器在生成每个词时自适应地关注源序列的不同位置，解决了 RNN 固定长度上下文向量的信息瓶颈问题。

**Luong Attention（2015）** 简化了注意力计算，提出了乘性（multiplicative）和加性（additive）两种评分函数，并引入了全局注意力和局部注意力的区分。

**Self-Attention（自注意力）** 将注意力机制从跨序列对齐推广到序列内部，使每个位置能够直接与序列中所有其他位置交互。这一创新是 [concepts/transformer-architecture](/posts/wiki/concepts/transformer-architecture.html) 的基石。

**Multi-Head Attention** 通过并行多组独立的注意力计算，让模型在不同子空间中捕获不同类型的语义关系（如语法关系、语义共指、位置关系等），最终拼接并线性投影得到输出。

## Q/K/V 计算过程

注意力机制将输入映射为三组向量：Query（Q，查询向量）、Key（K，键向量）、Value（V，值向量）。对于输入序列 $X$，通过可学习的权重矩阵 $W_Q$、$W_K$、$W_V$ 进行线性变换：

- $Q = XW_Q$：表示"我在寻找什么"
- $K = XW_K$：表示"我能提供什么"
- $V = XW_V$：表示"我的实际内容"

## 缩放点积注意力

标准计算公式为 $\text{Attention}(Q, K, V) = \text{softmax}(QK^T / \sqrt{d_k}) V$。除以 $\sqrt{d_k}$ 是关键的缩放操作——当维度较大时，点积结果方差增大，softmax 会进入梯度极小的饱和区，缩放因子确保了梯度的稳定传播。

## 为什么注意力是核心

注意力机制的两个本质优势决定了其核心地位：一是**全局感受野**，每个位置可以直接访问序列中任意其他位置，路径长度为 $O(1)$，而 RNN 需要 $O(n)$；二是**动态加权**，权重完全由输入内容决定，实现了数据驱动的信息筛选。

现代优化如 Flash Attention 通过 IO 感知的分块计算将注意力从 $O(N^2)$ 内存瓶颈中解放出来，使得超长上下文（100K+ tokens）成为可能。

## 相关页面

- [concepts/transformer-architecture](/posts/wiki/concepts/transformer-architecture.html)：基于注意力机制的完整架构
- [concepts/embedding](/posts/wiki/concepts/embedding.html)：注意力计算的输入向量表示
- [concepts/llm-training-pipeline](/posts/wiki/concepts/llm-training-pipeline.html)：注意力模型的训练流程
