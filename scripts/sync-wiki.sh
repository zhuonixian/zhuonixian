#!/bin/bash
# 同步 llm-wiki 文章到 VuePress 博客
# 转换 frontmatter 格式，清理双链语法

SRC="/home/zhang/workspace/Github/llm-wiki/wiki"
DST="/home/zhang/workspace/Project/domain_application/zhuonixian/src/posts/wiki"

# 清理目标目录
rm -rf "$DST"

# 分类映射（wiki目录 -> 博客分类）
declare -A CATEGORY_MAP=(
  ["concepts"]="AI 概念"
  ["topics"]="技术领域"
  ["comparisons"]="技术对比"
  ["entities"]="公司与人物"
  ["guides"]="实践指南"
  ["synthesis"]="综合分析"
)

# 遍历所有子目录
for dir in "$SRC"/*/; do
  dirname=$(basename "$dir")

  # 跳过 templates
  [[ "$dirname" == "templates" ]] && continue

  category="${CATEGORY_MAP[$dirname]:-$dirname}"

  # 创建目标目录
  mkdir -p "$DST/$dirname"

  # 处理每个 md 文件
  for file in "$dir"*.md; do
    [[ ! -f "$file" ]] && continue

    filename=$(basename "$file")
    name="${filename%.md}"

    # 读取原文
    content=$(cat "$file")

    # 提取 title（从 H1 或 frontmatter）
    title=$(echo "$content" | grep -m1 '^# ' | sed 's/^# //')

    # 提取 tags
    tags=$(echo "$content" | grep -m1 '^tags:' | sed 's/tags: *\[\(.*\)\]/\1/')

    # 生成 date
    created=$(echo "$content" | grep -m1 '^created:' | sed 's/created: *//')
    [[ -z "$created" ]] && created="2026-05-29"

    # 构建 VuePress frontmatter
    fm="---"
    fm="${fm}\ntitle: ${title:-$name}"
    fm="${fm}\nicon: pen-to-square"
    fm="${fm}\ndate: ${created}"

    # 添加 category
    fm="${fm}\ncategory:"
    fm="${fm}\n  - ${category}"

    # 添加 tags
    if [[ -n "$tags" ]]; then
      fm="${fm}\ntag:"
      IFS=',' read -ra TAG_ARRAY <<< "$tags"
      for tag in "${TAG_ARRAY[@]}"; do
        tag=$(echo "$tag" | xargs)
        fm="${fm}\n  - ${tag}"
      done
    fi

    fm="${fm}\n---"

    # 提取 body（去掉原始 frontmatter）
    body=$(echo "$content" | sed '1{/^---$/d}; /^---$/,{/^---$/d}; /^---$/d' | sed '1{/^---$/d}')

    # 如果 body 仍然包含 frontmatter 残余，再清理一次
    body=$(echo "$body" | awk '
      BEGIN { in_fm=0; fm_count=0 }
      /^---$/ { fm_count++; if(fm_count<=2) { in_fm=1; next } }
      in_fm && /^---$/ { in_fm=0; next }
      !in_fm { print }
    ')

    # 清理双链语法 [[wiki/xxx]] -> [xxx](/posts/wiki/xxx.html)
    body=$(echo "$body" | sed -E 's/\[\[wiki\/([^]]+)\]\]/[\1](\/posts\/wiki\/\1.html)/g')
    # 也处理 [[xxx]] 格式
    body=$(echo "$body" | sed -E 's/\[\[([^]|]+)\]\]/[\1]/g')
    # 处理 [[xxx|display]] 格式
    body=$(echo "$body" | sed -E 's/\[\[([^|]+)\|([^]]+)\]\]/[\2]/g')

    # 去掉重复的 H1（保留 body 中的）
    # body 中可能已经有 # title，如果和 frontmatter title 重复就保留

    # 写入目标文件
    echo -e "$fm\n\n$body" > "$DST/$dirname/$filename"
  done
done

echo "Synced!"
find "$DST" -name "*.md" | wc -l
