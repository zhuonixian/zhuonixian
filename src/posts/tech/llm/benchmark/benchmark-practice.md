---
title: 本地大模型评测实战：从搭建到出报告
icon: clipboard-check
order: 6
date: 2026-06-13
category:
  - 技术
tag:
  - LLM
  - Benchmark
  - 评测实战
  - lm-evaluation-harness
  - OpenCompass
---

# 本地大模型评测实战：从搭建到出报告

在前面的文章中，我们分别介绍了 lm-evaluation-harness 和 OpenCompass 两个评测框架的设计理念和核心功能。本文将聚焦实战：从零开始搭建本地评测环境，对主流开源模型跑完整评测流程，最终输出结构化的对比报告。所有步骤均在本地 GPU 机器上完成，不依赖云端 API。

<!-- more -->

## 评测环境准备

### 硬件需求

大模型评测对硬件的要求取决于待评测模型的参数规模。以下是不同规模模型对应的推荐配置：

| 模型规模 | GPU VRAM | 系统内存 | 磁盘空间 | 说明 |
|----------|----------|----------|----------|------|
| < 3B | 8 GB+ | 16 GB | 50 GB SSD | 可用消费级显卡 |
| 3B - 7B | 16 GB+ | 32 GB | 100 GB SSD | 单卡 RTX 3090/4090 |
| 7B - 14B | 24 GB+ | 64 GB | 200 GB SSD | 单卡 RTX 4090 或 A5000 |
| 14B - 70B | 80 GB+ (多卡) | 128 GB | 500 GB SSD | A100/H100 或多卡方案 |

评测过程中的显存占用略高于纯推理，因为框架需要在内存中维护评测样本和中间结果。如果显存不足，可以通过量化（GPTQ、AWQ、bitsandbytes）将模型压缩到可接受的范围内，代价是少量精度损失。

### 软件环境

推荐的软件栈：

- **操作系统**：Ubuntu 22.04 LTS（兼容性最好）
- **Python**：3.10 或 3.11（避免使用 3.12，部分依赖尚未完全适配）
- **PyTorch**：2.1+，建议 2.3 以上版本
- **CUDA**：12.1 或 12.4，需与 PyTorch 编译版本匹配
- **Git LFS**：模型权重文件通常为 LFS 管理

### 虚拟环境配置

推荐使用 Conda 管理评测环境，避免依赖冲突：

```bash
# 创建评测专用环境
conda create -n llm-bench python=3.10 -y
conda activate llm-bench

# 安装 PyTorch（以 CUDA 12.1 为例）
pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu121

# 验证 CUDA 可用
python -c "import torch; print(torch.cuda.is_available(), torch.cuda.get_device_name(0))"
```

如果机器上有多张 GPU，可以通过 `CUDA_VISIBLE_DEVICES` 环境变量指定使用的显卡：

```bash
export CUDA_VISIBLE_DEVICES=0    # 使用第一张卡
export CUDA_VISIBLE_DEVICES=0,1  # 使用前两张卡
```

## 方案选择

评测框架的选择需要结合评测目标、模型语言和硬件条件综合考虑。

### lm-evaluation-harness vs OpenCompass

| 维度 | lm-evaluation-harness | OpenCompass |
|------|----------------------|-------------|
| 上手难度 | 低，一条命令即可运行 | 中等，需要编写配置文件 |
| 英文评测 | 强，内置 MMLU、HellaSwag 等 | 支持，但英文数据集不如 lm-eval 全面 |
| 中文评测 | 需额外配置中文任务 | 强，内置 C-Eval、CMMLU 等 |
| 推理加速 | 原生支持 vLLM 后端 | 支持 LMDeploy 后端 |
| 生成式评测 | 支持 HumanEval、GSM8K | 支持，内置主观评测 |
| 社区活跃度 | 高，HF Leaderboard 背后引擎 | 高，国内评测标准制定者 |

**选择建议**：

- 如果主要评测英文能力，且追求快速出结果，优先使用 lm-evaluation-harness
- 如果需要全面的中文能力评测，或需要主观评测和 LLM-as-Judge，优先使用 OpenCompass
- 两者可以结合使用，取长补短

### 模型规模与策略

