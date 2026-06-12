---
title: 大模型评测框架对比与选型指南
icon: scale-balanced
order: 2
date: 2026-06-13
category:
  - 技术
tag:
  - LLM
  - Benchmark
  - lm-evaluation-harness
  - OpenCompass
  - Promptfoo
  - DeepEval
---

# 大模型评测框架对比与选型指南

大模型评测是模型研发和应用落地中不可或缺的环节。从学术研究中的基准测试，到工程实践中的应用评测，不同场景需要不同的评测工具。本文系统梳理主流评测框架的定位、功能和适用场景，帮助读者做出合理的选型决策。

<!-- more -->

## 评测框架全景

大模型评测框架可以按照用途分为以下几个层次：

**学术基准评测**

学术基准评测关注模型的基础能力，如知识储备、推理能力、语言理解等，通常使用标准化的数据集和评测协议。代表框架包括：

- **lm-evaluation-harness** -- EleutherAI 开源的评测框架，是 HuggingFace Open LLM Leaderboard 的默认后端，支持 60+ 标准基准数据集。
- **OpenCompass** -- 上海人工智能实验室开源的一站式评测平台，支持 100+ 数据集，对中文模型有深度支持。

**应用评测**

应用评测关注模型在实际业务场景中的表现，评测维度更加贴近真实使用体验。代表框架包括：

- **Promptfoo** -- 定位为 LLM 应用的测试框架，类似于"大模型的单元测试"，擅长 Prompt 模板测试和模型横向对比。
- **DeepEval** -- LLM 输出质量评测框架，内置 Answer Relevance、Faithfulness、Hallucination 等指标，适合持续集成场景。
- **RAGAS** -- 专门面向 RAG（检索增强生成）系统的评测框架，提供 Context Precision、Faithfulness 等核心指标。

**综合平台**

综合平台提供模型排名和众包评测能力：

- **HuggingFace Open LLM Leaderboard** -- 基于 lm-evaluation-harness 的自动化排行榜，是开源模型选型的重要参考。
- **Chatbot Arena (LMSYS)** -- 基于人类偏好对战的评测平台，通过 ELO 评分反映模型的实际对话体验。

**商业评测平台**

商业平台提供评测、监控和可观测性的一体化解决方案：

- **LangSmith** -- LangChain 团队推出的平台，支持 Trace、评测和数据集管理。
- **Braintrust** -- 面向 AI 工程的评测和实验管理平台。
- **Weights & Biases Weave** -- W&B 推出的 LLM 评测和可观测性工具。

## 框架详细对比

| 维度 | lm-evaluation-harness | OpenCompass | Promptfoo | DeepEval | RAGAS |
|------|----------------------|-------------|-----------|----------|-------|
| 定位 | 学术基准 | 一站式平台 | 应用测试 | 应用评测 | RAG 评测 |
| 开源 | 是 | 是 | 是 | 是 | 是 |
| 内置基准数 | 60+ | 100+ | 自定义 | 自定义 | RAG 专项 |
| 中文支持 | 有限 | 深度 | 支持 | 支持 | 支持 |
| 易用性 | 中 | 中 | 高 | 高 | 高 |
| 扩展性 | 高 | 高 | 高 | 高 | 中 |
| 评测方式 | 自动评测 | 自动+LLM-as-Judge | 自动+LLM-as-Judge | LLM-as-Judge | LLM-as-Judge |
| 社区活跃度 | 高 | 高 | 高 | 中 | 高 |
| 典型用户 | 研究者 | 中文社区 | 工程师 | 工程师 | RAG 开发者 |

## lm-evaluation-harness 详解

lm-evaluation-harness（简称 lm-eval）由 EleutherAI 开发维护，是目前学术界最广泛使用的 LLM 评测框架之一。它也是 HuggingFace Open LLM Leaderboard 的核心评测引擎。

**适用场景**

- 学术研究论文中的模型评测
- 向 HuggingFace Leaderboard 提交模型评分
- 模型选型时进行标准化能力对比

**优势**

