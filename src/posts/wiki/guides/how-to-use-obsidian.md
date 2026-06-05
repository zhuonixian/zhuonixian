---
title: 如何使用 Obsidian
icon: pen-to-square
date: 2026-05-29
category:
  - 实践指南
tag:
  - guide
  - obsidian
  - pkm
  - tutorial
---

# 如何使用 Obsidian

Obsidian 是一款本地优先的 Markdown 知识管理工具，以双向链接和关系图谱著称。本指南帮助你快速上手，并与 [LLM Wiki](/posts/wiki/guides/how-to-build-llm-wiki.html) 工作流无缝衔接。

## 安装和配置

1. 从 [obsidian.md](https://obsidian.md) 下载对应平台客户端（支持 macOS、Windows、Linux、iOS、Android）
2. 创建或打开一个 Vault（知识库文件夹）。LLM Wiki 的 `wiki/` 目录可以直接作为 Vault 使用
3. 进入 Settings → Editor，建议调整：关闭"Readable line length"以获得更宽的编辑区域，开启"Strict line breaks"
4. 进入 Settings → Files & Links，将"New link format"设为"Relative path to file"，匹配 LLM Wiki 的链接风格

## 核心概念

- **Vault（知识库）**：一个本地文件夹，所有笔记和附件都存储在里面。Vault 之间完全独立
- **双向链接**：使用 `[文件名]` 创建链接，被链接的文件会自动显示反向引用。这是 Obsidian 最核心的功能
- **标签**：用 `#tag` 标记笔记，支持嵌套标签如 `#project/active`。标签适合横向分类，链接适合纵向关联
- **关系图谱（Graph View）**：可视化笔记之间的链接关系，帮助发现知识缺口和孤立页面

## 实用快捷键

| 快捷键 | 功能 |
|--------|------|
| `Ctrl/Cmd + O` | 快速打开笔记（模糊搜索） |
| `Ctrl/Cmd + P` | 命令面板（执行任意操作） |
| `Ctrl/Cmd + [` / `]` | 后退 / 前进导航 |
| `Alt/Opt + 点击链接` | 在新面板中打开 |
| `Ctrl/Cmd + E` | 切换编辑 / 预览模式 |

## 推荐插件

在 Settings → Community Plugins 中安装：

- **Dataview**：用类 SQL 语法查询笔记数据，例如列出所有 `status: draft` 的页面。对管理 Wiki 极其有用
- **Templater**：高级模板引擎，支持变量、日期函数和自动化脚本。可用于快速创建符合 LLM Wiki 规范的新页面
- **Calendar**：日历视图，方便按日期导航笔记
- **Git**：在 Obsidian 内执行 Git 操作（自动提交、同步），适合 [LLM Wiki](/posts/wiki/guides/how-to-build-llm-wiki.html) 的版本管理

安装方式：Settings → Community Plugins → 关闭 Safe Mode → Browse → 搜索插件名 → Install → Enable。

## 与 LLM Wiki 配合使用

LLM Wiki 的 `wiki/` 目录结构天然适配 Obsidian：

1. 将 `wiki/` 设为 Vault 根目录（或将整个项目目录设为 Vault）
2. `[concepts/xxx](/posts/wiki/concepts/xxx.html)` 格式的双链在 Obsidian 中可直接点击跳转
3. 使用 Dataview 插件查询所有页面及其 frontmatter 字段
4. 使用关系图谱查看知识网络的全局结构，发现孤立页面
5. LLM Agent 修改文件后，Obsidian 会实时反映变更，无需刷新

## Web Clipper 浏览器扩展

Obsidian Web Clipper 可将网页内容一键保存到 Vault：

1. 从浏览器扩展商店安装 Obsidian Web Clipper
2. 配置保存模板，自动提取标题、正文、来源 URL
3. 保存的笔记可作为 `raw/` 层的原始资料，后续由 LLM Agent 摄取到 Wiki 层

## 图片管理和附件设置

建议在 Settings → Files & Links 中：

- 将"Default location for new attachments"设为指定的 `assets/` 文件夹
- 这样粘贴或拖入的图片会统一存放，避免散落在各目录中
- 使用相对路径引用图片，确保跨设备和 Git 同步的兼容性

## 相关页面

- [Obsidian](/posts/wiki/entities/obsidian.html)：Obsidian 工具详细介绍
- [构建 LLM Wiki 指南](/posts/wiki/guides/how-to-build-llm-wiki.html)：LLM Wiki 的搭建方法
