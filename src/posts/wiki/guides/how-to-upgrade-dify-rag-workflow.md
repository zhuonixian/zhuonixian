---
title: 如何改造 Dify RAG 工作流
icon: pen-to-square
date: 2026-05-30
category:
  - 实践指南
tag:
  - guide
  - dify
  - rag
  - workflow
  - llm-wiki
---

# 如何改造 Dify RAG 工作流

> 用 LLM Wiki 的"编译"思想替代 Dify 的自动解析，砍掉不稳定的分类环节，大幅提升输出质量。

## 问题诊断

当前工作流存在三个连锁问题：

1. **Dify 文档解析差** — 自动分段产生信息碎片，缺乏上下文
2. **LLM 问题分类不稳定** — 同一个问题可能被分到不同类别，下游检索随之偏移
3. **输出不稳定** — 垃圾片段进 → 垃圾回答出

根本原因：**知识库里的数据质量太低，靠检索和分类技巧无法弥补**。

## 改造方案：三步走

### Step 1：离线编译（替代 Dify 文档解析）

不要用 Dify 自动解析文档。改用 LLM 手动编译为结构化页面。

**原始做法**：上传 PDF/Word → Dify 自动分段 → 质量差
**新做法**：原始文档 → LLM 编译为 Markdown 页面 → 按结构分段 → 质量高

编译规则：

```
每篇文档编译为一个 Wiki 页面，结构如下：

---
title: 文档标题
tags: [标签1, 标签2]
category: 分类名
---

# 文档标题

## 概述
一段话概括本文档的核心内容。（这段就是最好的检索片段）

## 详细说明
### 子主题A
完整的、自包含的说明...

### 子主题B
完整的、自包含的说明...

## 常见问题
- Q: 常见问题1 → A: 答案
- Q: 常见问题2 → A: 答案

## 相关内容
- 链接到其他相关页面
```

**编译脚本示例（Python + Claude API）**：

```python
import anthropic
import os

client = anthropic.Anthropic()

def compile_document(raw_text: str, doc_type: str) -> str:
    """将原始文档编译为结构化 Wiki 页面"""
    response = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=4000,
        messages=[{
            "role": "user",
            "content": f"""你是一个知识编译器。将以下原始文档编译为结构化的 Wiki 页面。

要求：
1. 添加 YAML frontmatter（title, tags, category）
2. 第一段必须是 2-3 句话的概述（这是最重要的检索片段）
3. 按 ## 和 ### 组织内容，每个子章节自包含
4. 补充"常见问题"部分，预测用户可能的问题
5. 保留所有关键信息，删除冗余内容
6. 使用 Markdown 格式

文档类型：{doc_type}

原始文档：
{raw_text}"""
        }]
    )
    return response.content[0].text

# 批量编译
raw_dir = "./raw/"
wiki_dir = "./wiki/"

for filename in os.listdir(raw_dir):
    if filename.endswith(('.md', '.txt')):
        with open(os.path.join(raw_dir, filename)) as f:
            raw = f.read()
        compiled = compile_document(raw, "产品文档")
        output_path = os.path.join(wiki_dir, filename)
        with open(output_path, 'w') as f:
            f.write(compiled)
        print(f"编译完成: {filename}")
```

### Step 2：改分段策略（按标题分段，不按字数分段）

**Dify 默认分段问题**：按固定字数切割，一句话可能被劈成两半。

**改用 Markdown 标题分段**：每个 `##` 或 `###` 章节作为一个独立片段。

```python
import re
from dataclasses import dataclass

@dataclass
class Chunk:
    title: str
    content: str
    tags: list[str]
    category: str
    source: str

def split_wiki_page(md_text: str, source_file: str) -> list[Chunk]:
    """按 Markdown 标题分段，每个章节是独立片段"""
    # 解析 frontmatter
    fm_match = re.match(r'^---\n(.*?)\n---\n', md_text, re.DOTALL)
    frontmatter = fm_match.group(1) if fm_match else ""
    body = md_text[fm_match.end():] if fm_match else md_text

    # 提取元数据
    tags = re.findall(r'tags:\s*\[(.*?)\]', frontmatter)
    tags = [t.strip() for t in tags[0].split(',')] if tags else []
    category = re.findall(r'category:\s*(.*)', frontmatter)
    category = category[0].strip() if category else ""

    # 按 ## 标题分段
    sections = re.split(r'(?=^## )', body, flags=re.MULTILINE)

    chunks = []
    for section in sections:
        section = section.strip()
        if not section:
            continue

        # 提取标题
        title_match = re.match(r'^## (.+)', section)
        title = title_match.group(1) if title_match else source_file
        content = section.strip()

        # 只保留有实质内容的片段（> 50 字）
        if len(content) > 50:
            chunks.append(Chunk(
                title=title,
                content=content,
                tags=tags,
                category=category,
                source=source_file
            ))

    return chunks

# 使用示例
with open("wiki/some-document.md") as f:
    chunks = split_wiki_page(f.read(), "some-document.md")
    for chunk in chunks:
        print(f"[{chunk.category}] {chunk.title}: {len(chunk.content)} 字")
```

