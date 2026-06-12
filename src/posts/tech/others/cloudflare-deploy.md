---
title: Cloudflare Pages 部署指南
icon: pen-to-square
date: 2026-06-06
category:
  - 技术
tag:
  - Cloudflare
  - 部署
  - CDN
---

# Cloudflare Pages 部署指南

Cloudflare Pages 是一个免费的静态网站托管平台，支持自动构建和全球 CDN 加速，非常适合部署 VuePress 博客。

<!-- more -->

## 为什么选 Cloudflare Pages

- **免费** — 无限带宽，500 次构建/月
- **全球 CDN** — 国内访问速度不错
- **自动 HTTPS** — 免费 SSL 证书
- **Git 集成** — 推送代码自动部署
- **预览环境** — 每个 PR 自动生成预览 URL

## 部署步骤

### 1. 连接 GitHub 仓库

登录 [Cloudflare Dashboard](https://dash.cloudflare.com)，进入 Workers & Pages → 创建 → Pages → 连接到 Git。

### 2. 配置构建

| 配置项 | 值 |
|--------|-----|
| 构建命令 | `npm run build` |
| 输出目录 | `src/.vuepress/dist` |
| NODE_VERSION | `20` |

### 3. 部署

点击「保存并部署」，等待构建完成。默认会获得 `项目名.pages.dev` 域名。

## 自定义域名

如果想要自定义域名，在 Pages 设置 → Custom domains 中添加域名，Cloudflare 会自动配置 DNS 和 SSL。

## 性能优化

Cloudflare Pages 自带全球 CDN，但对于国内用户，建议：

1. 开启 Cloudflare 的 **Auto Minify**（自动压缩）
2. 开启 **Brotli** 压缩
3. 配置缓存规则

这样博客在国内的访问速度可以达到 200-400ms，体验不错。
