import { hopeTheme } from "vuepress-theme-hope";
import navbar from "./navbar.js";
import sidebar from "./sidebar.js";

export default hopeTheme({
  hostname: "https://zhuonixian.pages.dev",

  author: {
    name: "zhuonixian",
    url: "https://zhuonixian.pages.dev",
  },

  logo: "/logo.svg",

  repo: "zhuonixian/zhuonixian",
  docsDir: "src",

  navbar,
  sidebar,

  footer: "默认页脚",
  displayFooter: true,

  blog: {
    description: "记录所思所想",
    intro: "/intro.html",
    medias: {
      GitHub: "https://github.com/zhuonixian",
    },
  },

  encrypt: {
    config: {
      "/demo/encrypt.html": {
        hint: "密码是 1234",
        password: "1234",
      },
    },
  },

  metaLocales: {
    editLink: "在 GitHub 上编辑此页",
  },

  markdown: {
    align: true,
    attrs: true,
    codeTabs: true,
    component: true,
    demo: true,
    figure: true,
    gfm: true,
    imgLazyload: true,
    imgSize: true,
    include: true,
    mark: true,
    spoiler: true,
    sub: true,
    sup: true,
    tabs: true,
    tasklist: true,
    vPre: true,
  },

  plugins: {
    blog: true,
    components: {
      components: ["Badge", "VPCard"],
    },
    icon: {
      prefix: "fa6-solid:",
    },
  },
});
