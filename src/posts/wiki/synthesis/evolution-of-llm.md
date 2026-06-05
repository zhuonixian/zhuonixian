---
title: 大语言模型的进化史
icon: pen-to-square
date: 2026-05-29
category:
  - 综合分析
tag:
  - synthesis
  - llm
  - history
  - evolution
---

# 大语言模型的进化史

从统计语言模型到自主 Agent，大语言模型经历了约十年的范式跃迁。本页面梳理这一进程的关键节点和技术脉络。

## 前 Transformer 时代

2017 年之前，语言建模主要依赖统计方法：

- **n-gram 模型**：基于词频共现预测下一个词，简单有效但无法捕捉长距离依赖
- **Word2Vec（2013）**：Mikolov 提出的词向量方法，首次将词映射到连续向量空间，"king - man + woman ≈ queen"成为经典范例
- **Seq2Seq（2014）**：Sutskever 等人提出的编码器-解码器架构，使用 LSTM 处理变长序列，在机器翻译任务上取得突破
- **Attention 机制（2014-2015）**：Bahdanau 和 Luong 先后提出注意力机制，允许模型动态关注输入的不同部分

这些工作为 [Transformer](/posts/wiki/concepts/transformer-architecture.html) 的诞生奠定了思想和工程基础。

## Transformer 的诞生（2017）

Vaswani 等人在论文 "Attention Is All You Need" 中提出了 Transformer 架构，核心创新：

- **自注意力（Self-Attention）**：序列中每个位置可以直接关注所有其他位置，彻底解决了长距离依赖问题
- **并行计算**：抛弃了 RNN 的递归结构，训练过程可完全并行化，GPU 利用率大幅提升
- **位置编码**：通过正弦/余弦函数为序列注入位置信息

Transformer 的影响远超 NLP 领域——它成为计算机视觉（ViT）、语音、蛋白质结构预测等领域的通用架构。

## 预训练时代（2018-2020）

Transformer 之后，预训练成为主流范式：

- **GPT-1（2018）**：OpenAI 首次验证了"预训练 + 微调"的可行性，使用 Transformer Decoder
- **BERT（2018）**：Google 提出双向预训练，在 11 项 NLP 基准上刷新纪录，预训练-微调范式被广泛接受
- **GPT-2（2019）**：参数量从 1.17 亿增至 15 亿，展现出零样本（zero-shot）学习能力。OpenAI 因此推迟开源，引发"AI 安全"讨论
- **GPT-3（2020）**：1750 亿参数，少样本（few-shot）能力令人瞩目。规模效应首次被清晰地量化——"大力出奇迹"成为共识

## 规模定律与涌现能力

Kaplan 等人（2020）和 Chinchilla 论文（2022）揭示了 Scaling Laws：

- 模型性能与参数量、数据量、计算量呈幂律关系
- Chinchilla 研究表明此前模型"欠训练"——给定计算预算，应使用更多数据训练更小的模型
- 随着规模增长，模型展现出**涌现能力**（Emergent Abilities）：在足够大的模型上突然出现的复杂推理、代码生成等能力

Scaling Laws 直接推动了 [训练流水线](/posts/wiki/concepts/llm-training-pipeline.html) 的工程化。

## GPT-4 与多模态融合（2023-2024）

[GPT-4](/posts/wiki/entities/gpt.html) 的发布标志着 LLM 进入新阶段：

- **多模态能力**：同时理解文本和图像，在专业考试中达到人类前 10% 水平
- **推理增强**：通过思维链和自我反思实现复杂推理
- **可靠性提升**：幻觉率显著降低，指令遵循更加准确

同期，Gemini（Google）和 Claude（Anthropic）也在多模态和长上下文处理方面取得突破。

## Agent 时代（2024-2026）

LLM 从"语言理解"进化为"任务执行"：

- 工具使用和函数调用成为标配能力
- Agent 框架（LangGraph、CrewAI）支持多步规划和自主决策
- MCP 协议标准化了 Agent 与外部系统的交互
- Claude Code、Codex 等 Agent 可直接在代码库和终端中操作

## 未来方向

- **效率提升**：MoE（混合专家）、推测解码、量化技术让大模型在消费级硬件上可用
- **推理增强**：o-series 模型展示了"慢思考"的潜力，推理时的计算投入带来质量飞跃
- **个性化与记忆**：跨会话记忆和个性化适配让 LLM 成为真正的个人助手
- **多智能体协作**：多个专业 Agent 协同完成复杂任务，模拟人类团队的工作方式

## 相关页面

- [Transformer 架构](/posts/wiki/concepts/transformer-architecture.html)：Transformer 的技术细节
- [LLM 训练流水线](/posts/wiki/concepts/llm-training-pipeline.html)：从预训练到部署的完整流程
- [GPT](/posts/wiki/entities/gpt.html)：OpenAI GPT 系列模型的发展历程
