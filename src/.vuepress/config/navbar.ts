import { navbar } from "vuepress-theme-hope";

export default navbar([
  "/",
  {
    text: "功能演示",
    icon: "laptop-code",
    prefix: "/demo/",
    children: [
      { text: "布局", icon: "object-group", link: "layout" },
      { text: "Markdown", icon: "fa6-brands:markdown", link: "markdown" },
      { text: "页面", icon: "file", link: "page" },
      { text: "禁用", icon: "ban", link: "disable" },
      { text: "加密", icon: "lock", link: "encrypt" },
    ],
  },
  {
    text: "博文",
    icon: "pen-to-square",
    prefix: "/posts/",
    children: [
      {
        text: "技术",
        icon: "code",
        prefix: "tech/",
        children: [
          { text: "VuePress 搭建博客", icon: "pen-to-square", link: "vuepress-blog" },
          { text: "Cloudflare Pages 部署", icon: "pen-to-square", link: "cloudflare-deploy" },
          { text: "Git 常用命令", icon: "pen-to-square", link: "git-commands" },
        ],
      },
      {
        text: "生活",
        icon: "mug-hot",
        prefix: "life/",
        children: [
          { text: "2026 初夏", icon: "pen-to-square", link: "early-summer-2026" },
          { text: "读书笔记：原则", icon: "pen-to-square", link: "reading-principles" },
        ],
      },
      {
        text: "笔记",
        icon: "notebook",
        prefix: "notes/",
        children: [
          { text: "Linux 常用技巧", icon: "pen-to-square", link: "linux-tips" },
        ],
      },
    ],
  },
]);