**关键区别**：

| 分段方式 | Dify 自动分段 | Wiki 标题分段 |
|---------|-------------|-------------|
| 切割依据 | 固定字数 | 语义边界（## 标题） |
| 片段完整性 | 可能切断句子 | 每个片段自包含 |
| 上下文信息 | 丢失 | 保留标题层级 |
| 检索质量 | 低 | 高 |

### Step 3：改造工作流（砍掉分类，直接检索生成）

**改造前**（4 步，2 次 LLM 调用）：

```
提问 → LLM分类 → 按类别检索 → LLM生成
        ↑ 不稳定        ↑ 受分类结果影响
```

**改造后**（2 步，1 次 LLM 调用）：

```
提问 → 向量检索 → LLM生成
        ↑ 稳定，不需要分类
```

为什么可以砍掉分类：

- 分类的作用是缩小检索范围 → 但 Wiki 页面结构清晰，向量检索本身就能精准匹配
- 砍掉分类 → 减少一次 LLM 调用 → 降低成本 + 降低延迟 + 消除不稳定因素

**Dify 工作流改造**：

```
开始节点
  ↓
[用户输入] 问题
  ↓
[知识检索] 节点
  - 知识库：选择编译后的 Wiki 页面知识库
  - 检索模式：混合检索（向量 + 关键词）
  - TopK：3-5（Wiki 片段信息密度高，不需要太多）
  - Score 阈值：0.5（可适当降低，Wiki 片段相关性强）
  ↓
[LLM] 节点
  - 模型：Claude / GPT-4
  - System Prompt：

    你是文档中心的智能助手。基于提供的参考资料回答用户问题。

    规则：
    1. 只基于参考资料中的信息回答，不要编造
    2. 如果参考资料不足以回答，明确告知用户并建议相关资源
    3. 回答要简洁准确，引用具体的文档来源
    4. 使用 Markdown 格式组织回答

  - 用户消息模板：

    参考资料：
    {{#context}}

    用户问题：{{question}}
  ↓
[输出] 回答
```

## 效果对比

| 指标 | 改造前 | 改造后 |
|------|--------|--------|
| 文档解析 | Dify 自动分段，质量差 | LLM 编译 + 标题分段，质量高 |
| 分类环节 | LLM 分类，不稳定 | 直接检索，无需分类 |
| LLM 调用次数 | 2 次（分类+生成） | 1 次（仅生成） |
| 响应延迟 | 高（多一次 LLM 调用） | 低 |
| 输出稳定性 | 不稳定（分类偏移+片段差） | 稳定（高质量片段+单次生成） |
| 维护成本 | 每次加文档都要调分类 | 编译一次，长期有效 |

## 持续维护流程

```
新文档进入
  ↓
放入 raw/ 目录
  ↓
运行编译脚本 → 生成 Wiki 页面到 wiki/
  ↓
运行分段脚本 → 生成高质量片段
  ↓
Embedding → 写入向量数据库
  ↓
悬浮窗助手自动使用新知识

整个过程可以自动化为 CI/CD 流水线
```

## 相关页面

- [RAG](/posts/wiki/concepts/retrieval-augmented-generation.html)：检索增强生成的基本原理
- [构建 RAG 系统](/posts/wiki/guides/how-to-build-rag-system.html)：RAG 系统的完整构建指南
- [RAG vs Compiled Wiki](/posts/wiki/comparisons/rag-vs-compiled-wiki.html)：两种范式的对比
- [提示词编写指南](/posts/wiki/guides/how-to-write-effective-prompts.html)：优化 LLM 生成的 Prompt 技巧
