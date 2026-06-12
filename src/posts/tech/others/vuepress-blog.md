---
title: 用 VuePress Theme Hope 搭建个人博客
icon: pen-to-square
date: 2026-06-06
category:
  - 技术
tag:
  - VuePress
  - 博客
  - 建站
---

# 用 VuePress Theme Hope 搭建个人博客

之前一直想搭建一个属于自己的博客，记录学习过程和技术探索。经过一番调研，最终选择了 VuePress + Theme Hope 方案。

<!-- more -->

## 为什么选 VuePress Theme Hope

在众多博客框架中，我最终选择 VuePress Theme Hope 的原因：

1. **基于 Markdown 写作** — 作为开发者，Markdown 是最自然的写作方式
2. **Vue 驱动** — 可以在 Markdown 中使用 Vue 组件
3. **Theme Hope 功能丰富** — 博客、加密、评论、搜索等开箱即用
4. **部署免费** — 可以部署在 Cloudflare Pages，零成本
5. **性能优秀** — 静态站点，加载速度极快

## 技术栈

| 技术 | 用途 |
|------|------|
| VuePress 2 | 静态站点生成器 |
| Theme Hope | 博客主题 |
| Vite | 构建工具 |
| Cloudflare Pages | 托管部署 |
| GitHub | 代码托管 + CI/CD |

## 目录结构

```
zhuonixian/
├── src/
│   ├── .vuepress/
│   │   ├── config/        # 配置文件
│   │   │   ├── config.ts
│   │   │   ├── theme.ts
│   │   │   ├── navbar.ts
│   │   │   └── sidebar.ts
│   │   └── public/        # 静态资源
│   ├── demo/              # 功能演示
│   ├── posts/             # 博客文章
│   │   ├── tech/          # 技术
│   │   ├── life/          # 生活
│   │   └── notes/         # 笔记
│   ├── intro.md           # 关于我
│   └── README.md          # 首页
├── package.json
└── tsconfig.json
```

## 写作流程

新建文章只需在对应目录创建 Markdown 文件，然后 `git push` 即可自动部署：

```bash
# 新建文章
vim src/posts/tech/my-new-post.md

# 发布
git add . && git commit -m "new post" && git push
```

Cloudflare Pages 会自动检测到提交并触发构建，通常 1-2 分钟内生效。
