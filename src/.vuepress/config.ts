import { defineUserConfig } from "vuepress";
import { viteBundler } from "@vuepress/bundler-vite";
import theme from "./config/theme.js";

export default defineUserConfig({
  base: "/",

  lang: "zh-CN",
  title: "zhuonixian",
  description: "记录所思所想",

  bundler: viteBundler(),

  theme,
});
