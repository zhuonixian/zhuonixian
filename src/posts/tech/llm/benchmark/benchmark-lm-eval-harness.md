---
title: lm-evaluation-harness：开源大模型评测利器
icon: flask-vial
order: 3
date: 2026-06-13
category:
  - 技术
tag:
  - LLM
  - Benchmark
  - lm-evaluation-harness
  - EleutherAI
  - 开源工具
---

# lm-evaluation-harness：开源大模型评测利器

EleutherAI lm-evaluation-harness 是目前开源社区使用最广泛的大语言模型评测框架，GitHub 星标超过 6000，是 Hugging Face Open LLM Leaderboard 背后的核心评测引擎。无论是学术研究还是模型选型，它都是一套不可或缺的工具。

<!-- more -->

## 框架简介

lm-evaluation-harness（以下简称 lm-eval）由 EleutherAI 团队开发维护。EleutherAI 是一家专注于 AI 开源研究的非营利实验室，曾发布过 GPT-Neo、GPT-J、GPT-NeoX、Pythia 等知名开源模型。

lm-eval 的核心目标是为大语言模型提供一个**统一、可复现、可扩展**的评测管道。截至目前，框架内置了 60 余个学术基准测试（benchmark），涵盖了常识推理、数学、编程、知识理解等多个维度。

Hugging Face 官方的 Open LLM Leaderboard 正是基于 lm-eval 搭建。所有提交到 Leaderboard 的模型都会通过 lm-eval 跑一组固定任务，确保评分标准一致、结果可比较。

在模型后端方面，lm-eval 支持以下加载方式：

- **HuggingFace Transformers** — 直接从 Hub 加载权重，兼容大多数开源模型
- **vLLM** — 高性能推理后端，评测速度可提升 20 倍以上
- **TGI (Text Generation Inference)** — Hugging Face 官方的推理服务后端
- **OpenAI 兼容 API** — 可对接任意兼容 OpenAI 接口的服务

## 核心特性

### 统一的评测管道

lm-eval 将评测流程抽象为「任务（Task）」和「模型（Model）」两个正交维度。同一个任务可以无缝切换不同模型，同一个模型也可以灵活组合不同任务。这种设计避免了「每个团队各写一套评测脚本」的重复劳动。

### Few-shot 与 Zero-shot

框架原生支持 zero-shot 和 few-shot 两种评测模式。通过 `--num_fewshot` 参数即可控制示例数量。任务配置文件中也可以预设默认的 few-shot 数量，方便复现论文中的评测设置。

### 生成式与判别式任务

lm-eval 同时支持两类任务范式：

- **判别式（Multiple Choice）** — 模型计算各候选选项的 log-likelihood，选择概率最高的一项。MMLU、HellaSwag、ARC 等任务属于此类。
- **生成式（Generation）** — 模型自由生成文本，通过后处理和指标函数评分。GSM8K、HumanEval 等任务属于此类。

### 任务版本管理

每个任务都有版本号。当任务配置、数据集或评分逻辑更新时，版本号会递增。这意味着即使评测基准本身发生变化，通过指定版本号仍然可以精确复现历史结果。

### 结果缓存与复现性

lm-eval 会将评测结果以 JSON 格式保存，包含模型名称、任务配置、每个样本的原始输出等完整信息。配合固定的随机种子和版本管理，可以确保任何人在任何时间复现同一组实验。

## 安装与配置

通过 pip 安装最新稳定版：

```bash
pip install lm-eval
```

如果需要使用最新开发版或参与贡献，可以从源码安装：

```bash
git clone https://github.com/EleutherAI/lm-evaluation-harness
cd lm-evaluation-harness
pip install -e .
```

安装完成后，可以通过以下命令验证：

```bash
lm_eval --version
lm_eval --tasks list
```

`--tasks list` 会输出所有可用任务的列表，方便查找需要评测的基准。

如果需要使用 vLLM 后端，需要额外安装 vLLM：

```bash
pip install lm-eval[vllm]
# 或
pip install vllm
```

## 基本使用

### 评测单个模型

最基本的使用方式是通过命令行指定模型、后端和任务：

```bash
lm_eval --model hf \
    --model_args pretrained=Qwen/Qwen2.5-7B-Instruct \
    --tasks mmlu,gsm8k,humaneval \
    --batch_size 8
```

参数说明：

- `--model hf` — 使用 HuggingFace Transformers 后端加载模型
- `--model_args` — 传递给模型后端的参数，`pretrained` 指定 HuggingFace Hub 上的模型 ID 或本地路径
- `--tasks` — 逗号分隔的任务列表
- `--batch_size` — 推理批大小，设为 `auto` 可自动搜索最优值

### 使用 vLLM 后端加速

对于参数量较大的模型，vLLM 后端可以显著缩短评测时间：

```bash
lm_eval --model vllm \
    --model_args pretrained=Qwen/Qwen2.5-7B-Instruct \
    --tasks mmlu \
    --batch_size auto
```

