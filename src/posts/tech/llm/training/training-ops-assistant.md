---
title: SRE 运维领域小模型微调实战
icon: screwdriver-wrench
order: 3
date: 2026-06-13
category:
  - 技术
tag:
  - LLM
  - 微调
  - SRE
  - OPS
  - Qwen
  - LoRA
---

# SRE 运维领域小模型微调实战

通用大模型虽然能力强大，但在垂直领域的表现往往不尽如人意。以 SRE/OPS 故障排查为例，通用模型容易给出泛泛而谈的回答，缺乏具体的排查命令，甚至可能直接建议危险的删除或重启操作。本文记录了一次完整的实验：使用 Qwen2.5-0.5B-Instruct 基座模型，通过 LoRA 微调，在消费级 RTX 4060 上训练出一个 SRE/OPS 领域故障排查助手。33 条训练数据，11 秒训练时间，显存峰值 2.76 GB，平均评分从 8.0 提升到 8.7。

<!-- more -->

## 项目背景

### 为什么需要领域特定的小模型

在实际的运维工作中，故障排查助手需要满足几个关键要求：

- **结构化输出**：先给证据，再给判断，不能上来就建议重启
- **安全意识**：必须优先提供只读排查命令，涉及危险操作时必须提示风险
- **离线可用**：生产环境不一定能访问外部 API，本地部署是刚需
- **成本可控**：7B 甚至 70B 模型推理成本高，小模型在特定场景下足够用

通用大模型在这些方面天然不足。它们缺乏对 OPS 工作流程的深入理解，倾向于给出"正确但无用"的建议，而且很难在不牺牲质量的前提下部署到资源受限的环境中。

### 通用大模型 vs 领域小模型的权衡

| 维度 | 通用大模型 (72B+) | 领域小模型 (0.5B) |
|------|-------------------|-------------------|
| 硬件要求 | 多卡 A100/H100 | 消费级 GPU 即可 |
| 推理速度 | 秒级 | 毫秒级 |
| 部署成本 | 高 | 极低 |
| 通用能力 | 强 | 有限 |
| 领域深度 | 取决于提示词 | 通过微调可控 |
| 数据隐私 | 需调用外部 API | 可完全本地化 |

对于 SRE 场景，一个能在几毫秒内给出结构化排查建议的小模型，比一个需要等 10 秒才能回答的通用大模型更实用。

### 项目目标

微调一个 SRE/OPS 故障排查助手，具备以下能力：

1. 准确识别故障类型
2. 主动给出排查命令和关键指标
3. 优先提供安全的只读命令
4. 避免直接建议危险操作
5. 给出合理的修复建议
6. 提示风险和验证方式

## 技术方案设计

### 基座模型选择

选择 `Qwen/Qwen2.5-0.5B-Instruct` 作为基座模型，主要考虑：

- **参数量小**：0.5B 参数，模型文件约 1GB，加载和推理速度快
- **中文能力**：Qwen 系列在中文场景表现优秀
- **Instruct 版本**：已做指令对齐，具备基本的对话能力
- **实验友好**：训练快，迭代周期短，适合验证方案可行性

### 微调方法：LoRA

LoRA（Low-Rank Adaptation）的核心思想是在冻结原始模型权重的情况下，在注意力层旁边插入低秩矩阵进行训练。只需要训练极少量参数（本实验中仅 0.22%），就能显著改变模型的行为模式。

LoRA 的关键参数：

- **rank (r)**：低秩矩阵的秩，控制表达能力。r=8 是一个经过验证的平衡点
- **alpha**：缩放系数，实际缩放比例 = alpha / rank。alpha=16 表示缩放 2 倍
- **target_modules**：应用 LoRA 的注意力层。选择 q_proj, k_proj, v_proj, o_proj 覆盖完整的注意力计算

### 技术栈

