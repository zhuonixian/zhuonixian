---
title: 页面配置
icon: file
order: 3
category:
  - 使用指南
tag:
  - 页面配置
---

VuePress Theme Hope 允许你通过 frontmatter 来自定义页面。

## 页面信息

你可以通过 frontmatter 设置页面的标题、图标、分类、标签、排序等信息。

```yaml
---
title: 页面标题
icon: page-icon
order: 1
category:
  - 分类名
tag:
  - 标签1
  - 标签2
---
```

## 页面布局

主题提供了多种布局模式:

- 默认布局 (普通文章页)
- Blog 布局 (博客主页)
- Page 帽布局 (自定义页面)

## 自定义页脚

你可以在 frontmatter 中设置:

```yaml
footer: 自定义页脚文字
```
