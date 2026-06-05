---
title: Git 常用命令速查
icon: pen-to-square
date: 2026-06-05
category:
  - 技术
tag:
  - Git
  - 速查
---

# Git 常用命令速查

日常开发中经常用到的 Git 命令整理。

<!-- more -->

## 基础操作

```bash
# 初始化仓库
git init

# 克隆仓库
git clone git@github.com:user/repo.git

# 查看状态
git status

# 添加文件
git add .
git add file1.md file2.md

# 提交
git commit -m "feat: add new feature"

# 推送
git push origin main

# 拉取
git pull origin main
```

## 分支操作

```bash
# 创建并切换分支
git checkout -b feature/new-feature

# 切换分支
git checkout main

# 合并分支
git merge feature/new-feature

# 删除分支
git branch -d feature/new-feature

# 查看所有分支
git branch -a
```

## 撤销操作

```bash
# 撤销工作区修改
git checkout -- file.md

# 撤销暂存区
git reset HEAD file.md

# 查看提交历史
git log --oneline --graph

# 查看某个文件的修改历史
git log -p file.md
```

## 标签

```bash
# 创建标签
git tag v1.0.0

# 推送标签
git push origin v1.0.0

# 查看所有标签
git tag
```

## 小技巧

- 使用 `git stash` 临时保存修改
- 使用 `git cherry-pick <hash>` 选择性合并提交
- 使用 `.gitignore` 忽略不需要跟踪的文件