只需将 `--model` 从 `hf` 改为 `vllm`，其余参数保持不变。vLLM 会利用 PagedAttention 等优化技术，推理吞吐量远超原生 Transformers。

### 配置 Few-shot

```bash
lm_eval --model hf \
    --model_args pretrained=Qwen/Qwen2.5-7B-Instruct \
    --tasks mmlu \
    --num_fewshot 5
```

`--num_fewshot` 会覆盖任务默认的 few-shot 设置。如果省略该参数，lm-eval 会使用任务配置中的默认值。

### 保存评测结果

```bash
lm_eval --model hf \
    --model_args pretrained=Qwen/Qwen2.5-7B-Instruct \
    --tasks mmlu \
    --output_path ./results/ \
    --log_samples
```

- `--output_path` — 指定结果保存目录
- `--log_samples` — 记录每个样本的模型输出，便于后续分析

结果文件为 JSON 格式，包含各任务的指标值、样本级详情和运行配置。

## Python API 使用

除了命令行，lm-eval 还提供了 Python API，方便集成到自动化评测流水线中：

```python
import lm_eval
from lm_eval.tasks import TaskManager

# 基本评测
results = lm_eval.simple_evaluate(
    model="hf",
    model_args="pretrained=Qwen/Qwen2.5-7B-Instruct",
    tasks=["mmlu", "gsm8k", "hellaswag"],
    num_fewshot=0,
    batch_size=8,
)

# 查看结果
for task_name, task_results in results["results"].items():
    print(f"\n{task_name}:")
    for metric, value in task_results.items():
        print(f"  {metric}: {value:.4f}")
```

`simple_evaluate` 是最便捷的入口函数。如果需要更精细的控制（如自定义任务管理、多轮评测等），可以使用底层的 `evaluator.evaluate` 函数。

以下是使用 TaskManager 管理自定义任务的示例：

```python
from lm_eval.tasks import TaskManager, include_task_folder

# 加载自定义任务目录
task_manager = TaskManager(include_path="./my_tasks")

results = lm_eval.simple_evaluate(
    model="hf",
    model_args="pretrained=Qwen/Qwen2.5-7B-Instruct",
    tasks=["my_custom_task"],
    task_manager=task_manager,
    batch_size=8,
)
```

## 常用评测任务

以下表格列出了 lm-eval 中最常用的评测基准及其基本信息：

| 任务名 | 评测维度 | 题量 | 推荐 Few-shot | 指标 |
|--------|---------|------|:------------:|------|
| MMLU | 多领域知识理解 | 14,042 | 5 | acc |
| MMLU-Pro | 进阶知识推理 | 12,032 | 5 | acc |
| GSM8K | 小学数学应用题 | 1,319 | 8 | acc |
| MATH | 竞赛数学 | 5,000 | 4 | exact_match |
| HumanEval | Python 代码生成 | 164 | 0 | pass@1 |
| HellaSwag | 常识句子补全 | 10,042 | 10 | acc |
| ARC-Challenge | 科学推理 | 1,172 | 25 | acc |
| TruthfulQA | 事实准确性 | 817 | 6 | mc2 |
| IFEval | 指令遵循能力 | 541 | 0 | strict_acc |
| BBH | 综合推理 | 6,500 | 3 | exact_match |
| WinoGrande | 共指消解/常识推理 | 1,267 | 10 | acc |

几点说明：

- **HumanEval** 使用 zero-shot，因为 few-shot 示例与测试题目格式高度相似，容易泄露答案
- **IFEval** 同样推荐 zero-shot，评测的是模型对指令格式的遵循程度
- **MATH** 和 **BBH** 的 exact_match 指标要求模型输出与标准答案完全匹配（经过标准化处理）
- **TruthfulQA** 的 mc2 指标是多重选择变体，评估模型在事实性问题上选择正确答案的概率

## 自定义评测任务

lm-eval 支持通过 YAML 配置文件定义自定义任务，无需编写 Python 代码即可接入新的评测数据集。

### YAML 配置示例

以下是一个自定义任务的完整配置：

```yaml
task: my_custom_task
dataset_path: json
dataset_kwargs:
  data_files:
    test: my_data.jsonl
output_type: generate_until
generation_kwargs:
  until:
    - "\n"
    - "</s>"
  max_gen_toks: 128
test_split: test
doc_to_text: "问题：{{question}}\n答案："
doc_to_target: "{{answer}}"
metric_list:
  - metric: exact_match
    aggregation: mean
    higher_is_better: true
  - metric: bleu
    aggregation: mean
    higher_is_better: true
```

字段说明：

- `task` — 任务名称，命令行通过此名称引用
- `dataset_path` — 数据集来源，支持 HuggingFace datasets 格式或本地文件
- `output_type` — 任务类型，`generate_until` 为生成式，`multiple_choice` 为判别式
- `doc_to_text` — 输入模板，使用 Jinja2 语法引用数据集字段
- `doc_to_target` — 标准答案模板
- `metric_list` — 评测指标列表

### 数据文件格式

数据文件为 JSONL 格式，每行一个 JSON 对象：

