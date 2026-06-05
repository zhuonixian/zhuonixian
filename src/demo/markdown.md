---
title: Markdown 展示
icon: fa6-brands:markdown
order: 2
category:
  - 使用指南
tag:
  - Markdown
---

VuePress 主要从 Markdown 文件生成页面。因此你可以使用它轻松生成文档或博客站点。

<!-- more -->

## 选项卡

::: tabs#fruit

@tab apple

Apple

@tab banana

Banana

@tab orange

Orange

:::

## 脚注

此文字有脚注[^first].

[^first]: 这是脚注内容

## 任务列表

- [x] 计划 1
- [ ] 计划 2
- [ ] 计划 3

## 上下角标

19^th^ H~2~O

## 标记

你可以标记 ==重要的内容==。

## 剧透

VuePress Theme Hope !!十分强大!!.

## 提示容器

::: info 自定义标题

信息容器，包含 `代码` 与 [链接](#提示容器)。

```js
const a = 1;
```

:::

::: tip 提示

提示容器

:::

::: warning 警告

警告容器

:::

::: caution 危险

危险容器

:::

::: details 点击展开

详情容器

:::

## 代码块

::: code-tabs

@tab pnpm

```bash
pnpm add -D vuepress-theme-hope
```

@tab yarn

```bash
yarn add -D vuepress-theme-hope
```

@tab:active npm

```bash
npm i -D vuepress-theme-hope
```

:::
