---
title: 新一代大模型评测基准：超越 MMLU 时代
icon: rocket
order: 5
date: 2026-06-13
category:
  - 技术
tag:
  - LLM
  - Benchmark
  - SWE-Bench
  - Chatbot Arena
  - AIME
  - LiveCodeBench
---

# 新一代大模型评测基准：超越 MMLU 时代

大模型能力飞速迭代的今天，传统评测基准正在失效。MMLU 上的顶级模型准确率已超过 90%，GSM8K 接近满分，HumanEval 也早已不是难以企及的高峰。当"考试分数"越来越难以区分模型的真实水平，评测社区正在转向更难、更真实、更具挑战性的新一代基准。本文系统梳理 2026 年最值得关注的大模型评测基准，涵盖代码修复、数学推理、人类偏好、科学问答等多个维度。

<!-- more -->

## 为什么需要新一代基准

传统基准的困境可以归结为三个核心问题。

**饱和问题。** MMLU、GSM8K、HumanEval 这三个曾经的标准基准，在 2025 年底就已接近饱和。顶级模型在 MMLU 上的准确率超过 92%，在 GSM8K 上接近 99%，在 HumanEval 上也突破了 95%。当所有模型都能拿到接近满分的成绩时，基准就失去了区分度。

**数据污染。** 更严重的问题在于训练数据污染。许多基准的题目和解答在互联网上广泛传播，几乎不可避免地被纳入模型的训练语料。研究显示，部分模型在"见过"的题目上表现远好于"没见过"的同类题目，这意味着高分可能只是记忆而非真正的能力。HumanEval 只有 164 道题，题量如此之少，数据污染的影响尤为显著。

**与真实应用脱节。** 传统基准多采用选择题或简答题的形式，与大模型在真实场景中的使用方式差距较大。一个能在 MMLU 上答对医学题目的模型，并不意味着它能帮助医生做出临床决策；一个能通过 HumanEval 的模型，也未必能修复真实项目中的复杂 Bug。

2026 年的趋势很明确：从"考试分数"走向"真实能力"。新一代基准更关注模型在真实任务中的表现，更注重防止数据污染，更贴近实际应用场景。

## SWE-Bench：真实代码修复

SWE-Bench（Software Engineering Benchmark）由 Princeton University 的研究团队于 2023 年提出，是目前评估大模型软件工程能力最具代表性的基准。

### 核心设计

SWE-Bench 的数据来源于真实的 GitHub 项目。具体来说，研究者从 12 个流行的 Python 开源仓库（如 Django、Flask、Scikit-learn、SymPy 等）中收集了数千个真实的 Issue 和对应的 Pull Request。每个样本包含：

- 问题描述（来自 GitHub Issue）
- 代码仓库快照（Issue 提出时的状态）
- 期望的代码修改（来自修复该 Issue 的 Pull Request）
- 验证测试用例

SWE-Bench Verified 是其中一个经过人工验证的子集，包含约 500 个经过确认的、可独立复现的 Issue。这个子集排除了环境问题、描述模糊等噪声因素，使得评测结果更加可靠。

### 评测方式

评测过程模拟了真实的代码修复流程：

```bash
# 克隆 SWE-Bench 评测仓库
git clone https://github.com/princeton-nlp/SWE-bench.git
cd SWE-bench

# 安装依赖
pip install -e .

# 运行评测（以特定模型为例）
python run_evaluation.py \
  --predictions_path results/predictions.json \
  --swe_bench_tasks_path data/swe-bench-verified.json \
  --log_level INFO
```

模型需要在 Docker 容器中，基于给定的代码仓库快照和 Issue 描述，生成代码补丁（patch）。评测系统会在隔离的 Docker 环境中应用补丁，运行对应的测试用例来判断修复是否成功。这种方式确保了评测的客观性和可复现性。

### 当前 SOTA 与人类对比

截至 2026 年 6 月，SWE-Bench Verified 上的代表性结果如下：

| 模型 | 解决率 | 备注 |
|------|--------|------|
| Claude Mythos 5 | 95.5% | BenchLM.ai 报告 |
| Claude Fable 5 | 95.0% | Vals AI 验证 |
| Claude Opus 4.8 | 88.6% | Vals AI 验证 |
| GPT-5.5 | 88.7% | DemandSphere 报告 |
| Gemini 3 Flash (high reasoning) | 75.8% | 官方排行榜 |
| 人类开发者 | 约 90%+ | 参考值 |