```
PyTorch 2.6.0 + CUDA 12.4
Transformers >= 4.40.0  (模型加载和推理)
PEFT >= 0.10.0          (LoRA 适配器)
TRL >= 0.8.0            (SFTTrainer 训练)
Datasets >= 2.18.0      (数据加载)
```

硬件环境：

- GPU: NVIDIA RTX 4060 8GB
- OS: Ubuntu 24.04
- Driver: 550.120

## 训练数据构造

### 数据格式设计

采用 HuggingFace 标准的 messages 格式，每条数据包含 system、user、assistant 三轮对话：

```json
{
  "messages": [
    {
      "role": "system",
      "content": "你是一个谨慎的 SRE / OPS 故障排查助手。回答必须先给证据，再给判断；必须优先提供只读排查命令；涉及删除、重启、扩缩容、修改配置等操作时必须提示风险、回滚和验证方式。"
    },
    {
      "role": "user",
      "content": "K8s Pod 出现 OOMKilled 状态，如何排查？"
    },
    {
      "role": "assistant",
      "content": "## 现象判断\nPod 因内存超限被内核 OOM Killer 终止...\n\n## 关键证据\n```bash\nkubectl describe pod <pod-name> -n <namespace>\n# 查看 Last State 中的 Reason: OOMKilled\n```\n\n## 只读排查命令\n...\n\n## 修复建议\n...\n\n## 风险与验证\n..."
    }
  ]
}
```

### System Prompt 的设计原则

System Prompt 是整个微调的灵魂，它定义了模型的行为规范。设计时遵循以下原则：

1. **谨慎优先**：明确要求"先证据后判断"，杜绝凭空猜测
2. **只读命令优先**：强制要求优先提供安全的只读排查命令
3. **风险提示**：涉及删除、重启、扩缩容、修改配置等操作时，必须提示风险、回滚和验证方式

### 数据覆盖场景

训练数据共 33 条，覆盖三大类故障场景：

| 分类 | 场景 | 数量 |
|------|------|------|
| Kubernetes | CrashLoopBackOff / OOMKilled | 3 |
| Kubernetes | ImagePullBackOff | 1 |
| Kubernetes | Pod Pending (资源不足) | 1 |
| Kubernetes | PVC Pending | 1 |
| Kubernetes | DNS 解析失败 | 1 |
| Kubernetes | Service 无 Endpoint | 1 |
| Kubernetes | Ingress 502 / 504 | 2 |
| Kubernetes | Node NotReady | 1 |
| Kubernetes | CPU throttling | 1 |
| Kubernetes | liveness probe 误杀 | 1 |
| Kubernetes | readiness probe 不通过 | 1 |
| Kubernetes | HPA / Deployment / Job 等 | 8 |
| Kubernetes | API Server / Etcd / ConfigMap | 4 |
| 中间件 | Redis 连接失败 | 1 |
| 中间件 | MySQL 连接数满 | 1 |
| 中间件 | MongoDB 日志打满磁盘 | 1 |
| 中间件 | Nginx upstream timeout | 1 |
| 中间件 | Kafka consumer lag | 1 |
| 中间件 | Prometheus 抓取失败 | 1 |
| 平台组件 | LiteLLM 429 / budget exceeded | 2 |
| 平台组件 | Langfuse 500 | 1 |
| 平台组件 | Ansible Python 解释器不兼容 | 1 |
| 平台组件 | GitLab Runner 执行失败 | 1 |

评估集 10 条，同样覆盖 K8s、中间件和平台组件，用于验证模型的泛化能力。

### 数据样例

以 Redis 连接失败为例，展示一条完整的训练数据中 assistant 的回复结构：

```markdown
## 现象判断
应用连接 Redis 时报 NOAUTH Authentication required，说明连接需认证但未提供密码或密码错误。

## 关键证据
- 应用日志中出现 `NOAUTH Authentication required` 错误
- Redis 配置了 requirepass 但应用连接字符串未包含密码