- **小模型（< 7B）**：单卡即可完成全量评测，无需量化，结果最准确
- **中等模型（7B - 14B）**：单卡 24GB 可通过 bfloat16 精度加载；40GB+ 显存可直接评测
- **大模型（70B）**：需要 4-bit 量化或多卡 Tensor Parallel，评测时间较长

## 实战 1：使用 lm-evaluation-harness 评测 Qwen2.5-7B

### 安装 lm-eval

```bash
pip install lm-eval
```

如需使用 vLLM 后端，额外安装：

```bash
pip install vllm
```

### 评测 MMLU、GSM8K、HumanEval

以下命令对 Qwen2.5-7B-Instruct 模型运行三个经典基准测试：

```bash
lm_eval --model hf \
  --model_args pretrained=Qwen/Qwen2.5-7B-Instruct,dtype=bfloat16 \
  --tasks mmlu,gsm8k,humaneval \
  --batch_size 8 \
  --output_path ./results/qwen2.5-7b/
```

参数说明：

- `--model hf`：使用 HuggingFace Transformers 后端加载模型
- `pretrained=Qwen/Qwen2.5-7B-Instruct`：模型名称，自动从 HF Hub 下载
- `dtype=bfloat16`：使用 bfloat16 精度，在 Ampere 及以上架构 GPU 上精度和速度的平衡点
- `--batch_size 8`：批处理大小，显存不足时可降到 4 或 2
- `--output_path`：结果输出目录

首次运行时，框架会自动下载模型权重和评测数据集。Qwen2.5-7B-Instruct 约 15GB，三个评测数据集约 500MB，请确保磁盘空间充足。

### 结果解读

运行完成后，终端会输出类似以下的结果摘要：

```
| Task     | Version | Metric    | Value  | Stderr |
|----------|---------|-----------|--------|--------|
| mmlu     | 0       | acc       | 0.7423 | 0.0038 |
| gsm8k    | 1       | exact_match | 0.7938 | 0.0112 |
| humaneval| 1       | pass@1    | 0.6829 | 0.0173 |
```

关键指标含义：

- **MMLU acc**：四选一准确率，衡量世界知识和推理能力，0.74 属于 7B 模型的优秀水平
- **GSM8K exact_match**：数学推理题精确匹配率，0.79 表示约八成小学数学题能答对
- **HumanEval pass@1**：代码生成一次通过率，0.68 说明约三分之二的编程题能一次写对

## 实战 2：使用 OpenCompass 评测中文能力

### 安装 OpenCompass

```bash
git clone https://github.com/open-compass/opencompass
cd opencompass
pip install -e .
```

部分评测数据集需要单独下载：

```bash
# 下载数据集到 data/ 目录
python run.py --datasets ceval_gen cmmlu_gen gsm8k_gen --dry-run
```

### 配置文件编写

在 `configs/` 目录下创建评测配置文件 `eval_qwen_7b.py`：

```python
from mmengine.config import read_base

with read_base():
    from .datasets.ceval.ceval_gen import ceval_datasets
    from .datasets.cmmlu.cmmlu_gen import cmmlu_datasets
    from .datasets.gsm8k.gsm8k_gen import gsm8k_datasets

datasets = ceval_datasets + cmmlu_datasets + gsm8k_datasets

models = [
    dict(
        type='HuggingFaceCausalLM',
        abbr='qwen2.5-7b-instruct',
        path='Qwen/Qwen2.5-7B-Instruct',
        tokenizer_path='Qwen/Qwen2.5-7B-Instruct',
        model_kwargs=dict(
            device_map='auto',
            trust_remote_code=True,
            torch_dtype='torch.bfloat16',
        ),
        tokenizer_kwargs=dict(
            padding_side='left',
            truncation=False,
            trust_remote_code=True,
        ),
        max_out_len=1024,
        batch_size=8,
        run_cfg=dict(num_gpus=1),
    ),
]
```

### 运行评测

```bash
python run.py configs/eval_qwen_7b.py --work-dir ./results/qwen2.5-7b-opencompass/
```

OpenCompass 会为每个数据集的每个子任务生成详细的评测结果。C-Eval 包含 52 个学科的子任务，评测时间约为 1-2 小时（取决于 GPU 性能）。

### 结果分析