值得注意的是，顶级 AI 模型已经在 SWE-Bench Verified 上超越了人类开发者的平均水平。但这并不意味着 AI 在通用软件工程上超越人类，因为 SWE-Bench 的任务范围仍然是受限的。

## LiveCodeBench：动态代码生成

LiveCodeBench 由 LiveCodeBench 团队推出，核心设计理念是"动态更新，持续评测"，从而从根本上解决数据污染问题。

### 数据来源

LiveCodeBench 持续从以下平台抓取新的编程竞赛题目：

- **Codeforces** -- 竞赛编程平台，包含 Div.2 到 Div.1 各难度级别的题目
- **LeetCode** -- 面试编程题，涵盖 Easy 到 Hard 级别
- **AtCoder** -- 日本的竞赛编程平台
- **CodeChef** -- 印度的竞赛编程平台

由于这些平台每周都会发布新题目，模型几乎不可能在训练数据中"见过"这些题目。LiveCodeBench 使用滚动窗口机制，只采用最近发布的题目进行评测，确保评测的时效性和公平性。

### 支持语言与评测

LiveCodeBench 支持多种编程语言，包括 Python、Java、C++、JavaScript 等。评测基于测试用例通过率，每道题包含多组测试用例（包括公开和隐藏用例），模型需要通过全部测试用例才算正确。

截至 2026 年 6 月，LiveCodeBench 的代表性结果：

| 模型 | 分数 |
|------|------|
| O4-Mini (High) | 80.2 |
| O3 (High) | 75.8 |
| O4-Mini (Medium) | 74.2 |
| Gemini 2.5 Pro (06-05) | 73.6 |

LiveCodeBench 被广泛认为是当前最可靠的代码生成评测基准之一，其滚动更新机制有效地暴露了部分在静态基准上"刷分"的模型。

## AIME 2026：高等数学推理

AIME（American Invitational Mathematics Examination，美国数学邀请赛）是面向高中生的数学竞赛，难度远高于普通高中数学。AIME 题目需要深入的数学洞察力和多步推理能力，被认为是评估大模型高级数学推理能力的理想基准。

### 为什么 AIME 胜过 GSM8K/MATH

GSM8K 是小学数学应用题，MATH 竞赛级别的题目虽然较难，但已在互联网上广泛流传。相比之下，AIME 有几个独特优势：

- **题目每年更新** -- AIME 每年都会出全新题目，2026 年的题目在 2026 年 2 月才发布，模型不可能提前"见过"
- **难度极高** -- AIME 要求在 3 小时内完成 15 道题，即使是优秀的竞赛选手也难以全部答对
- **答案格式严格** -- 每道题的答案是 0-999 之间的整数，不存在猜对的可能

### 当前 SOTA

| 模型 | AIME 2024 准确率 | 备注 |
|------|-------------------|------|
| GPT-5 | 95.7% | pricepertoken.com 排行榜 |
| Grok 4 | 94.3% | pricepertoken.com 排行榜 |
| O4 Mini | 94.0% | pricepertoken.com 排行榜 |

在 AIME 2024 上，顶级模型的表现已经接近完美。但 AIME 2026 作为最新版本，由于题目发布时间极短，评测结果仍在持续更新中，可以在 MathArena 等平台追踪最新成绩。

## Chatbot Arena：人类偏好评测

Chatbot Arena 由 LMSYS（Large Model Systems Organization，现更名为 Arena AI）开发，是目前最具影响力的人类偏好评测平台。

### 盲测机制

Chatbot Arena 的核心是盲测对战。用户在平台上输入一个 Prompt，两个匿名模型同时生成回答，用户根据回答质量投票选择更好的一方。投票完成后才会揭晓两个模型的身份。这种机制消除了品牌偏见，确保评测结果反映真实的回答质量。

平台已积累超过 200 万人类投票，使用 Elo 评分系统（类似国际象棋的排名系统）为每个模型计算分数。

### 分类排行

Chatbot Arena 不仅提供总体排名，还细分为多个类别：

