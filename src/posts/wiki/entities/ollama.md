---
title: Ollama
icon: pen-to-square
date: 2026-05-29
category:
  - 公司与人物
tag:
  - tool
  - llm
  - local-inference
  - open-source
---

# Ollama

> 本地大语言模型运行工具，让开发者在个人设备上轻松部署和运行开源 LLM。

## 简介

Ollama 是一个开源的本地 LLM 运行框架，以极简的命令行界面让用户在 macOS、Linux 和 Windows 上运行各种开源大语言模型。它自动处理模型下载、GPU 加速和量化，大幅降低了本地部署的门槛。

## 支持的模型

Ollama 支持丰富的开源模型家族：

- **LLaMA 系列**：[Meta](/posts/wiki/entities/meta-ai.html) 的 LLaMA 2/3/3.1/4 全系列
- **Mistral**：Mistral AI 的 Mistral 和 Mixtral 系列
- **Gemma**：Google 的 Gemma 系列开源模型
- **Qwen**：阿里的通义千问系列
- **DeepSeek**：深度求索系列
- **Phi**：Microsoft 的小参数高性能模型

通过 Modelfile 机制，用户可以导入任何 GGUF 格式的模型。

## 使用方式

```bash
# 安装后即可使用
ollama run llama3.1    # 下载并运行模型
ollama list             # 列出已安装模型
ollama pull mistral     # 下载模型
ollama create mymodel -f Modelfile  # 自定义模型
```

## API 接口

Ollama 提供兼容 OpenAI API 格式的 REST 接口（默认端口 11434），可直接替换 OpenAI API 端点，便于本地开发和测试：

```bash
curl http://localhost:11434/api/chat -d '{
  "model": "llama3.1",
  "messages": [{"role": "user", "content": "Hello"}]
}'
```

## 在隐私场景中的价值

- 数据不离开本地设备，满足隐私合规要求
- 适合处理敏感代码和文档
- 离线环境下的 AI 能力保障
- 降低 API 调用成本，适合 [微调](/posts/wiki/concepts/fine-tuning.html) 实验和原型开发

## 相关页面

- [entities/meta-ai](/posts/wiki/entities/meta-ai.html)
- [entities/hugging-face](/posts/wiki/entities/hugging-face.html)
- [concepts/fine-tuning](/posts/wiki/concepts/fine-tuning.html)
- [topics/open-source](/posts/wiki/topics/open-source.html)