- **标准化程度高** -- 严格的评测协议确保结果可复现，被学术界广泛认可。
- **社区认可度高** -- EleutherAI 和 HuggingFace 双重背书，评测结果具有权威性。
- **HF 生态集成** -- 无缝对接 HuggingFace Transformers 模型，支持 vLLM、llama.cpp 等推理后端。
- **丰富的基准数据集** -- 内置 MMLU、HellaSwag、ARC、TruthfulQA、WinoGrande 等 60+ 标准基准。

**劣势**

- **中文支持有限** -- 内置数据集以英文为主，中文基准覆盖不足。
- **配置相对复杂** -- 任务配置采用 YAML + Python 函数注册机制，上手需要一定的学习成本。
- **应用层评测缺失** -- 聚焦学术基准，不具备 Prompt 测试、RAG 评测等应用场景能力。

**基本用法**

```bash
# 安装
pip install lm-eval

# 评测模型在 MMLU 和 HellaSwag 上的表现
lm_eval --model hf \
  --model_args pretrained=meta-llama/Llama-3-8B \
  --tasks mmlu,hellaswag \
  --batch_size auto

# 查看所有可用任务
lm_eval --tasks list
```

## OpenCompass 详解

OpenCompass 由上海人工智能实验室（Shanghai AI Lab）开源，是面向大模型全能力评测的一站式平台。它在国内大模型社区中拥有极高的影响力。

**适用场景**

- 中文模型的全面能力评测
- 多维度能力评估（语言理解、推理、代码、数学、长文本等）
- LLM-as-Judge 主观评测

**优势**

- **中文深度支持** -- 涵盖 C-Eval、CMMLU、Gaokao、CLUE 等大量中文基准数据集。
- **数据集覆盖全面** -- 内置 100+ 数据集，覆盖知识、推理、代码、数学、多语言等多个维度。
- **内置 Judge 能力** -- 支持 LLM-as-Judge 模式，可以自动化主观题评测。
- **可视化评测报告** -- 提供结构化的评测报告和排名对比。

**劣势**

- **学习曲线较陡** -- 框架架构较为复杂，配置文件体系庞大，初学者上手需要较长时间。
- **资源消耗大** -- 完整评测需要大量 GPU 资源，尤其是 100+ 数据集全量评测。

**基本用法**

```bash
# 安装
pip install opencompass

# 使用配置文件运行评测
opencompass --config configs/eval_demo.py

# 也可以通过 Python 脚本启动
python run.py configs/eval_llama.py
```

评测配置文件示例：

```python
# configs/eval_demo.py
from mmengine.config import read_base

with read_base():
    from .datasets.mmlu.mmlu_gen import mmlu_datasets
    from .datasets.ceval.ceval_gen import ceval_datasets

datasets = [*mmlu_datasets, *ceval_datasets]

models = [
    dict(
        type='HuggingFaceCausalLM',
        abbr='llama-3-8b',
        path='meta-llama/Llama-3-8B',
        tokenizer_path='meta-llama/Llama-3-8B',
        max_out_len=1024,
        batch_size=8,
    )
]
```

## Promptfoo 详解

Promptfoo 是一个专注于 LLM 应用测试的开源框架，其定位类似于"大模型的单元测试"。它不关注模型在学术基准上的表现，而是关注特定 Prompt 在不同模型上的实际输出质量。

**适用场景**

- Prompt 模板效果对比和迭代优化
- 多模型横向对比（GPT-4、Claude、Llama 等）
- Red Team 安全测试
- CI/CD 中的回归测试

**优势**

- **极简上手** -- 基于 YAML 配置，无需编写代码即可完成测试。
- **多模型支持** -- 统一接口对接 OpenAI、Anthropic、Google、本地模型等。
- **可视化对比** -- Web UI 展示不同模型/配置的输出对比结果。
- **CI 集成友好** -- 命令行工具设计，易于嵌入自动化流水线。

**劣势**

- **不具备学术基准评测能力** -- 面向应用层，无法替代学术基准评测。
- **自定义指标需要编码** -- 内置指标有限，复杂评判逻辑需要编写 JavaScript 断言。

**配置文件示例**

