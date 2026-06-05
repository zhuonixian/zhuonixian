---
title: 使用本 Wiki 指南
icon: pen-to-square
date: 2026-05-29
category:
  - 实践指南
tag:
  - guide
  - usage
  - getting-started
---

# 使用本 Wiki 指南

本文档帮助你快速上手使用这个 LLM Wiki 知识库。

## 用 Obsidian 打开本项目

1. 安装 [Obsidian](https://obsidian.md)
2. 选择 "Open folder as vault"（以文件夹打开仓库）
3. 选择本项目的 `wiki/` 目录作为仓库路径
4. 完成——你现在可以浏览所有知识页面

推荐安装的 Obsidian 插件：
- **Graph View**（内置）：可视化知识网络
- **Backlinks**（内置）：查看反向链接
- **Dataview**：基于 YAML frontmatter 的查询
- **Templater**：高级模板功能

## 理解三层架构

本 Wiki 采用分层架构组织知识：

- **Concepts（概念）**：技术概念的深度解析页面。例如 "Transformer 架构"、"Prompt Engineering"。每个概念页面对应一个独立的知识点。
- **Entities（实体）**：具体的人物、产品或组织。例如 "Andrej Karpathy"、"Claude"。实体页面提供背景介绍和关键信息。
- **Guides（指南）**：操作性文档，教你如何做某件事。
- **Comparisons（对比）**：技术方案和工具的对比分析。
- **Topics（主题）**：综合性主题页面，聚合多个概念和实体。
- **Synthesis（综合）**：跨领域的深度分析和趋势判断。

页面之间通过双向链接 `[xxx/yyy](/posts/wiki/xxx/yyy.html)` 互相引用，形成知识网络。

## 如何添加新知识（Ingest 流程）

添加新知识是最常见的操作，有两种方式：

### 方式一：通过 Claude Code Agent

1. 将原始资料（URL、PDF、文本）提供给 Claude Code
2. 指示 Agent 将资料编译为结构化 Wiki 页面
3. Agent 会自动选择合适的目录和模板
4. 审核 Agent 生成的页面，必要时修改

示例指令：
```
请将这篇关于 Transformer 的文章编译为一个 concepts 页面：
[URL 或粘贴内容]
```

### 方式二：手动创建

1. 在 Obsidian 中新建笔记，保存到对应目录
2. 添加 YAML frontmatter（参考 `wiki/templates/` 中的模板）
3. 用 Markdown 编写内容
4. 添加双向链接到相关页面

## 如何查询知识（Query 流程）

查询知识有两种方式：

### 通过 Claude Code 查询

直接向 Claude Code 提问。Agent 会阅读相关的 Wiki 页面，基于已有知识给出回答。如果知识库中没有覆盖相关内容，Agent 会提示你通过 Ingest 流程补充。

### 通过 Obsidian 搜索

1. 使用 `Ctrl/Cmd + O` 快速切换到任意页面
2. 使用 `Ctrl/Cmd + Shift + F` 全文搜索
3. 利用 Graph View 可视化浏览知识网络
4. 通过 Backlinks 面板发现相关页面

## 如何维护知识库（Lint 流程）

知识库需要定期维护以保持健康：

- **更新过时内容**：检查 frontmatter 中的 `updated` 日期，标记长时间未更新的页面
- **修复断链**：查找引用了不存在页面的双向链接
- **补充交叉引用**：检查孤立页面，添加到相关页面的链接
- **统一格式**：确保所有页面遵循相同的 frontmatter 和内容结构

可以指示 Claude Code 执行 Lint 操作：
```
请检查 wiki/ 目录中的所有页面，找出断链和格式不一致的问题
```

## 与 Claude Code 协作的方式

Claude Code 是本 Wiki 的核心编写工具。以下是常见的协作模式：

- **批量编译**：一次性提供多篇资料，让 Agent 批量生成页面
- **增量更新**：提供新的信息片段，让 Agent 更新已有页面
- **交叉引用生成**：让 Agent 审查页面间的关联，建议并添加双向链接
- **质量审查**：让 Agent 检查页面的准确性、完整性和格式规范

详细的构建方法参见 [构建 LLM Wiki 指南](/posts/wiki/guides/how-to-build-llm-wiki.html)。

## 相关页面

- [构建 LLM Wiki 指南](/posts/wiki/guides/how-to-build-llm-wiki.html)：从零开始构建知识库的完整教程
- [知识管理](/posts/wiki/topics/knowledge-management.html)：知识管理的理论背景和工具生态