```json
{"question": "中国的首都是哪里？", "answer": "北京"}
{"question": "光速约为多少 km/s？", "answer": "300000"}
```

### 注册自定义任务

将 YAML 文件放在某个目录下，然后通过 `--include_path` 参数指定：

```bash
lm_eval --model hf \
    --model_args pretrained=Qwen/Qwen2.5-7B-Instruct \
    --tasks my_custom_task \
    --include_path ./my_tasks/ \
    --batch_size 8
```

lm-eval 会扫描指定目录下的所有 YAML 文件并注册其中定义的任务。

## 与 HuggingFace Leaderboard 的关系

Hugging Face Open LLM Leaderboard 是目前最具影响力的开源模型排行榜之一。它的工作原理如下：

1. **底层引擎** — Leaderboard 的评测完全由 lm-evaluation-harness 驱动
2. **固定任务集** — 评测任务经过官方选定，确保跨模型的可比性
3. **标准化环境** — 所有模型在相同的硬件和软件环境中运行，消除环境差异

### 提交模型到 Leaderboard

提交流程分为以下几步：

1. 将模型权重上传到 HuggingFace Hub（需要公开访问）
2. 在 Leaderboard 页面提交模型名称
3. 系统自动排队，使用 lm-eval 运行评测任务集
4. 评测完成后，结果会自动出现在排行榜上

整个评测过程不需要本地运行任何代码。如果你的模型已经托管在 HuggingFace Hub 上，只需几步点击即可完成提交。

## 性能优化技巧

### 使用 vLLM 后端

对于单机评测，将 `--model` 从 `hf` 切换为 `vllm` 是最直接有效的优化手段。vLLM 的 PagedAttention 和连续批处理技术可以将推理速度提升 10 到 20 倍，尤其对于 7B 以上的大模型效果显著。

### 自动批大小调优

将 `--batch_size` 设为 `auto`，lm-eval 会自动从大到小搜索最优批大小，在显存允许的范围内最大化吞吐量。这比手动试错效率更高。

### 多 GPU 并行评测

对于需要加载大模型（如 70B 参数）的场景，可以使用设备映射将模型分布到多张 GPU 上：

```bash
lm_eval --model hf \
    --model_args pretrained=Qwen/Qwen2.5-72B-Instruct,parallelize=True \
    --tasks mmlu \
    --batch_size auto
```

`parallelize=True` 会自动使用 `device_map="auto"` 将模型分布到所有可用 GPU。

### 其他优化建议

- **使用半精度** — `dtype=bfloat16` 或 `dtype=float16` 减少显存占用
- **提前下载模型** — 避免评测过程中因网络问题中断
- **分批评测** — 对于大量任务，可以分批运行，避免单次评测时间过长

## 实际评测示例：评测本地模型

以下是一个评测本地微调模型的完整流程。

### 1. 准备模型

假设你有一个通过 LoRA 微调的 Qwen2.5-7B 模型，权重已保存到 `./my_model/`。

### 2. 运行评测

```bash
lm_eval --model hf \
    --model_args pretrained=./my_model/ \
    --tasks mmlu,gsm8k,hellaswag,arc_challenge,truthfulqa_mc2 \
    --num_fewshot 0 \
    --batch_size auto \
    --output_path ./eval_results/ \
    --log_samples
```

### 3. 查看结果

评测完成后，结果保存在 `./eval_results/` 目录下。文件名包含时间戳，格式为 JSON。可以用以下脚本快速提取关键指标：

```python
import json
from pathlib import Path

result_files = sorted(Path("./eval_results/").glob("*.json"))
latest = result_files[-1]

with open(latest) as f:
    data = json.load(f)

for task, metrics in data["results"].items():
    acc = metrics.get("acc,none") or metrics.get("exact_match,none") or metrics.get("acc_norm,none")
    if acc is not None:
        print(f"{task}: {acc:.4f}")
```

### 4. 与基线对比

通常需要与基线模型（如微调前的原始模型）对比，以验证微调效果。分别评测两个模型后，对比各任务的指标变化即可。

## 总结

lm-evaluation-harness 为大模型评测提供了一套成熟、标准化的解决方案。它的核心价值在于：

- **标准化** — 统一的任务定义和评测流程，消除「各评各的」的混乱局面
- **可复现** — 版本管理、结果缓存、固定种子，确保实验可重复
- **易扩展** — YAML 配置即可添加自定义任务，Python API 支持深度定制
- **生态集成** — 作为 HuggingFace Leaderboard 的底层引擎，评测结果具有行业公信力

无论你是模型开发者需要验证训练效果，还是应用工程师需要对比不同模型的优劣，lm-eval 都是值得掌握的工具。

相关链接：

- GitHub 仓库：<https://github.com/EleutherAI/lm-evaluation-harness>
- 文档站：<https://lm-evaluation-harness.readthedocs.io>
- HuggingFace Open LLM Leaderboard：<https://huggingface.co/spaces/open-llm-leaderboard/open_llm_leaderboard>
