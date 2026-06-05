---
title: 计算机视觉
icon: pen-to-square
date: 2026-05-29
category:
  - 技术领域
tag:
  - computer-vision
  - image
  - ai
  - deep-learning
---

# 计算机视觉

计算机视觉（Computer Vision, CV）是 AI 领域的重要分支，致力于让计算机从图像和视频中提取、分析和理解视觉信息。CV 技术是自动驾驶、医学影像、安防监控和增强现实等应用的核心驱动力。

## 核心任务

- **图像分类**：识别图像中的主要对象类别
- **目标检测**：定位并识别图像中的多个物体及其位置（边界框）
- **语义分割 / 实例分割**：像素级别的场景理解
- **图像生成**：从文本或噪声生成逼真图像

## CNN 时代

2012 年 AlexNet 在 ImageNet 竞赛中的突破标志着深度学习在 CV 领域的全面崛起。此后 ResNet 通过残差连接解决了深层网络训练难题，YOLO 系列实现了实时目标检测，成为工业部署的主流选择。

## Vision Transformer

[Transformer](/posts/wiki/concepts/transformer-architecture.html) 架构从 NLP 成功迁移到 CV 领域。ViT（Vision Transformer）将图像切分为 Patch 序列并用自注意力建模，在大规模数据上超越了 CNN 的性能上限。Swin Transformer 等变体通过层次化设计兼顾了效率和精度。

## 多模态模型

CLIP 模型通过对齐图像和文本的语义空间实现了零样本图像分类。GPT-4V、Gemini 等模型将视觉理解与语言推理统一在同一个框架中，标志着多模态 AI 的到来。

## 扩散模型

Stable Diffusion、DALL-E 和 Midjourney 等扩散模型在图像生成领域取得了革命性突破。通过逐步去噪的生成过程，扩散模型能够根据文本描述生成高质量、高分辨率的图像，深刻改变了创意产业的 workflow。

## 相关页面

- [topics/deep-learning](/posts/wiki/topics/deep-learning.html)
- [concepts/transformer-architecture](/posts/wiki/concepts/transformer-architecture.html)
