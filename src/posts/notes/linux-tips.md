---
title: Linux 常用技巧
icon: pen-to-square
date: 2026-05-15
category:
  - 笔记
tag:
  - Linux
  - 命令行
---

# Linux 常用技巧

日常使用 Linux 过程中积累的一些实用技巧。

<!-- more -->

## 文件查找

```bash
# 按名称查找
find . -name "*.log"

# 按内容搜索
grep -rn "search_text" /path/to/dir/

# 查找大文件
du -sh * | sort -rh | head -10
```

## 进程管理

```bash
# 查看端口占用
lsof -i :8080
ss -tlnp | grep 8080

# 杀掉进程
kill -9 $(lsof -t -i :8080)

# 查看进程树
ps auxf
```

## 磁盘管理

```bash
# 查看磁盘使用
df -h

# 查看目录大小
du -sh /path/to/dir

# 清理系统缓存
sudo sync && sudo sysctl -w vm.drop_caches=3
```

## 网络工具

```bash
# 测试网络连通性
curl -I https://example.com

# 下载文件
wget -c https://example.com/file.tar.gz

# 查看公网 IP
curl ifconfig.me
```

## 实用命令

```bash
# 批量重命名
for f in *.txt; do mv "$f" "${f%.txt}.md"; done

# 监控日志
tail -f /var/log/syslog

# 快速创建临时 HTTP 服务
python3 -m http.server 8080
```