```yaml
# promptfooconfig.yaml
providers:
  - openai:gpt-4o
  - openai:gpt-4o-mini
  - anthropic:claude-sonnet-4-20250514

prompts:
  - prompt.txt

tests:
  - vars:
      question: "什么是量子计算？"
    assert:
      - type: contains
        value: "量子比特"
      - type: latency
        threshold: 5000
  - vars:
      question: "解释机器学习"
    assert:
      - type: llm-rubric
        value: "回答应包含监督学习和无监督学习的区别"
        provider: openai:gpt-4o
```

运行评测：

```bash
# 交互式评测
npx promptfoo eval --config promptfooconfig.yaml

# 查看评测结果（打开 Web UI）
npx promptfoo view

# CI 模式
npx promptfoo eval --config promptfooconfig.yaml --max-concurrency 4
```

## DeepEval 详解

DeepEval 是一个面向 LLM 输出质量评测的开源 Python 框架，以 SDK 方式集成到项目中，特别适合持续评测和回归测试场景。

**核心指标**

DeepEval 内置了一系列面向 LLM 输出质量的评测指标：

- **Answer Relevance** -- 回答与问题的相关性。
- **Faithfulness** -- 回答是否忠于提供的上下文（有无幻觉）。
- **Hallucination** -- 检测输出中是否存在幻觉内容。
- **Contextual Precision / Recall** -- 检索上下文的质量评估。
- **GEval** -- 通用的 LLM-as-Judge 指标框架，可自定义评判标准。

**适用场景**

- LLM 应用输出的持续质量评测
- RAG 系统的组件级评测
- 集成到 Pytest 的自动化测试
- 评测数据集的版本管理和回归测试

**代码示例**

```python
from deepeval import evaluate
from deepeval.metrics import AnswerRelevanceMetric, FaithfulnessMetric
from deepeval.test_case import LLMTestCase

# 定义测试用例
test_case = LLMTestCase(
    input="什么是微服务架构？",
    actual_output="微服务架构是一种将应用程序拆分为一组小型服务的软件设计方法...",
    retrieval_context=["微服务是一种架构风格，将应用构建为独立部署的小服务集合。"],
)

# 定义评测指标
answer_relevance = AnswerRelevanceMetric(threshold=0.7)
faithfulness = FaithfulnessMetric(threshold=0.7)

# 执行评测
evaluate(test_cases=[test_case], metrics=[answer_relevance, faithfulness])
```

与 Pytest 集成：

```python
# test_llm_quality.py
from deepeval import assert_test
from deepeval.metrics import HallucinationMetric
from deepeval.test_case import LLMTestCase

def test_no_hallucination():
    test_case = LLMTestCase(
        input="北京的人口是多少？",
        actual_output="北京的常住人口约为 2189 万人。",
        context=["根据第七次全国人口普查，北京市常住人口为 2189 万。"],
    )
    metric = HallucinationMetric(threshold=0.5)
    assert_test(test_case, [metric])
```

## RAGAS 详解

RAGAS（Retrieval Augmented Generation Assessment）是专门面向 RAG 系统的评测框架。RAG 系统的评测难点在于需要同时评估检索质量和生成质量，RAGAS 提供了一套系统化的指标体系。

**核心指标**

- **Context Precision** -- 检索到的上下文中相关信息排名靠前的程度。
- **Context Recall** -- 回答所需的信息是否都被检索到了。
- **Faithfulness** -- 生成回答是否忠实于检索到的上下文。
- **Answer Relevancy** -- 生成回答与用户问题的相关程度。

**适用场景**

- RAG 系统端到端评测
- 检索组件和生成组件的独立评测
- RAG Pipeline 迭代优化
- 无需人工标注的自动化评测

**代码示例**