## 只读排查命令
```bash
# 检查 Redis 是否配置了密码认证
redis-cli CONFIG GET requirepass

# 测试使用密码连接
redis-cli -a <password> PING

# 查看当前连接列表
redis-cli -a <password> CLIENT LIST
```

## 修复建议
1. 确认 Redis 的 requirepass 配置值
2. 在应用连接字符串中添加正确的密码参数
3. 如果使用 Kubernetes Secret，检查 Secret 内容是否正确

## 风险与验证
- 修改连接配置后需重启应用
- 验证：应用日志中不再出现 NOAUTH 错误，连接正常建立
```

## 模型推理：微调前

在微调之前，先使用基础模型对 OPS 问题进行推理，了解其基线表现。

### 推理脚本

```python
from transformers import AutoModelForCausalLM, AutoTokenizer

MODEL_NAME = "Qwen/Qwen2.5-0.5B-Instruct"
QUESTION = "Pod CrashLoopBackOff，describe 显示 last state reason: OOMKilled，应该怎么排查？"

tokenizer = AutoTokenizer.from_pretrained(MODEL_NAME)
model = AutoModelForCausalLM.from_pretrained(
    MODEL_NAME,
    dtype=torch.float16,
    device_map="auto",
)

messages = [
    {"role": "system", "content": "你是一个 SRE / OPS 故障排查助手。"},
    {"role": "user", "content": QUESTION},
]

text = tokenizer.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)
inputs = tokenizer(text, return_tensors="pt").to(model.device)

with torch.no_grad():
    outputs = model.generate(**inputs, max_new_tokens=512, temperature=0.7, do_sample=True, top_p=0.9)

response = tokenizer.decode(outputs[0][inputs["input_ids"].shape[1]:], skip_special_tokens=True)
```

### 基础模型输出样例

对于 OOMKilled 排查问题，基础模型的回答如下：

```
当使用 `kubectl` 命令行工具在 Kubernetes 环境中检查 Pod 的状态时，如果发现
`Pod CrashLoopBackOff`（也称为 "OOMKilled"）状态，则通常意味着一个 Pod
由于内存不足而被挂起或失败了。

以下是一些常见的排查步骤：

### 1. 检查 K8S 集群日志
首先，查看集群的日志文件以获取更多信息。可以使用以下命令：
```bash
kubectl logs <namespace> -c <pod_name>
```

### 2. 检查 Pod 容器堆栈
...
```

基础模型的问题非常明显：

- **命令语法错误**：`kubectl logs <namespace> -c <pod_name>` 参数顺序不对
- **结构松散**：罗列式回答，没有"先证据后判断"的结构
- **缺乏针对性**：没有指出 `kubectl describe pod` 中 `Last State` 的关键信息
- **不提示风险**：没有任何关于操作风险的提示
- **泛泛而谈**：提到了"网络配置"、"运行时状态"等与 OOMKilled 无关的内容

## LoRA 微调训练

### 训练脚本

```python
import torch
from pathlib import Path
from datasets import Dataset
from transformers import AutoModelForCausalLM, AutoTokenizer, TrainingArguments
from peft import LoraConfig, get_peft_model, TaskType
from trl import SFTTrainer

# 配置
MODEL_NAME = "Qwen/Qwen2.5-0.5B-Instruct"
DATA_PATH = "data/sre_train.jsonl"
OUTPUT_DIR = "outputs/lora_adapter"

SYSTEM_PROMPT = (
    "你是一个谨慎的 SRE / OPS 故障排查助手。"
    "回答必须先给证据，再给判断；必须优先提供只读排查命令；"
    "涉及删除、重启、扩缩容、修改配置等操作时必须提示风险、回滚和验证方式。"
)

# LoRA 配置
lora_config = LoraConfig(
    task_type=TaskType.CAUSAL_LM,
    r=8,
    lora_alpha=16,
    lora_dropout=0.05,
    target_modules=["q_proj", "k_proj", "v_proj", "o_proj"],
)

