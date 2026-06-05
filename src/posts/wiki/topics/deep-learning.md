---
title: 深度学习
icon: pen-to-square
date: 2026-05-29
category:
  - 技术领域
tag:
  - deep-learning
  - neural-network
  - ai
  - representation-learning
---

# 深度学习

深度学习（Deep Learning）是机器学习的子领域，通过多层神经网络自动学习数据的层次化表示。其核心思想是让模型自动从原始数据中提取由低级到高级的特征，减少人工特征工程的依赖。

## 神经网络基础

深度学习的计算单元是人工神经元（感知机），通过激活函数引入非线性。常用的激活函数包括 ReLU、Sigmoid 和 GELU。反向传播（Backpropagation）算法配合梯度下降是训练神经网络的核心机制，链式法则使得损失函数对各层参数的梯度计算成为可能。

## 主要网络架构

- **CNN（卷积神经网络）**：利用卷积核提取局部空间特征，在图像处理领域取得了突破性成果。代表模型包括 AlexNet、VGG、ResNet。
- **RNN / LSTM**：处理序列数据的递归结构，LSTM 通过门控机制缓解了梯度消失问题，广泛用于时序预测和早期 NLP 任务。
- **[Transformer](/posts/wiki/concepts/transformer-architecture.html)**：基于自注意力机制的架构，彻底改变了 NLP 和 CV 领域，是 GPT、BERT、ViT 等模型的基础。

## GPU 训练与并行计算

深度学习的发展与 GPU 算力密不可分。CUDA 和 PyTorch/TensorFlow 等框架使得 GPU 加速训练成为标配。数据并行、模型并行和流水线并行是处理大规模模型的三种主要并行策略。混合精度训练在保持精度的同时显著提升了训练速度。

## 深度学习的局限性

尽管深度学习取得了巨大成功，但仍面临诸多挑战：对大量标注数据的依赖、模型可解释性差、对抗样本脆弱性、训练成本高昂以及灾难性遗忘等问题。这些局限推动了 Few-shot Learning、可解释 AI 和持续学习等研究方向的发展。

深度学习源于 [机器学习](/posts/wiki/topics/machine-learning.html)，但已在众多领域形成了独立的方法论和工具链。

## 相关页面

- [concepts/transformer-architecture](/posts/wiki/concepts/transformer-architecture.html)
- [topics/machine-learning](/posts/wiki/topics/machine-learning.html)
