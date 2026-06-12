---
title: OpenCompass：一站式大模型评测平台
icon: magnifying-glass-chart
order: 4
date: 2026-06-13
category:
  - 技术
tag:
  - LLM
  - Benchmark
  - OpenCompass
  - 上海人工智能实验室
  - 评测框架
---

# OpenCompass：一站式大模型评测平台

OpenCompass 是由上海人工智能实验室（Shanghai AI Lab）开源的一站式大模型评测平台，旨在为大语言模型和多模态模型提供公平、开放、可复现的评测方案。平台内置 100+ 评测数据集，覆盖知识、推理、语言、代码、数学等多维度能力，是目前中文大模型评测领域最活跃的开源项目之一。

<!-- more -->

## 平台简介

OpenCompass 的核心目标是解决大模型评测中普遍存在的几个难题：评测标准不统一、结果难以复现、中文评测数据集匮乏。项目于 2023 年首次发布，托管在 GitHub 上（[open-compass/opencompass](https://github.com/open-compass/opencompass)），社区活跃度持续增长。

该项目对应的学术论文（arXiv: 2605.19276）详细阐述了评测框架的设计理念和实现细节。OpenCompass 不仅是一个工具，更是一套完整的评测方法论。

平台的核心设计原则：

- **公平性**：统一的评测流程，避免因评测方式差异导致的结果偏差
- **开放性**：开源代码和数据集，任何人都可以验证和复现评测结果
- **可复现性**：完整的配置文件和随机种子管理，确保相同条件下的结果一致

## 核心特性

### 多维度评测

OpenCompass 覆盖了大模型的核心能力维度：

| 能力维度 | 说明 | 代表数据集 |
|----------|------|------------|
| 知识 | 世界知识和常识推理 | MMLU, C-Eval, CMMLU |
| 推理 | 逻辑推理和因果推断 | GSM8K, ARC, HellaSwag |
| 语言 | 语言理解和生成能力 | WinoGrande, DROP |
| 代码 | 编程能力 | HumanEval, MBPP |
| 数学 | 数学问题求解 | MATH, GSM8K |
| 长文本 | 长上下文理解 | LongBench, L-Eval |

### LLM-as-Judge

OpenCompass 内置了 `GenericLLMEvaluator`，支持使用强模型（如 GPT-4、Claude）作为评判者对生成式回答进行评分。这种方式特别适合开放式问答、创意写作等难以用规则自动评测的任务。

### 多后端支持

框架支持多种模型推理后端，用户可以根据硬件环境和性能需求灵活选择：

- **HuggingFace Transformers**：最通用的后端，支持绝大多数开源模型
- **LMDeploy**：面向高性能推理部署，支持 Tensor Parallel
- **自定义后端**：通过继承基类实现 API 模型（如 OpenAI、Anthropic）的接入

### 配置驱动

OpenCompass 采用 YAML 和 Python 混合配置方式。简单的评测任务可以通过命令行参数完成，复杂的评测流程则通过 Python 配置文件描述，兼顾易用性和灵活性。

### OpenCompass Leaderboard

官方运营的 [OpenCompass Leaderboard](https://opencompass.org.cn/leaderboard-llm) 提供了主流大模型的评测排行，定期更新，是了解模型能力差异的重要参考。

## 与 lm-evaluation-harness 对比

lm-evaluation-harness（由 EleutherAI 开发）是大模型评测领域的另一个重要项目。以下是两者的关键差异：

| 维度 | lm-evaluation-harness | OpenCompass |
|------|----------------------|-------------|
| 开发方 | EleutherAI | 上海人工智能实验室 |
| 评测任务 | 60+ | 100+ |
| 中文支持 | 有限，需额外适配 | 深度支持，内置多个中文数据集 |
| LLM-as-Judge | 不内置，需自行实现 | 内置 GenericLLMEvaluator |
| 推理后端 | HF / vLLM / TGI | HF / LMDeploy / 自定义 |
| 配置方式 | CLI + Python | YAML + Python |
| 评测报告 | 基础文本输出 | 结构化报告 + 可视化 |
| 社区定位 | 英文社区为主 | 中英文双语社区 |

总体而言，如果你的评测需求以中文为主，或者需要 LLM-as-Judge 能力，OpenCompass 是更合适的选择。如果你主要关注英文评测且偏好轻量级工具，lm-evaluation-harness 同样值得考虑。

## 安装与配置

### 环境准备

OpenCompass 推荐使用 Conda 管理 Python 环境：

```bash
# 创建并激活环境
conda create -n opencompass python=3.10 -y
conda activate opencompass

# 克隆仓库并安装
git clone https://github.com/open-compass/opencompass.git
cd opencompass
pip install -e .
```

如果你需要使用 LMDeploy 后端，还需要额外安装：

```bash
pip install lmdeploy
```

### 数据集准备

OpenCompass 的数据集分为两类：内置数据集会自动下载，部分第三方数据集需要手动准备。框架提供了数据集管理工具：

```bash
# 查看可用数据集
opencompass --list-datasets

# 下载指定数据集
python tools/dataset_manager.py download --datasets mmlu gsm8k
```

## 基本使用

### 命令行评测

最简单的使用方式是通过命令行直接指定模型和数据集：

```bash
# 评测单个模型在多个数据集上的表现
opencompass --models hf_qwen2_5_7b --datasets mmlu gsm8k humaneval

# 指定工作目录，保存评测结果
opencompass --models hf_qwen2_5_7b --datasets mmlu --work-dir ./results/

# 使用配置文件运行完整评测
opencompass configs/eval_qwen.py
```

### 配置文件评测

对于更复杂的评测需求，推荐使用 Python 配置文件：

```python
# configs/eval_my_model.py
from opencompass.models import HuggingFace

models = [
    dict(
        type=HuggingFace,
        abbr='qwen2.5-7b',
        path='Qwen/Qwen2.5-7B-Instruct',
        max_out_len=1024,
        batch_size=8,
        run_cfg=dict(num_gpus=1),
    )
]

datasets = [
    'mmlu', 'gsm8k', 'humaneval', 'ceval', 'cmmlu'
]
```

运行方式：

```bash
opencompass configs/eval_my_model.py
```

## 中文评测数据集

OpenCompass 的一大优势是对中文评测的深度支持。以下是几个核心的中文评测数据集：

### C-Eval

C-Eval 是目前最具影响力的中文大模型评测基准之一：

- **规模**：13928 道选择题
- **覆盖**：52 个学科，从中学到专业级别
- **类型**：四选一选择题
- **学科举例**：计算机科学、数学、物理、中国历史、马克思主义理论、临床医学、法律等

C-Eval 的题目来源于中国的各类考试（高考、考研、职业资格考试等），能够真实反映模型在中文知识场景下的表现。

### CMMLU

CMMLU（Chinese Massive Multitask Language Understanding）是另一个重要的中文评测基准：

- **覆盖**：67 个学科
- **特点**：更加注重中国本土知识和社会文化背景
- **题目类型**：选择题
- **与 C-Eval 的区别**：CMMLU 涵盖了一些 C-Eval 没有的学科（如中国饮食文化、传统医学），且题目来源更加多样化

### 其他中文数据集

- **C3**（Chinese Cloze and Comprehension）：中文阅读理解数据集，要求模型理解文章内容并回答问题
- **CMR**（Chinese Math Reasoning）：中文数学推理数据集，侧重于用中文表达的数学应用题
- **ChineseBench**：综合性中文能力评测，涵盖翻译、摘要、问答等任务

## LLM-as-Judge 功能

### 基本原理

LLM-as-Judge 的核心思想是使用一个能力较强的模型（Judge 模型）来评估另一个模型的输出质量。这种方法在开放式问答、创意写作、对话质量评估等场景中尤为重要，因为这些任务难以用规则化方式自动评分。

### GenericLLMEvaluator 使用

OpenCompass 内置的 `GenericLLMEvaluator` 提供了开箱即用的 Judge 功能：

```python
from opencompass.openicl.icl_inferencer import GenInferencer
from opencompass.openicl.icl_evaluator import GenericLLMEvaluator

# 配置 Judge 模型
judge = dict(
    type=GenericLLMEvaluator,
    # 使用 API 模型作为 Judge
    model=dict(
        type='OpenAI',
        path='gpt-4o',
        key='YOUR_API_KEY',
    ),
    # 评分提示词
    prompt_template=dict(
        type='prompt',
        template="""请评估以下回答的质量，从 1-10 分进行评分。
参考答案：{reference}
模型回答：{prediction}
请给出分数和简要理由：""",
    ),
)
```

### 适用场景

- **开放式问答**：答案不唯一，需要判断语义等价性
- **创意写作**：评估文本的流畅度、连贯性和创造力
- **对话质量**：评估多轮对话的上下文理解和回复质量
- **指令遵循**：判断模型是否正确遵循了复杂指令

### 局限性

- Judge 模型本身可能存在评分偏差，不同 Judge 模型的评分可能不一致
- 成本较高，特别是对大量样本进行评测时
- 对于事实性问题，基于规则的精确匹配通常更可靠

## 高级用法

### 自定义数据集

OpenCompass 支持用户自定义评测数据集。以下是一个添加自定义数据集的示例：

```python
from opencompass.datasets import CustomDataset

my_dataset = dict(
    type=CustomDataset,
    # 数据文件路径（支持 jsonl, csv, json 格式）
    path='./data/my_dataset.jsonl',
    # 数据格式定义
    reader=dict(
        type='jsonl',
        # 输入字段
        input_columns=['question'],
        # 输出字段
        output_column='answer',
    ),
    # 评测指标
    evaluator=dict(
        type='Accuracy',
    ),
)
```

### 分布式评测

对于大参数量模型或大规模数据集，OpenCompass 支持多 GPU 分布式评测：

```python
models = [
    dict(
        type=HuggingFace,
        abbr='llama3-70b',
        path='meta-llama/Meta-Llama-3-70B-Instruct',
        max_out_len=2048,
        batch_size=4,
        # 使用 4 张 GPU 进行模型推理
        run_cfg=dict(num_gpus=4),
    )
]
```

框架会自动处理模型的 Tensor Parallel 切分和数据并行。

### 结果可视化

评测完成后，OpenCompass 会生成结构化的结果文件。可以使用内置工具生成可视化报告：

```bash
# 生成 CSV 格式报告
python tools/summary.py ./results/20260613_120000/ --format csv

# 生成 HTML 可视化报告
python tools/summary.py ./results/20260613_120000/ --format html --output report.html
```

### 与 CI/CD 集成

在模型开发流程中，可以将 OpenCompass 评测集成到 CI/CD 管道中，实现模型训练后的自动评测：

```yaml
# .github/workflows/eval.yml
name: Model Evaluation
on:
  push:
    paths:
      - 'models/**'

jobs:
  evaluate:
    runs-on: [self-hosted, gpu]
    steps:
      - uses: actions/checkout@v4
      - name: Run Evaluation
        run: |
          conda activate opencompass
          opencompass configs/eval_ci.py --work-dir ./eval-results/
      - name: Upload Results
        uses: actions/upload-artifact@v4
        with:
          path: ./eval-results/
```

## 实际案例：评测中文模型的完整流程

以下是用 OpenCompass 评测 Qwen2.5-7B-Instruct 中文能力的完整步骤。

### 第一步：编写配置文件

```python
# configs/eval_qwen25_chinese.py
from opencompass.models import HuggingFace

models = [
    dict(
        type=HuggingFace,
        abbr='qwen2.5-7b-instruct',
        path='Qwen/Qwen2.5-7B-Instruct',
        max_out_len=1024,
        batch_size=8,
        run_cfg=dict(num_gpus=1),
        # 启用 chat template
        meta_template=dict(
            round=[
                dict(role='HUMAN', begin='\n<|im_start|>user\n', end='<|im_end|>'),
                dict(role='BOT', begin='\n<|im_start|>assistant\n', end='<|im_end|>', generate=True),
            ],
        ),
    )
]

datasets = [
    'ceval',      # 中文综合知识
    'cmmlu',      # 中文多学科
    'gsm8k',      # 数学推理
    'humaneval',  # 代码能力
]
```

### 第二步：运行评测

```bash
opencompass configs/eval_qwen25_chinese.py --work-dir ./results/qwen25_7b/
```

评测过程可能需要数小时，取决于硬件配置和数据集规模。框架会显示进度条和预估剩余时间。

### 第三步：查看结果

评测完成后，结果保存在工作目录中：

```bash
# 查看汇总结果
cat ./results/qwen25_7b/summary/summary_20260613.csv

# 典型输出格式
# model,ceval,cmmlu,gsm8k,humaneval
# qwen2.5-7b-instruct,83.2,81.5,85.7,79.1
```

### 第四步：对比分析

可以同时在配置文件中定义多个模型进行横向对比：

```python
models = [
    dict(
        type=HuggingFace,
        abbr='qwen2.5-7b',
        path='Qwen/Qwen2.5-7B-Instruct',
        max_out_len=1024,
        batch_size=8,
        run_cfg=dict(num_gpus=1),
    ),
    dict(
        type=HuggingFace,
        abbr='llama3-8b',
        path='meta-llama/Meta-Llama-3-8B-Instruct',
        max_out_len=1024,
        batch_size=8,
        run_cfg=dict(num_gpus=1),
    ),
]
```

运行后，框架会自动生成对比报告，直观展示不同模型在各项能力上的差异。

## 总结

OpenCompass 作为当前最活跃的中文大模型评测框架，在以下方面具有明显优势：

- **中文评测深度**：内置 C-Eval、CMMLU 等高质量中文数据集，无需额外适配
- **评测维度全面**：覆盖知识、推理、代码、数学等核心能力
- **LLM-as-Judge**：内置评估器，支持开放式任务的自动评分
- **灵活的配置体系**：从命令行到 Python 配置文件，满足不同复杂度的需求
- **活跃的社区**：持续新增数据集和功能，跟进最新的模型和评测方法

对于大模型开发者、研究者和企业用户来说，将 OpenCompass 纳入模型开发和评估流程，能够显著提升模型质量评估的效率和可信度。

## 参考链接

- GitHub 仓库：[https://github.com/open-compass/opencompass](https://github.com/open-compass/opencompass)
- 官方网站：[https://opencompass.org.cn](https://opencompass.org.cn)
- 排行榜：[https://opencompass.org.cn/leaderboard-llm](https://opencompass.org.cn/leaderboard-llm)
- 学术论文：arXiv 2605.19276