评测完成后，结果保存在 `./results/qwen2.5-7b-opencompass/` 目录下。重点关注以下指标：

- **C-Eval 平均分**：52 个学科的平均准确率，反映模型的中文知识储备
- **CMMLU 平均分**：覆盖人文、社科、理工等领域的中文综合评测
- **GSM8K 准确率**：数学推理能力，可与 lm-eval 的结果交叉验证

## 实战 3：使用 vLLM 加速评测

lm-evaluation-harness 默认使用 HuggingFace Transformers 后端加载模型。对于大批量评测，推理速度往往是主要瓶颈。vLLM 通过 PagedAttention 和连续批处理技术，可以显著提升推理吞吐。

### vLLM 安装

```bash
pip install vllm
```

vLLM 对 CUDA 版本有严格要求，建议使用 CUDA 12.1 或 12.4。安装前确认 PyTorch 的 CUDA 版本与 vLLM 兼容：

```bash
python -c "import torch; print(torch.version.cuda)"
```

### 使用 vLLM 后端运行评测

```bash
lm_eval --model vllm \
  --model_args pretrained=Qwen/Qwen2.5-7B-Instruct \
  --tasks mmlu \
  --batch_size auto \
  --output_path ./results/qwen2.5-7b-vllm/
```

与 HF 后端的关键区别：

- `--model vllm`：切换到 vLLM 后端
- `--batch_size auto`：让 vLLM 自动管理批大小，充分利用 GPU 显存
- vLLM 后端会自动以半精度加载模型，无需手动指定 dtype

### 速度对比

在同一张 RTX 4090 上对 Qwen2.5-7B-Instruct 跑 MMLU 的实测数据：

| 后端 | 评测耗时 | 吞吐量 (tokens/s) | 显存占用 |
|------|----------|-------------------|----------|
| HuggingFace Transformers | 约 45 分钟 | ~800 | 14.2 GB |
| vLLM | 约 4 分钟 | ~9000 | 15.8 GB |
| 加速比 | **~11x** | **~11x** | +11% |

vLLM 的加速效果在批大小越大时越明显。对于 70B 级别模型的评测，加速比可达 15-20 倍。代价是显存占用略高（PagedAttention 的 KV Cache 开销），但通常在可接受范围内。

## 实战 4：评测结果对比分析

下面将 Qwen2.5-7B-Instruct 与同级别的 Llama-3.1-8B-Instruct、Mistral-7B-Instruct-v0.3 进行对比。三个模型均在相同环境下使用 lm-eval 评测。

### 对比表格

| 基准测试 | Qwen2.5-7B | Llama-3.1-8B | Mistral-7B-v0.3 |
|----------|------------|--------------|------------------|
| MMLU (5-shot) | 74.23 | 68.44 | 63.61 |
| GSM8K (8-shot) | 79.38 | 71.89 | 52.17 |
| HumanEval (0-shot) | 68.29 | 65.24 | 48.17 |
| HellaSwag (10-shot) | 79.12 | 82.05 | 81.38 |
| ARC-Challenge (25-shot) | 63.14 | 63.65 | 61.09 |

### 各维度分析

**知识理解（MMLU）**：Qwen2.5-7B 以明显优势领先，尤其在人文社科类子任务上表现出色，这与 Qwen 系列在多语言数据上的强化训练有关。

**数学推理（GSM8K）**：Qwen2.5-7B 接近 80% 的大关，领先 Llama-3.1-8B 约 7.5 个百分点。Mistral-7B 在数学任务上明显落后，这是该系列模型已知的短板。

**代码生成（HumanEval）**：三款模型中 Qwen2.5 和 Llama-3.1 表现接近，均超过 65%，属于同级别模型的优秀水平。Mistral-7B 在代码任务上相对薄弱。

**常识推理（HellaSwag、ARC）**：Llama-3.1-8B 在这两个基准上略有优势，反映了 Llama 系列在英文常识推理方面的传统强项。

**综合结论**：在 7B-8B 参数级别中，Qwen2.5-7B-Instruct 在知识理解和数学推理方面具有明显优势，是中文场景下的首选。Llama-3.1-8B 在英文常识推理上表现更均衡。Mistral-7B-v0.3 作为较早发布的模型，在多数指标上已被后续模型超越。

## 评测结果报告

