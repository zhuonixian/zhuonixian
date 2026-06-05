---
title: Hugging Face
icon: pen-to-square
date: 2026-05-29
category:
  - 公司与人物
tag:
  - company
  - open-source
  - ml-platform
  - community
---

# Hugging Face

> AI 开源社区的 GitHub，托管模型、数据集和应用，推动机器学习民主化。

## 简介

Hugging Face 于 2016 年由 Clment Delangue 等人在纽约创立，最初是一个面向青少年的聊天机器人公司。后转型为开源 ML 平台，如今已成为 [开源 AI](/posts/wiki/topics/open-source.html) 生态的核心枢纽。公司估值超过 45 亿美元（2023）。

## 核心产品

### Transformers 库

提供统一的 API 接口访问数千个预训练模型，支持 PyTorch、TensorFlow 和 JAX 框架。涵盖 NLP、计算机视觉、音频等任务，是 ML 工程师的标配工具。

### Model Hub

开源模型托管平台，拥有超过 50 万个模型。支持模型版本管理（Git-based）、模型卡片（Model Card）和许可证标注。LLaMA、Mistral、Gemma 等主流开源模型均在此托管。

### Datasets 库

提供标准化数据集加载和预处理工具，托管超过 10 万个数据集。支持流式加载（streaming），可处理超大规模数据。

### Spaces

应用展示平台，支持 Gradio 和 Streamlit 框架。开发者可快速部署 ML 模型的交互式 Demo，支持 CPU 和 GPU 环境。

### Inference API

提供模型推理的云端 API，包括免费额度，降低了模型部署门槛。

## 对开源 AI 生态的贡献

- 建立了模型共享的事实标准（Model Card、许可证、评估基准）
- 推动小团队和个人开发者参与前沿 AI 研究和应用
- 通过开源工具链（PEFT、TRL、Accelerate）降低了 [微调](/posts/wiki/concepts/fine-tuning.html) 和部署的门槛

## 时间线

| 时间 | 事件 |
|------|------|
| 2016 | 公司成立，最初做聊天机器人 |
| 2018 | Transformers 库开源 |
| 2020 | Model Hub 上线 |
| 2022 | 获 1 亿美元融资 |
| 2023 | 获 2.35 亿美元 D 轮融资，估值 45 亿美元 |

## 相关页面

- [topics/open-source](/posts/wiki/topics/open-source.html)
- [concepts/fine-tuning](/posts/wiki/concepts/fine-tuning.html)
- [entities/meta-ai](/posts/wiki/entities/meta-ai.html)
- [entities/ollama](/posts/wiki/entities/ollama.html)
