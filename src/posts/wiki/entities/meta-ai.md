---
title: Meta AI
icon: pen-to-square
date: 2026-05-29
category:
  - 公司与人物
tag:
  - company
  - ai
  - open-source
  - meta
---

# Meta AI

> Meta 旗下的 AI 研究部门，以 LLaMA 系列开源模型引领开源 AI 生态。

## 简介

Meta AI（前身为 Facebook AI Research, FAIR）是 Meta 公司的 AI 研究部门。以 Yann LeCun 为首席 AI 科学家，Meta AI 在计算机视觉、自然语言处理和强化学习等领域贡献卓著。最引人注目的是 LLaMA 系列开源模型，深刻改变了 AI 行业的开源格局。

## 核心贡献

### LLaMA 系列

- **LLaMA 1**（2023-02）：首个开源基础模型，参数量 7B 到 65B，性能接近 GPT-3
- **LLaMA 2**（2023-07）：开放商用许可，7B 到 70B 参数，对话版本 Llama-2-Chat
- **LLaMA 3 / 3.1**（2024）：8B 和 70B 版本，3.1 推出 405B 参数模型，性能与 GPT-4 级别模型竞争
- **LLaMA 4**（2025）：多模态能力，进一步缩小与闭源模型的差距

LLaMA 系列催生了大量社区 [微调](/posts/wiki/concepts/fine-tuning.html) 工作，如 Alpaca、Vicuna、WizardLM 等。

### 基础设施与工具

- **PyTorch**：由 Meta 主导开发，已成为深度学习事实标准框架
- **FAIR 实验室**：在自监督学习（SimCLR、DINO）、目标检测（Detectron2）等领域持续产出
- **LLaMA Factory**：社区驱动的微调工具链

## 开源策略的影响

Meta 选择将强大的基础模型以开源形式发布，与 [开源 AI](/posts/wiki/topics/open-source.html) 社区形成良性互动。这一策略不仅降低了 AI 开发门槛，也迫使闭源模型提供商不断提升竞争力。

## 时间线

| 时间 | 事件 |
|------|------|
| 2013 | FAIR（Facebook AI Research）成立 |
| 2016 | PyTorch 开源发布 |
| 2023-02 | LLaMA 1 发布 |
| 2023-07 | LLaMA 2 开放商用许可 |
| 2024-04 | LLaMA 3 发布 |
| 2024-07 | LLaMA 3.1 发布，含 405B 参数版本 |

## 相关页面

- [concepts/fine-tuning](/posts/wiki/concepts/fine-tuning.html)
- [topics/open-source](/posts/wiki/topics/open-source.html)
- [entities/hugging-face](/posts/wiki/entities/hugging-face.html)
- [entities/ollama](/posts/wiki/entities/ollama.html)
