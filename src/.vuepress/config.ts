import { defineUserConfig } from "vuepress";
import { viteBundler } from "@vuepress/bundler-vite";
import theme from "./config/theme.js";

export default defineUserConfig({
  base: "/",

  lang: "zh-CN",
  title: "zhuonixian",
  description: "记录所思所想",

  head: [
    ["link", { rel: "icon", href: "/favicon.ico" }],
    ["meta", { name: "theme-color", content: "#5c92d1" }],
    ["meta", { name: "apple-mobile-web-app-capable", content: "yes" }],
    [
      "meta",
      { name: "apple-mobile-web-app-status-bar-style", content: "white" },
    ],
  ],

  bundler: viteBundler(),

  theme,
});