```python
from ragas import evaluate
from ragas.metrics import (
    context_precision,
    context_recall,
    faithfulness,
    answer_relevancy,
)
from datasets import Dataset

# 构建评测数据集
data = {
    "question": [
        "什么是 Kubernetes？",
        "Docker 和 Podman 有什么区别？",
    ],
    "answer": [
        "Kubernetes 是一个开源的容器编排平台...",
        "Docker 使用守护进程，而 Podman 采用无守护进程架构...",
    ],
    "contexts": [
        ["Kubernetes (K8s) 是用于自动部署、扩缩和管理容器化应用的开源系统。"],
        ["Podman 是 Docker 的替代品，不需要守护进程运行。"],
    ],
    "ground_truth": [
        "Kubernetes 是开源容器编排系统。",
        "Docker 有守护进程，Podman 无守护进程。",
    ],
}

dataset = Dataset.from_dict(data)

# 执行评测
result = evaluate(
    dataset=dataset,
    metrics=[context_precision, context_recall, faithfulness, answer_relevancy],
)

print(result)
```

## 选型建议

根据不同场景，推荐以下选型方案：

| 场景 | 推荐框架 | 理由 |
|------|---------|------|
| 学术研究论文评测 | lm-evaluation-harness | 标准化、社区公认 |
| 中文模型全面评测 | OpenCompass | 中文深度支持、数据集全面 |
| Prompt 工程迭代 | Promptfoo | YAML 配置、快速对比 |
| RAG 系统评测 | RAGAS | RAG 专项指标、自动化 |
| 持续集成评测 | DeepEval | SDK 集成、Pytest 支持 |
| 模型选型对比 | lm-eval-harness + Chatbot Arena | 学术基准 + 真实体验 |

**快速决策树**

1. 需要学术基准评分？ -- 是：lm-evaluation-harness
2. 以中文模型为主？ -- 是：OpenCompass
3. 评测对象是 RAG 系统？ -- 是：RAGAS
4. 需要 Prompt/应用测试？ -- 是：Promptfoo
5. 需要集成到 CI/CD？ -- 是：DeepEval

## 组合使用策略

在实际项目中，单一框架往往无法覆盖所有评测需求。推荐采用分层组合策略：

**基础能力评测 + 应用评测**

```
基础能力层（学术基准）
    |
    v
lm-evaluation-harness / OpenCompass  -->  模型选型、能力基线
    |
    v
应用能力层（业务评测）
    |
    v
Promptfoo / DeepEval  -->  Prompt 优化、输出质量
    |
    v
专项能力层（RAG 评测）
    |
    v
RAGAS  -->  检索和生成质量
```

**自动化评测流水线设计**

```
代码提交 / 模型更新
    |
    v
+---------------------------+
| Stage 1: 快速冒烟测试      |
| Promptfoo (关键用例验证)    |
| 耗时: 分钟级               |
+---------------------------+
    |
    v
+---------------------------+
| Stage 2: 应用质量评测       |
| DeepEval / RAGAS           |
| 耗时: 十分钟级             |
+---------------------------+
    |
    v
+---------------------------+
| Stage 3: 基准能力评测       |
| lm-evaluation-harness      |
| 耗时: 小时级               |
+---------------------------+
    |
    v
评测报告生成 + 结果归档
```

这套分层策略的核心思路是：用快速测试尽早发现问题，用深度评测保证质量底线。Stage 1 作为门禁，不通过则阻断后续流程；Stage 2 关注应用层面的质量；Stage 3 作为完整的基准评测，可以选择性地在重要版本发布时运行。

**评测结果管理**

建议将评测结果纳入版本管理：

- 评测数据集与配置文件随代码仓库一起维护
- 评测结果输出为 JSON/CSV 格式，记录模型版本、评测时间、指标分数
- 使用 W&B 或 MLflow 等工具跟踪评测指标的变化趋势
- 设置关键指标的阈值告警，如 Faithfulness 低于 0.8 时触发 review

## 总结

大模型评测是一个多层次的工作，没有万能的单一框架。学术基准评测解决"模型能力怎么样"的问题，应用评测解决"在我的场景中表现如何"的问题，专项评测解决特定系统（如 RAG）的质量保障问题。

选择框架时，应先明确评测目标：是论文中的标准化评测，还是工程中的质量保障，亦或是 RAG 系统的专项优化。然后根据目标选择合适的工具，并按照分层组合策略构建完整的评测体系。