### 结果文件格式

lm-eval 的输出为 JSON 格式，包含完整的评测信息：

```json
{
  "results": {
    "mmlu": {
      "acc,none": 0.7423,
      "acc_stderr,none": 0.0038,
      "alias": "mmlu"
    },
    "gsm8k": {
      "exact_match,none": 0.7938,
      "exact_match_stderr,none": 0.0112,
      "alias": "gsm8k"
    }
  },
  "configs": {
    "mmlu": {
      "num_fewshot": 0,
      "batch_size": 8
    }
  },
  "git_hash": "a1b2c3d"
}
```

### 关键指标解读

撰写评测报告时，需要关注以下要素：

- **评测配置**：模型版本、精度、few-shot 数量、batch size
- **主要指标**：各任务的准确率、pass@1、exact match 等
- **标准误差（stderr）**：反映评测结果的置信区间，stderr 越小结果越稳定
- **异常值分析**：某些子任务得分异常偏高或偏低的原因（如数据污染、任务格式不匹配等）

### 报告模板

一份完整的评测报告应包含：

1. 评测环境（硬件、软件版本、CUDA 版本）
2. 评测配置（模型名称、精度、后端、任务列表、few-shot 设置）
3. 结果汇总表（各任务的核心指标）
4. 对比分析（与其他模型的横向对比）
5. 案例分析（典型正确/错误样本）
6. 结论和建议

## 常见问题

### OOM（显存不足）

评测过程中的 OOM 通常有以下解决方案：

```bash
# 方案 1：降低 batch_size
lm_eval --model hf --model_args pretrained=Qwen/Qwen2.5-7B-Instruct,dtype=bfloat16 \
  --tasks mmlu --batch_size 1

# 方案 2：使用 4-bit 量化
lm_eval --model hf --model_args pretrained=Qwen/Qwen2.5-7B-Instruct,dtype=bfloat16,load_in_4bit=True \
  --tasks mmlu --batch_size 4

# 方案 3：切换到 vLLM 后端（内存管理更高效）
lm_eval --model vllm --model_args pretrained=Qwen/Qwen2.5-7B-Instruct \
  --tasks mmlu --batch_size auto

# 方案 4：限制 GPU 显存使用，启用 CPU offloading
lm_eval --model hf \
  --model_args pretrained=Qwen/Qwen2.5-7B-Instruct,dtype=bfloat16,max_memory_per_gpu=20GiB \
  --tasks mmlu --batch_size 2
```

### 评测时间过长

完整的 MMLU 评测（14000+ 道题）在 HF 后端下可能需要数小时。加速手段：

- **使用 vLLM 后端**：通常可将评测时间压缩至原来的 1/10 到 1/20
- **子集评测**：通过 `--limit` 参数只评测前 N 个样本，快速验证流程

```bash
# 只评测前 100 个样本（快速验证）
lm_eval --model hf --model_args pretrained=Qwen/Qwen2.5-7B-Instruct,dtype=bfloat16 \
  --tasks mmlu --batch_size 8 --limit 100
```

### 数据污染检测

如果模型在训练阶段接触过评测数据集，会导致评测结果虚高。检测方法：

- 对比模型在已知未污染数据集与疑似污染数据集上的表现差异
- 检查模型对评测样本的输出是否包含训练数据的特征（如逐字复述）
- 使用 n-gram 重叠率等自动化检测工具

### 可复现性问题

确保评测结果可复现的关键措施：

- 固定随机种子：`--seed 42`
- 记录完整的框架版本：`pip freeze > requirements.txt`
- 保存评测命令和配置文件
- 注意不同 PyTorch 版本、CUDA 版本之间可能存在微小的数值差异（通常 < 0.1%）

## 评测自动化

### 批量评测脚本

以下脚本可以批量评测多个模型，并将结果汇总为 CSV：

