---
title: 如何微调大语言模型
icon: pen-to-square
date: 2026-05-29
category:
  - 实践指南
tag:
  - guide
  - fine-tuning
  - llm
  - tutorial
---

# 如何微调大语言模型

本指南覆盖 [微调](/posts/wiki/concepts/fine-tuning.html) 的完整流程，从数据准备到模型部署。微调是将通用 LLM 适配到特定领域或任务的关键技术。

## 数据准备

数据质量决定微调效果的上限。核心要求：

- **格式统一**：通常使用对话格式（`system`/`user`/`assistant`），确保与目标模型的训练格式一致
- **质量优先**：500 条高质量样本远胜 5000 条低质量样本。每条数据应经过人工审核
- **多样性**：覆盖目标任务的各类场景和输入分布，避免数据偏斜导致模型偏向某种回答模式
- **去重**：去除重复或高度相似的样本，防止模型过拟合

工具推荐：`datasets`（Hugging Face）用于加载和处理数据，`cleanlab` 用于数据质量诊断。

## 选择基座模型

选型时考虑以下维度：

| 维度 | 说明 |
|------|------|
| 模型规模 | 7B 适合单卡推理，70B 需要多卡或云端部署 |
| 许可证 | Llama 系列允许商用，部分模型仅限研究 |
| 基础能力 | 选择在目标任务相关基准上表现好的模型 |
| 社区支持 | 活跃的社区意味着更多教程、工具和预训练适配器 |

主流选择：Llama 3（Meta）、Qwen 2.5（阿里）、Mistral（Mistral AI）、DeepSeek（深度求索）。

## LoRA 微调实操步骤

LoRA（Low-Rank Adaptation）是最常用的参数高效微调方法：

1. **安装依赖**：`pip install transformers peft trl datasets`
2. **加载数据和模型**：使用 `AutoModelForCausalLM` 加载基座模型，`PeftModel` 配置 LoRA 适配器
3. **配置 LoRA 参数**：`r`（秩）通常设为 8-64，`lora_alpha` 设为 `r` 的 1-2 倍，`target_modules` 指定要训练的层（通常为 `q_proj`、`v_proj`）
4. **设置训练超参**：学习率 1e-4 到 5e-5，batch size 根据显存调整，训练 3-5 个 epoch
5. **启动训练**：使用 `SFTTrainer`（TRL 库）进行监督微调
6. **合并保存**：训练完成后将 LoRA 权重合并回基座模型，便于部署

推荐工具：Axolotl（配置驱动的一站式微调框架）、Unsloth（加速训练的优化库）。

## 训练超参调优

关键超参及调整方向：

- **学习率**：过大会震荡，过小收敛慢。从 2e-5 开始，观察 loss 曲线调整
- **Epoch 数**：小数据集（< 1000 条）3-5 个 epoch，大数据集 1-2 个
- **Warmup 步数**：通常设为总步数的 5-10%，避免训练初期不稳定
- **梯度累积**：显存不足时通过累积模拟更大的 batch size

监控指标：训练 loss 应平稳下降。如果 loss 不降或震荡，检查数据质量和学习率。

## 评估方法

- **自动评估**：在目标任务的基准测试集上对比微调前后的准确率
- **人工评估**：抽样 50-100 条输出，由领域专家按质量打分
- **对比评估**：使用 LLM-as-Judge（如 GPT-4）对微调前后的输出进行盲评

## 部署注意事项

- 使用量化（GPTQ、AWQ、GGUF）降低显存占用和推理延迟
- 部署框架推荐 vLLM（高吞吐）或 Ollama（本地推理）
- 上线后持续监控输出质量，设置异常检测机制

## 相关页面

- [微调](/posts/wiki/concepts/fine-tuning.html)：微调技术的概念解析
- [LLM 训练流水线](/posts/wiki/concepts/llm-training-pipeline.html)：从预训练到部署的完整流程
