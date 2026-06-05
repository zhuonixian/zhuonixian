---
title: Obsidian
icon: pen-to-square
date: 2026-05-29
category:
  - 公司与人物
tag:
  - tool
  - pkm
  - markdown
  - knowledge-management
---

# Obsidian

> 本地优先的 Markdown 笔记工具，以双向链接和插件生态构建个人知识图谱。

## 简介

Obsidian 由 Steph Ango（ericax）和 Licat 开发，于 2020 年发布。其核心理念是"你的笔记永远属于你"——所有数据以纯 Markdown 文件存储在本地，不依赖任何云服务。它是目前最流行的 [个人知识管理](/posts/wiki/topics/knowledge-management.html) 工具之一。

## 核心特性

### 双向链接

使用 `[双链语法]` 创建笔记间的关联。反向链接面板自动展示所有引用当前笔记的页面，形成网状知识结构。

### 图谱视图

可视化笔记间的链接关系，帮助发现知识盲区和潜在联系。分为全局图谱和局部图谱两种视图。

### 插件系统

Obsidian 拥有超过 2000 个社区插件，覆盖主题定制、数据库（Dataview）、日记（Daily Notes）、Canvas 白板、PDF 标注等场景。核心插件与社区插件分离的设计保证了稳定性。

## 在 LLM Wiki 中的角色

Obsidian 是 [LLM Wiki 工作流](/posts/wiki/guides/how-to-build-llm-wiki.html) 的推荐前端工具。其双向链接机制与 LLM Wiki 的交叉引用规范天然契合：

- `[xxx/yyy](/posts/wiki/xxx/yyy.html)` 双链语法直接映射为 Obsidian 链接
- 图谱视图可用于可视化 Wiki 页面间的关系
- 社区插件可辅助 LLM 与知识库的交互

## 与同类工具的对比

| 特性 | Obsidian | Notion | Roam Research |
|------|----------|--------|---------------|
| 数据存储 | 本地 Markdown | 云端 | 云端 |
| 双向链接 | 原生支持 | 有限支持 | 原生支持 |
| 离线使用 | 完全支持 | 有限 | 有限 |
| 插件生态 | 2000+ | 有限 | 较少 |
| 价格 | 免费（Sync 付费） | 免费起 | $15/月 |

## 相关页面

- [topics/knowledge-management](/posts/wiki/topics/knowledge-management.html)
- [guides/how-to-build-llm-wiki](/posts/wiki/guides/how-to-build-llm-wiki.html)
- [concepts/semantic-search](/posts/wiki/concepts/semantic-search.html)
