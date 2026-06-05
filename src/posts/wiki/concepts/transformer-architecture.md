---
title: Transformer Architecture
icon: pen-to-square
date: 2026-05-29
category:
  - AI 概念
tag:
  - transformer
  - architecture
  - deep-learning
  - attention
---

# Transformer 架构

Transformer 是 2017 年由 Google 团队提出的深度学习架构，其核心创新是摒弃了传统的循环和卷积结构，完全基于 [concepts/attention-mechanism](/posts/wiki/concepts/attention-mechanism.html) 实现序列建模。这一架构从根本上改变了 NLP 和 CV 的技术格局，是当前所有主流 LLM 的基础。

## 核心组件

**Self-Attention（自注意力）** 是 Transformer 的计算核心。每个位置的 token 通过三组线性变换生成 Query、Key、Value 向量，通过计算注意力权重来捕获序列内任意两个位置之间的依赖关系。Multi-Head Attention 将注意力空间拆分为多个子空间，使模型能同时关注不同类型的语义关系。

**位置编码（Positional Encoding）** 弥补了自注意力机制本身不具备位置感知的缺陷。原始 Transformer 使用正弦/余弦函数生成固定编码，后续工作演化出可学习的位置编码（Learned PE）和旋转位置编码（RoPE），后者被 LLaMA 等现代模型广泛采用。

**前馈网络（FFN）** 对每个 token 独立施加两层线性变换（中间层维度通常为隐藏层的 4 倍），配合非线性激活函数（原版使用 ReLU，现代模型多用 GELU 或 SwiGLU），为模型提供非线性表达能力。

**残差连接与 Layer Normalization** 贯穿每个子层，采用 Add & Norm 结构，有效缓解深层网络的梯度消失问题。Pre-Norm（先归一化再计算）已成为现代实现的标准选择。

## 编码器-解码器结构

原始 Transformer 采用 Encoder-Decoder 架构：编码器通过自注意力构建输入的全局表示，解码器则通过带掩码的自注意力（Masked Attention）和交叉注意力（Cross-Attention）逐步生成输出。GPT 系列仅使用 Decoder（单向注意力），BERT 仅使用 Encoder（双向注意力），而 T5、BART 等保留了完整的 Encoder-Decoder 结构。

## 为何取代 RNN/CNN

Transformer 通过自注意力实现全局感受野，解决了 RNN 的长程依赖瓶颈和不可并行问题，也超越了 CNN 受限于局部窗口的特征提取能力。其计算复杂度在序列长度上的劣势，随着高效的 [concepts/attention-mechanism](/posts/wiki/concepts/attention-mechanism.html) 变体（如 Flash Attention）的出现而得到缓解。

## 影响

Transformer 的影响远超 NLP 领域。Vision Transformer（ViT）证明了其在图像分类中的有效性，此后扩散模型（Diffusion Model）、蛋白质结构预测（AlphaFold）等领域也纷纷采用 Transformer 架构。它已成为深度学习的通用计算范式。

## 相关页面

- [concepts/attention-mechanism](/posts/wiki/concepts/attention-mechanism.html)：Transformer 的核心计算机制
- [concepts/llm-training-pipeline](/posts/wiki/concepts/llm-training-pipeline.html)：基于 Transformer 的模型训练流程
- [concepts/embedding](/posts/wiki/concepts/embedding.html)：Transformer 输入层的向量表示