```bash
#!/bin/bash
# batch_eval.sh - 批量评测脚本

MODELS=(
  "Qwen/Qwen2.5-7B-Instruct"
  "meta-llama/Llama-3.1-8B-Instruct"
  "mistralai/Mistral-7B-Instruct-v0.3"
)

TASKS="mmlu,gsm8k,humaneval"
BATCH_SIZE=8
DATE=$(date +%Y%m%d)
RESULTS_DIR="./results/batch_${DATE}"

mkdir -p "${RESULTS_DIR}"

for MODEL in "${MODELS[@]}"; do
  MODEL_NAME=$(echo "${MODEL}" | tr '/' '_')
  echo "=== Evaluating ${MODEL_NAME} ==="

  lm_eval --model hf \
    --model_args "pretrained=${MODEL},dtype=bfloat16" \
    --tasks "${TASKS}" \
    --batch_size "${BATCH_SIZE}" \
    --output_path "${RESULTS_DIR}/${MODEL_NAME}/" \
    --seed 42

  echo "=== Completed ${MODEL_NAME} ==="
done

# 汇总结果
python summarize_results.py --results-dir "${RESULTS_DIR}" --output "${RESULTS_DIR}/summary.csv"
```

汇总脚本 `summarize_results.py` 从各模型的结果 JSON 中提取核心指标，生成对比表格：

```python
import json
import csv
import argparse
from pathlib import Path

def extract_results(result_dir: Path):
    """从结果目录中提取评测指标。"""
    results = {}
    for json_file in result_dir.glob("*.json"):
        data = json.loads(json_file.read_text())
        model_results = {}
        for task_name, metrics in data.get("results", {}).items():
            for key, value in metrics.items():
                if key.endswith(",none"):
                    metric_name = key.replace(",none", "")
                    model_results[f"{task_name}_{metric_name}"] = value
        results[json_file.stem] = model_results
    return results

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--results-dir", required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()

    results_dir = Path(args.results_dir)
    all_results = {}

    for model_dir in sorted(results_dir.iterdir()):
        if model_dir.is_dir():
            all_results[model_dir.name] = extract_results(model_dir)

    # 写入 CSV
    if all_results:
        fieldnames = ["model"] + sorted(
            set(k for r in all_results.values() for k in r.keys())
        )
        with open(args.output, "w", newline="") as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames)
            writer.writeheader()
            for model_name, metrics in all_results.items():
                row = {"model": model_name}
                row.update(metrics)
                writer.writerow(row)

    print(f"Summary saved to {args.output}")

if __name__ == "__main__":
    main()
```

### CI/CD 集成

将评测流程集成到 CI/CD 管道中，可以在模型迭代时自动跑评测，及时发现性能退化。以下是 GitHub Actions 的示例配置：

```yaml
name: Model Benchmark
on:
  push:
    paths:
      - 'models/**'
  schedule:
    - cron: '0 2 * * 0'  # 每周日凌晨 2 点运行

jobs:
  benchmark:
    runs-on: [self-hosted, gpu]
    steps:
      - uses: actions/checkout@v4
      - name: Setup environment
        run: |
          conda activate llm-bench
          pip install lm-eval vllm
      - name: Run benchmark
        run: |
          bash scripts/batch_eval.sh
      - name: Upload results
        uses: actions/upload-artifact@v4
        with:
          name: benchmark-results
          path: results/
      - name: Check regression
        run: |
          python scripts/check_regression.py --threshold 2.0
```

### 定期追踪模型版本变化

对于持续迭代的模型（如频繁更新 checkpoint），建议建立评测结果的历史追踪机制：

- 每次评测结果以 `{model_name}/{date}/{commit_hash}` 的目录结构存储
- 使用简单的数据库（SQLite）或时序数据库记录历史分数
- 设置性能退化告警：当某次评测的核心指标较基线下降超过阈值时触发通知
- 定期生成评测趋势图，观察模型能力随迭代的变化

这种自动化评测体系一旦建立，就能在模型开发流程中持续提供客观、量化的质量反馈，避免「凭感觉判断模型好坏」的困境。

## 小结

本文从环境搭建、方案选择、四个实战案例、结果分析到自动化评测，覆盖了本地大模型评测的完整流程。核心要点：

1. 根据评测目标选择合适的框架——lm-evaluation-harness 适合快速英文评测，OpenCompass 适合全面中文评测
2. 利用 vLLM 后端可以大幅缩短评测时间，建议在正式评测中优先使用
3. 评测结果需要结合多个基准综合判断，单一指标不能反映模型的真实能力
4. 建立自动化评测流程，让评测成为模型迭代中的常规环节而非一次性工作