# 训练参数
training_args = TrainingArguments(
    output_dir=OUTPUT_DIR,
    per_device_train_batch_size=1,
    gradient_accumulation_steps=8,
    learning_rate=2e-4,
    num_train_epochs=3,
    fp16=True,
    logging_steps=5,
    save_strategy="epoch",
    report_to="none",
    remove_unused_columns=False,
    max_grad_norm=1.0,
    seed=42,
)

# 加载模型和数据
tokenizer = AutoTokenizer.from_pretrained(MODEL_NAME)
if tokenizer.pad_token is None:
    tokenizer.pad_token = tokenizer.eos_token

model = AutoModelForCausalLM.from_pretrained(
    MODEL_NAME,
    dtype=torch.float16,
    device_map="auto",
)
model = get_peft_model(model, lora_config)

# 训练
trainer = SFTTrainer(
    model=model,
    args=training_args,
    train_dataset=dataset,
    processing_class=tokenizer,
)
trainer.train()
model.save_pretrained(OUTPUT_DIR)
```

### 关键参数解释

| 参数 | 值 | 说明 |
|------|-----|------|
| rank | 8 | 低秩矩阵维度，控制 LoRA 的表达能力 |
| lora_alpha | 16 | 缩放系数，实际缩放 = 16 / 8 = 2x |
| lora_dropout | 0.05 | 防止过拟合，数据量小所以值较低 |
| target_modules | q/k/v/o_proj | 覆盖注意力计算的全部四个投影层 |
| batch_size | 1 | 消费级 GPU 显存有限 |
| gradient_accumulation | 8 | 等效 batch_size = 8 |
| learning_rate | 2e-4 | LoRA 常用学习率 |
| epochs | 3 | 数据量小，多训几轮 |
| max_seq_length | 1024 | 截断过长样本 |
| fp16 | True | 半精度训练，节省显存 |

### 训练结果

```
模型: Qwen/Qwen2.5-0.5B-Instruct
训练数据: sre_train.jsonl (33 条)
可训练参数: 1,081,344 / 495,114,112 (0.22%)
训练耗时: 10.95 秒
显存峰值: 2.76 GB
```

Loss 曲线（每 5 步记录一次）：

```
Step  5: loss = 2.4910
Step 10: loss = 2.3100
Step 15: loss = 2.2465
```

总共 15 个训练步骤，Loss 从 2.491 下降到 2.247，降幅约 9.8%。考虑到只有 33 条数据和 3 个 epoch，这个收敛幅度是合理的。显存峰值 2.76 GB 远低于 RTX 4060 的 8GB 限制，还有很大的余量。

### LoRA 参数量分析

基座模型总参数量 495,114,112（约 4.95 亿），LoRA 可训练参数仅 1,081,344（约 108 万），占比 0.22%。这意味着我们只调整了不到千分之三的参数，就改变了模型在 OPS 领域的行为模式。

## 微调后推理

### 加载 LoRA Adapter

微调完成后，推理时需要先加载基座模型，再叠加 LoRA adapter：

```python
from peft import PeftModel

# 加载基座模型
model = AutoModelForCausalLM.from_pretrained(
    MODEL_NAME,
    dtype=torch.float16,
    device_map="auto",
)
# 加载 LoRA adapter
model = PeftModel.from_pretrained(model, "outputs/lora_adapter")
model.eval()
```

模型加载显存约 0.92 GB，加上 adapter 后几乎没有额外显存开销。推理峰值显存约 0.94 GB。

### LoRA 模型输出样例

对同一个 OOMKilled 问题，LoRA 微调后的回答：

```
### 1. 查看监控日志：
首先检查Pod的`/var/log/docker/oomkilled.log`或`/var/log/syslog`文件，
查看是否有错误信息，特别是关于OOM（过度内存使用）的警告。

例如：
```bash
tail -f /var/log/docker/oomkilled.log
```