- **编码（Coding）** -- 代码生成和调试能力
- **推理（Reasoning）** -- 逻辑推理和问题解决
- **创意（Creative）** -- 创意写作和内容生成
- **中文（Chinese）** -- 中文理解和生成
- **硬提示（Hard Prompts）** -- 复杂多步骤任务

### 2026 年 6 月 Top 10

| 排名 | 模型 | Arena Elo |
|------|------|-----------|
| 1 | Claude Opus 4.6 Thinking | 1502 |
| 2 | GPT-5.4 | ~1480 |
| 3 | Gemini 3.1 | ~1460 |
| 4 | Claude Sonnet 4.6 | ~1440 |
| 5 | GPT-5.4 Mini | ~1420 |
| 6 | Gemini 3.1 Flash | ~1400 |
| 7 | DeepSeek V4 | ~1380 |
| 8 | Qwen 3.7 Max | ~1360 |
| 9 | Llama 4 Maverick | ~1340 |
| 10 | Mistral Large 3 | ~1320 |

> 注：以上 Elo 分数为近似值，实际分数每日更新。完整排行请访问 [arena.ai/leaderboard/text](https://arena.ai/leaderboard/text)。

### 优势与局限

**优势：**

- 最接近真实用户体验，评测维度全面
- 消除品牌偏见，结果客观
- 样本量大（200 万+投票），统计显著性强
- 持续更新，反映最新模型能力

**局限：**

- 主观性强，不同用户对"好回答"的判断标准不同
- 成本高，需要大量人类参与者
- 容易受 Prompt 分布影响（用户提交的 Prompt 偏向日常使用场景）
- 不适合评估需要专业知识才能判断的领域

## GPQA：研究生级科学问答

GPQA（Graduate-Level Google-Proof Q&A）是一个极具挑战性的科学问答基准，其题目由物理、化学、生物学领域的博士级专家编写。

### 设计理念

GPQA 的核心设计目标是创建"Google-proof"的题目，即无法通过简单搜索获取答案的高难度科学问题。每道题都是高质量的多选题，需要深厚的专业知识才能回答。GPQA Diamond 是其中最难的子集，包含 198 道经过严格筛选的题目。

### 难度之高

GPQA Diamond 的难度可以从人类专家的表现中窥见一斑：即使是拥有博士学位的人类专家，在 GPQA Diamond 上的平均准确率也仅为约 65%。这意味着题目设计得极其精巧，即使是领域专家也容易出错。

### 当前 SOTA

| 模型 | GPQA Diamond 准确率 | 备注 |
|------|---------------------|------|
| GPT-5.4 Pro (xhigh) | 94.6% | lmcouncil.ai |
| Gemini 3.1 Pro Preview | 94.1% | lmcouncil.ai |
| GPT-5.4 (xhigh) | 93.3% | lmcouncil.ai |
| MiniMax M3 | 92.9% | lmcouncil.ai |
| Qwen 3.7 Max | 92.3% | lmcouncil.ai |
| 人类专家 | 约 65% | 参考值 |

顶级模型在 GPQA Diamond 上的表现已经远超人类专家。这一方面展示了模型在科学知识方面的强大能力，另一方面也引发了关于"记忆 vs 推理"的讨论。部分研究者认为，模型可能在训练数据中接触过相关的科学文献，并非完全依赖推理来解题。

## IFEval：指令遵循评测

IFEval（Instruction-Following Evaluation）由 Google Research 提出，专注于评估大模型是否能够精确遵循用户的指令。

### 为什么指令遵循很重要

在实际应用中，模型不仅需要生成高质量的内容，还需要严格按照用户的格式和约束要求来输出。例如：

- "请用不超过 100 个词回答"
- "请以 JSON 格式输出结果"
- "回答中必须包含至少 3 个要点"
- "不要使用逗号"

这些看似简单的约束，对于大模型来说却是颇具挑战性的任务。如果模型不能可靠地遵循这些指令，在实际应用中就需要额外的后处理或人工干预。

### 评测内容

IFEval 定义了 25 种可自动验证的指令类型，涵盖以下类别：

- **长度约束** -- 输出字数/词数的上限或下限
- **格式约束** -- 要求使用 JSON、XML 等特定格式
- **标点约束** -- 禁止或要求使用特定标点符号
- **内容约束** -- 必须包含或禁止包含特定内容
- **结构约束** -- 要求使用特定段落结构或列表格式

所有指令都可以通过程序自动验证，无需人工评判，这使得评测结果客观且可复现。IFEval 已被纳入 HuggingFace Open LLM Leaderboard 和 EleutherAI lm-evaluation-harness 等主流评测框架。

```python
# 使用 lm-evaluation-harness 运行 IFEval
lm_eval --model hf \
    --model_args pretrained=meta-llama/Llama-3.1-70B \
    --tasks ifeval \
    --batch_size 8
```

## 其他新兴基准

### GAIA：通用 AI 助手评测

GAIA（General AI Assistants）由 Meta AI 提出，是一个面向通用 AI 助手能力的基准。GAIA 包含 466 个需要推理、多模态处理、网络浏览和工具使用能力的问题，分为三个难度级别。与大多数基准不同，GAIA 要求模型具备综合性的问题解决能力，而非单一技能。

截至 2026 年 6 月，GAIA 仍然是 AI 领域最难的基准之一。在 HuggingFace 的公开排行榜上，结合多模型协同的 Agent 系统取得了 92% 左右的成绩，但这是在较简单的子集上。在完整的 held-out 测试集上，顶级模型的准确率仍在 45% 左右，与人类水平的接近满分相比还有巨大差距。

### MMMU：多模态理解

MMMU（Massive Multi-discipline Multimodal Understanding）是一个评估多模态模型在大学级别学科任务上表现的基准，涵盖 30 个学科领域。MMMU-Pro（ACL 2025）是其增强版本，消除了猜测捷径，进一步提高了评测的可靠性。

随着多模态模型在 2026 年的快速发展，MMMU 和 MMMU-Pro 成为评估视觉-语言模型综合理解能力的重要标准。

### 动态评测与 Auto-Eval

评测社区也在探索自动化和动态评测方案。一些新的研究方向包括：

- **使用 LLM 作为评判者（LLM-as-Judge）** -- 用强大的模型来评判其他模型的输出质量
- **对抗性评测** -- 自动生成评测样本来发现模型的弱点和边界
- **评测数据集的持续更新** -- 定期引入新题目，防止静态数据集的过时和污染

## 如何组合使用这些基准

面对众多的评测基准，如何选择和组合使用是一个实际问题。以下是一些推荐方案：

### 按场景推荐

| 场景 | 推荐基准组合 | 说明 |
|------|-------------|------|
| 通用能力评估 | Chatbot Arena + GPQA + IFEval | 覆盖人类偏好、科学推理和指令遵循 |
| 代码开发 | SWE-Bench + LiveCodeBench | 真实 Bug 修复 + 动态代码生成 |
| 数学推理 | AIME + GPQA Diamond | 竞赛数学 + 科学推理 |
| 通用助手 | GAIA + Chatbot Arena + IFEval | 综合问题解决 + 人类偏好 + 指令遵循 |
| 多模态 | MMMU-Pro + Chatbot Arena Vision | 多学科理解 + 人类偏好 |

### 综合评测 vs 专项评测

**综合评测**适合模型选型和横向比较。Chatbot Arena 提供了最全面的用户体验评估，配合 GPQA 和 IFEval 可以快速了解模型的综合实力。

**专项评测**适合特定场景的深入评估。如果你的核心场景是代码开发，SWE-Bench 和 LiveCodeBench 是不可替代的；如果关注数学推理，AIME 是最好的选择。

### 实践建议

1. **不要只看一个基准的分数** -- 任何单一基准都有局限性，综合多个基准的结果才能全面了解模型能力
2. **关注基准的时效性** -- 优先使用持续更新的基准（如 LiveCodeBench、Chatbot Arena），谨慎对待静态基准的分数
3. **区分报告来源** -- 官方验证的分数（如 Vals AI）比厂商自行报告的分数更可靠
4. **结合自身场景** -- 基准分数只是参考，最终还需要在自己的实际业务数据上进行评测

## 结语

评测基准是大模型发展的风向标。从 MMLU/GSM8K 到 SWE-Bench/AIME/Chatbot Arena，评测标准的演进反映了整个领域对"什么是真正智能"的深层思考。2026 年的评测格局更加多元和成熟，但也在不断面临新的挑战：当模型在所有基准上都接近满分时，我们该如何继续衡量进步？这个问题的答案，或许就是下一个评测范式的起点。
