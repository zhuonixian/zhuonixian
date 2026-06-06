#!/usr/bin/env python3
"""同步 llm-wiki 文章到 VuePress 博客"""

import os
import re
import glob

SRC = "/home/zhang/workspace/Github/llm-wiki/wiki"
DST = "/home/zhang/workspace/Project/domain_application/zhuonixian/src/posts/wiki"

CATEGORY_MAP = {
    "concepts": "AI 概念",
    "topics": "技术领域",
    "comparisons": "技术对比",
    "entities": "公司与人物",
    "guides": "实践指南",
    "synthesis": "综合分析",
}

# 清理目标目录
if os.path.exists(DST):
    import shutil
    shutil.rmtree(DST)

count = 0

for dirname in os.listdir(SRC):
    dirpath = os.path.join(SRC, dirname)
    if not os.path.isdir(dirpath) or dirname == "templates":
        continue

    category = CATEGORY_MAP.get(dirname, dirname)
    os.makedirs(os.path.join(DST, dirname), exist_ok=True)

    for filename in os.listdir(dirpath):
        if not filename.endswith(".md"):
            continue

        filepath = os.path.join(dirpath, filename)
        with open(filepath, "r", encoding="utf-8") as f:
            raw = f.read()

        # 解析 frontmatter
        fm_match = re.match(r"^---\n(.*?)\n---\n?(.*)", raw, re.DOTALL)
        if fm_match:
            fm_text = fm_match.group(1)
            body = fm_match.group(2)
        else:
            fm_text = ""
            body = raw

        # 从原始 frontmatter 提取信息
        title = ""
        tags = []
        created = "2026-05-29"

        for line in fm_text.split("\n"):
            if line.startswith("title:"):
                title = line.split(":", 1)[1].strip()
            elif line.startswith("tags:"):
                tag_str = line.split(":", 1)[1].strip()
                if tag_str.startswith("["):
                    tags = [t.strip() for t in tag_str.strip("[]").split(",")]
            elif line.startswith("created:"):
                created = line.split(":", 1)[1].strip()

        # 如果没有从 frontmatter 提取到 title，从 H1 提取
        if not title:
            h1_match = re.search(r"^# (.+)$", body, re.MULTILINE)
            if h1_match:
                title = h1_match.group(1).strip()

        name = filename.replace(".md", "")
        if not title:
            title = name

        # 构建 VuePress frontmatter
        new_fm_lines = [
            "---",
            f"title: {title}",
            "icon: pen-to-square",
            f"date: {created}",
            "category:",
            f"  - {category}",
        ]

        if tags:
            new_fm_lines.append("tag:")
            for tag in tags:
                new_fm_lines.append(f"  - {tag}")

        new_fm_lines.append("---")

        # 清理双链语法
        # [[wiki/xxx|display]] -> [display](/posts/wiki/xxx.html)
        body = re.sub(
            r"\[\[wiki/([^|\]]+)\|([^\]]+)\]\]",
            r"[\2](/posts/wiki/\1.html)",
            body,
        )
        # [[wiki/xxx]] -> [xxx](/posts/wiki/xxx.html)
        body = re.sub(
            r"\[\[wiki/([^\]]+)\]\]",
            r"[\1](/posts/wiki/\1.html)",
            body,
        )
        # [[xxx|display]] -> [display]
        body = re.sub(r"\[\[([^|\]]+)\|([^\]]+)\]\]", r"[\2]", body)
        # [[xxx]] -> [xxx]
        body = re.sub(r"\[\[([^\]]+)\]\]", r"[\1]", body)

        # 组合新文件
        new_content = "\n".join(new_fm_lines) + "\n\n" + body.strip() + "\n"

        outpath = os.path.join(DST, dirname, filename)
        with open(outpath, "w", encoding="utf-8") as f:
            f.write(new_content)

        count += 1

print(f"Synced {count} articles")