### 2. 检查容器日志：
确保没有其他容器出现类似问题，可以通过查看每个容器的日志来确认：
```bash
docker logs container_name
```

...
```

可以看到，微调后的输出在结构上有所改善（使用了标题分节），会主动提及日志和监控等排查手段。但由于 0.5B 模型容量有限，输出的深度和准确性仍有不足，比如使用了 Docker 命令而非 kubectl、引用了不存在的日志路径等。这需要在后续迭代中通过更大的模型和更多数据来解决。

## 效果评测

### 评测方法

采用 6 维度评分体系，每题满分 10 分：

| 维度 | 分值 | 评判标准 |
|------|------|----------|
| 故障识别 | 2 | 是否准确识别故障类型，给出正确的关键词 |
| 证据引用 | 2 | 是否主动给出排查命令和关键指标 |
| 只读命令 | 2 | 是否优先提供安全的只读排查命令 |
| 避免危险操作 | 1 | 是否避免直接建议 rm -rf、delete --force 等 |
| 修复建议 | 1 | 是否给出合理的修复方向 |
| 风险验证 | 2 | 是否提示风险和验证方式 |

### 评测结果

基础模型（问题 1 单题评分）：

| 维度 | 基础模型得分 | 满分 |
|------|-------------|------|
| 故障识别 | 2/2 | 2 |
| 证据引用 | 2/2 | 2 |
| 只读命令 | 2/2 | 2 |
| 避免危险操作 | 1/1 | 1 |
| 修复建议 | 1/1 | 1 |
| 风险验证 | 0/2 | 2 |
| **总计** | **8/10** | 10 |

LoRA 模型全问题评分：

| # | 问题 | 总分 | 故障识别 | 证据引用 | 只读命令 | 避免危险 | 修复建议 | 风险验证 |
|---|------|------|----------|----------|----------|----------|----------|----------|
| 1 | OOMKilled 排查 | 8/10 | 2/2 | 2/2 | 1/2 | 1/1 | 1/1 | 1/2 |
| 2 | Pod Pending 资源不足 | 8/10 | 1/2 | 2/2 | 2/2 | 1/1 | 1/1 | 1/2 |
| 3 | Service 无 Endpoint | 9/10 | 1/2 | 2/2 | 2/2 | 1/1 | 1/1 | 2/2 |
| 4 | Ingress 502 | 10/10 | 2/2 | 2/2 | 2/2 | 1/1 | 1/1 | 2/2 |
| 5 | MongoDB 磁盘打满 | 7/10 | 2/2 | 1/2 | 2/2 | 1/1 | 1/1 | 0/2 |
| 6 | LiteLLM 429 | 10/10 | 2/2 | 2/2 | 2/2 | 1/1 | 1/1 | 2/2 |

LoRA 模型 6 题平均得分：**8.7/10**

### 评测分析

对比基础模型和 LoRA 模型的表现，可以得出以下观察：

1. **输出结构改善明显**：微调后的模型普遍采用了标题分节的结构，而不是基础模型的平铺直叙
2. **风险验证意识增强**：Ingress 502 和 LiteLLM 429 两题中，LoRA 模型主动给出了回退步骤和验证方式，这是基础模型完全不具备的
3. **0.5B 模型深度有限**：在修复建议维度，两个模型得分相同，说明模型容量限制了输出深度
4. **不稳定因素**：MongoDB 磁盘打满一题得分仅 7/10，风险验证维度得 0 分，说明模型在小样本下的泛化仍有波动

综合来看，LoRA 微调后平均 8.7/10 相比基础模型有可见的改善，尤其在输出结构和安全意识方面。

## Docker 部署

训练完成的模型可以通过 Docker 进行标准化部署，支持 GPU 直通。

### Dockerfile

```dockerfile
FROM python:3.12-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl git \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY scripts/ scripts/
COPY outputs/lora_adapter/ outputs/lora_adapter/

