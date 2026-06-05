import { sidebar } from "vuepress-theme-hope";

export default sidebar({
  "/": [
    "",
    {
      text: "功能演示",
      icon: "laptop-code",
      prefix: "demo/",
      link: "demo/",
      children: "structure",
    },
    {
      text: "文章",
      icon: "book",
      prefix: "posts/",
      children: "structure",
    },
    {
      text: "AI Wiki",
      icon: "brain",
      prefix: "posts/wiki/",
      collapsible: true,
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
    "intro",
  ],
});
