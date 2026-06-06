import { navbar } from "vuepress-theme-hope";

export default navbar([
  { text: "首页", icon: "house", link: "/" },
  {
    text: "博文",
    icon: "pen-to-square",
    prefix: "/posts/",
    children: [
      {
        text: "技术",
        icon: "code",
        prefix: "tech/",
        children: "structure",
      },
      {
        text: "生活",
        icon: "mug-hot",
        prefix: "life/",
        children: "structure",
      },
      {
        text: "笔记",
        icon: "notebook",
        prefix: "notes/",
        children: "structure",
      },
    ],
  },
  {
    text: "AI Wiki",
    icon: "brain",
    prefix: "/posts/wiki/",
    children: [
      {
        text: "概念",
        icon: "lightbulb",
        prefix: "concepts/",
        children: "structure",
      },
      {
        text: "主题",
        icon: "folder-open",
        prefix: "topics/",
        children: "structure",
      },
      {
        text: "对比",
        icon: "code-compare",
        prefix: "comparisons/",
        children: "structure",
      },
      {
        text: "公司人物",
        icon: "building",
        prefix: "entities/",
        children: "structure",
      },
      {
        text: "指南",
        icon: "book-open",
        prefix: "guides/",
        children: "structure",
      },
      {
        text: "综合分析",
        icon: "chart-line",
        prefix: "synthesis/",
        children: "structure",
      },
    ],
  },
  {
    text: "功能演示",
    icon: "laptop-code",
    prefix: "/demo/",
    children: [
      { text: "布局", icon: "object-group", link: "layout" },
      { text: "Markdown", icon: "fa6-brands:markdown", link: "markdown" },
      { text: "页面", icon: "file", link: "page" },
      { text: "加密", icon: "lock", link: "encrypt" },
    ],
  },
  { text: "关于", icon: "circle-info", link: "/intro.html" },
]);
