import { defineSearchConfig } from "@vuepress/plugin-slimsearch/client";

defineSearchConfig({
  querySplitter: (query: string) => {
    if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
      const segmenter = new Intl.Segmenter("zh-CN", {
        granularity: "word",
      });
      return [...segmenter.segment(query)]
        .filter((seg) => seg.isWordLike)
        .map((seg) => seg.segment);
    }
    return query.split(/\s+/).filter(Boolean);
  },
});