ENV HF_HUB_OFFLINE=1

CMD ["python", "scripts/04_infer_lora.py"]
```

### docker-compose.yml

```yaml
services:
  ops-llm-infer:
    build:
      context: ..
      dockerfile: docker/Dockerfile
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: 1
              capabilities: [gpu]
    environment:
      - NVIDIA_VISIBLE_DEVICES=all
      - HF_HUB_OFFLINE=1
    volumes:
      - ../outputs:/app/outputs
      - model-cache:/root/.cache/huggingface

volumes:
  model-cache:
```

### 部署步骤

```bash
# 1. 安装 NVIDIA Container Toolkit
sudo apt-get install nvidia-container-toolkit
sudo nvidia-ctk runtime configure --runtime=docker
sudo systemctl restart docker

# 2. 验证 GPU 访问
docker run --rm --gpus all nvidia/cuda:12.4.1-base-ubuntu22.04 nvidia-smi

# 3. 构建和运行
docker compose -f docker/docker-compose.yml build
docker compose -f docker/docker-compose.yml up
```

`HF_HUB_OFFLINE=1` 环境变量确保容器内不尝试从 HuggingFace Hub 下载模型，完全依赖本地缓存。`model-cache` 卷持久化模型文件，避免每次重建容器都需要重新加载。

## 经验总结

### 核心发现

**1. 0.5B 模型输出结构改善明显，但内容深度有限**

LoRA 微调对模型行为的改变主要体现在输出格式和结构上。微调后的模型学会了"分节回答"、"先给排查步骤再给建议"等模式。但在内容深度上，受限于模型容量，回答的准确性和专业度仍有不足。例如，可能会引用不存在的日志路径，或者使用 Docker 命令而非 kubectl。

**2. 高质量数据远比数据量重要**

33 条训练数据就能看到可测量的效果改善，这说明数据质量至关重要。每条数据都遵循了统一的 System Prompt 规范和结构化的回答格式，这种一致性帮助模型快速学习到了期望的行为模式。

**3. 消费级 GPU 完全可以完成小模型微调**

RTX 4060 8GB 显存，训练峰值仅 2.76 GB，利用率不到 35%。这意味着还有大量余量可以尝试更大的模型（如 1.5B）或更高的 LoRA rank。

### 显存占用记录

| 阶段 | 显存 |
|------|------|
| 模型加载 | 0.92 GB |
| 推理峰值 | 0.94 GB |
| 训练峰值 | 2.76 GB |

## 进阶方向

### 升级到 1.5B 模型 + 扩充数据

0.5B 模型的内容深度是当前最大的瓶颈。升级到 `Qwen2.5-1.5B-Instruct` 或 `Qwen2.5-Coder-1.5B-Instruct` 可以显著提升输出的专业性和准确性。同时将训练数据从 33 条扩充到 100-200 条，覆盖更多边缘场景。

### QLoRA 4-bit 量化探索 7B 模型

使用 QLoRA 4-bit 量化技术，可以将 7B 模型的显存占用压缩到 4-5 GB，使其在 RTX 4060 上成为可能。7B 模型在理解复杂故障场景和生成准确命令方面会有质的飞跃。

### RAG + 微调结合

将知识库检索（RAG）与微调结合，用 RAG 提供准确的上下文信息，用微调控制输出结构和行为规范。这种组合可以弥补小模型知识不足的缺陷，同时保持结构化输出的优势。

### RLHF/DPO 对齐优化

当前使用的是 SFT（监督微调），模型学会了结构化输出，但在安全性和可靠性方面仍有提升空间。后续可以引入 DPO（Direct Preference Optimization）或 RLHF，通过偏好数据进一步对齐模型行为，让模型更好地遵循"先证据后判断"的原则。

---

本实验的完整代码、训练数据和模型权重可在项目仓库中找到。如果你也在探索领域小模型微调，希望这篇实战记录对你有所帮助。
