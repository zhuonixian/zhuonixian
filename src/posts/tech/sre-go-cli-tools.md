---
title: Go 开发运维工具：CLI 工具开发实战
icon: terminal
date: 2026-06-13
category:
  - 技术
tag:
  - Go
  - SRE
  - CLI
  - 运维工具
---

# Go 开发运维工具：CLI 工具开发实战

从日志分析到批量运维，用 Go 构建生产级命令行工具的完整指南。

<!-- more -->

## 为什么用 Go 开发运维工具

运维团队每天都和命令行打交道。面对重复的巡检、日志排查、批量操作，Python 脚本能解决一部分问题，但在以下场景下 Go 更有优势：

**单二进制分发**：编译后只有一个可执行文件，无需安装运行时、无需管理依赖。`scp` 一个文件到目标机器就能跑，这在生产环境中极其重要——你不会想在 50 台服务器上挨个装 Python 依赖。

**跨平台编译**：一行命令生成 Linux/Windows/macOS 版本：

```bash
GOOS=linux GOARCH=amd64 go build -o mytool-linux-amd64 .
GOOS=darwin GOARCH=arm64 go build -o mytool-darwin-arm64 .
```

**标准库强大**：`net/http`、`encoding/json`、`os/exec`、`regexp`、`text/template`——运维工具需要的能力基本都内置了，大幅减少外部依赖。

**天然并发**：goroutine + channel 让并发任务变得简单。批量检查 100 台服务器的健康状态？几行代码搞定。

**启动快、资源占用低**：没有 VM 预热，内存占用通常在 10-20MB 级别，适合在资源受限的环境中运行。

## cobra：CLI 应用骨架

[cobra](https://github.com/spf13/cobra) 是 Go 生态中最主流的 CLI 框架，`kubectl`、`hugo`、`gh` 等知名项目都在用它。它提供了命令嵌套、参数解析、自动帮助生成等核心能力。

### 项目初始化

```bash
mkdir logtool && cd logtool
go mod init github.com/yourname/logtool
go get github.com/spf13/cobra@latest
```

### 最小骨架

```
.
├── go.mod
├── go.sum
├── main.go
└── cmd/
    └── root.go
```

`main.go` 保持极简：

```go
package main

import "github.com/yourname/logtool/cmd"

func main() {
	cmd.Execute()
}
```

`cmd/root.go` 定义根命令：

```go
package cmd

import (
	"fmt"
	"os"

	"github.com/spf13/cobra"
)

var cfgFile string

var rootCmd = &cobra.Command{
	Use:   "logtool",
	Short: "日志分析与运维 CLI 工具集",
	Long: `logtool 是一个面向 SRE 的命令行工具集，
支持日志分析、服务健康检查、批量操作等功能。`,
	Run: func(cmd *cobra.Command, args []string) {
		fmt.Println("使用 --help 查看可用命令")
	},
}

func Execute() {
	if err := rootCmd.Execute(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

func init() {
	rootCmd.PersistentFlags().StringVarP(&cfgFile, "config", "c", "", "配置文件路径")
}
```

### rootCmd vs subCmd vs flags

cobra 的核心概念只有三个：

- **rootCmd**：程序的入口命令，对应 `logtool`
- **subCmd**：子命令，对应 `logtool analyze`、`logtool health`
- **flags**：命令参数

参数分为两种作用域：

```go
// Local Flags — 只对当前命令生效
cmd.Flags().StringP("output", "o", "text", "输出格式: text|json")

// Persistent Flags — 对当前命令及其所有子命令生效
cmd.PersistentFlags().StringP("config", "c", "", "配置文件路径")
```

来看一个完整的子命令注册：

```go
package cmd

import (
	"fmt"
	"os"

	"github.com/spf13/cobra"
)

var analyzeOutput string
var analyzePattern string

var analyzeCmd = &cobra.Command{
	Use:   "analyze [日志文件路径]",
	Short: "分析日志文件",
	Args:  cobra.MaximumNArgs(1),
	Run: func(cmd *cobra.Command, args []string) {
		fmt.Println("输出格式:", analyzeOutput)
		fmt.Println("匹配模式:", analyzePattern)
		// 实际分析逻辑在后面展开
	},
}

func init() {
	rootCmd.AddCommand(analyzeCmd)
	analyzeCmd.Flags().StringVarP(&analyzeOutput, "output", "o", "text", "输出格式: text|json")
	analyzeCmd.Flags().StringVarP(&analyzePattern, "pattern", "p", "", "过滤正则表达式")
}
```

编译运行：

```bash
go build -o logtool .
./logtool analyze /var/log/app.log -p "ERROR.*timeout" -o json
```

## 实战 1：日志分析工具

这是运维工作中最高频的场景之一——从几百 MB 的日志中快速定位问题。

### 完整代码

`cmd/analyze.go`：

```go
package cmd

import (
	"bufio"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"regexp"
	"sort"
	"strings"
	"time"

	"github.com/spf13/cobra"
)

var (
	analyzePattern string
	analyzeLevel   string
	analyzeOutput  string
	analyzeTop     int
)

// LogEntry 表示一条日志记录
type LogEntry struct {
	Raw      string
	Level    string
	Time     string
	IP       string
	Matched  bool
}

// Stats 统计结果
type Stats struct {
	TotalLines    int            `json:"total_lines"`
	MatchedLines  int            `json:"matched_lines"`
	ByLevel       map[string]int `json:"by_level"`
	ByIP          map[string]int `json:"by_ip"`
	ByHour        map[string]int `json:"by_hour"`
}

var analyzeCmd = &cobra.Command{
	Use:   "analyze [日志文件]",
	Short: "分析日志文件，支持过滤、搜索和聚合统计",
	Long: `分析日志文件，支持以下功能：
  - 正则过滤
  - 按日志级别筛选
  - 按时间/级别/IP 聚合统计
  - 支持管道输入`,
	Args: cobra.MaximumNArgs(1),
	Example: `  # 分析文件
  logtool analyze app.log -p "ERROR.*timeout"

  # 管道输入
  cat app.log | logtool analyze --level ERROR

  # JSON 输出
  logtool analyze app.log -o json`,
	RunE: func(cmd *cobra.Command, args []string) error {
		var reader io.Reader

		if len(args) > 0 {
			f, err := os.Open(args[0])
			if err != nil {
				return fmt.Errorf("打开文件失败: %w", err)
			}
			defer f.Close()
			reader = f
		} else {
			// 检查是否有管道输入
			stat, _ := os.Stdin.Stat()
			if (stat.Mode() & os.ModeCharDevice) != 0 {
				return fmt.Errorf("请提供日志文件路径或通过管道输入")
			}
			reader = os.Stdin
		}

		var pattern *regexp.Regexp
		if analyzePattern != "" {
			var err error
			pattern, err = regexp.Compile(analyzePattern)
			if err != nil {
				return fmt.Errorf("正则表达式编译失败: %w", err)
			}
		}

		stats := &Stats{
			ByLevel: make(map[string]int),
			ByIP:   make(map[string]int),
			ByHour: make(map[string]int),
		}

		// 常见日志级别
		levelPattern := regexp.MustCompile(`(?i)\b(ERROR|WARN|WARNING|INFO|DEBUG|FATAL|CRITICAL)\b`)
		ipPattern := regexp.MustCompile(`\b(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\b`)
		timePattern := regexp.MustCompile(`(\d{4}-\d{2}-\d{2})[T ](\d{2}):\d{2}:\d{2}`)

		scanner := bufio.NewScanner(reader)
		// 增大缓冲区以处理长行
		buf := make([]byte, 0, 64*1024)
		scanner.Buffer(buf, 10*1024*1024)

		for scanner.Scan() {
			line := scanner.Text()
			stats.TotalLines++

			entry := parseLine(line, levelPattern, ipPattern, timePattern)

			// 按级别过滤
			if analyzeLevel != "" && !strings.EqualFold(entry.Level, analyzeLevel) {
				continue
			}

			// 按正则过滤
			if pattern != nil {
				if !pattern.MatchString(line) {
					continue
				}
				entry.Matched = true
			}

			stats.MatchedLines++

			// 聚合统计
			if entry.Level != "" {
				stats.ByLevel[strings.ToUpper(entry.Level)]++
			}
			if entry.IP != "" {
				stats.ByIP[entry.IP]++
			}
			if entry.Time != "" {
				stats.ByHour[entry.Time]++
			}
		}

		if err := scanner.Err(); err != nil {
			return fmt.Errorf("读取输入失败: %w", err)
		}

		return printStats(stats)
	},
}

func parseLine(line string, levelPat, ipPat, timePat *regexp.Regexp) LogEntry {
	entry := LogEntry{Raw: line}

	if m := levelPat.FindStringSubmatch(line); len(m) > 1 {
		entry.Level = m[1]
	}
	if m := ipPat.FindStringSubmatch(line); len(m) > 1 {
		entry.IP = m[1]
	}
	if m := timePat.FindStringSubmatch(line); len(m) > 2 {
		// 格式: "2026-06-13 14"
		entry.Time = fmt.Sprintf("%s %s:00", m[1], m[2])
	}

	return entry
}

func printStats(stats *Stats) error {
	switch analyzeOutput {
	case "json":
		encoder := json.NewEncoder(os.Stdout)
		encoder.SetIndent("", "  ")
		return encoder.Encode(stats)

	default:
		fmt.Println("=== 日志分析结果 ===")
		fmt.Printf("总行数: %d\n", stats.TotalLines)
		fmt.Printf("匹配行数: %d\n", stats.MatchedLines)
		if stats.TotalLines > 0 {
			fmt.Printf("匹配率: %.2f%%\n",
				float64(stats.MatchedLines)/float64(stats.TotalLines)*100)
		}

		fmt.Println("\n--- 按级别 ---")
		printSortedMap(stats.ByLevel, analyzeTop)

		fmt.Println("\n--- 按 IP (Top N) ---")
		printSortedMap(stats.ByIP, analyzeTop)

		fmt.Println("\n--- 按小时 ---")
		printSortedMap(stats.ByHour, analyzeTop)

		return nil
	}
}

func printSortedMap(m map[string]int, top int) {
	type kv struct {
		Key   string
		Value int
	}

	var sorted []kv
	for k, v := range m {
		sorted = append(sorted, kv{k, v})
	}
	sort.Slice(sorted, func(i, j int) bool {
		return sorted[i].Value > sorted[j].Value
	})

	if top > 0 && len(sorted) > top {
		sorted = sorted[:top]
	}

	for _, item := range sorted {
		fmt.Printf("  %-30s %d\n", item.Key, item.Value)
	}
}

func init() {
	rootCmd.AddCommand(analyzeCmd)
	analyzeCmd.Flags().StringVarP(&analyzePattern, "pattern", "p", "", "正则过滤表达式")
	analyzeCmd.Flags().StringVarP(&analyzeLevel, "level", "l", "", "日志级别过滤 (ERROR|WARN|INFO|DEBUG)")
	analyzeCmd.Flags().StringVarP(&analyzeOutput, "output", "o", "text", "输出格式: text|json")
	analyzeCmd.Flags().IntVarP(&analyzeTop, "top", "n", 10, "每个维度显示的 Top N")
}
```

### 使用示例

```bash
# 构建
go build -o logtool .

# 分析 nginx 日志，查找 5xx 错误
./logtool analyze /var/log/nginx/access.log -p " 5\d{2} "

# 筛选 ERROR 级别日志
./logtool analyze app.log --level ERROR -o json

# 管道方式，结合其他工具
cat app.log | grep "payment" | ./logtool analyze --level ERROR

# 查看每小时错误分布
./logtool analyze app.log -l ERROR -n 24
```

JSON 输出示例：

```json
{
  "total_lines": 152340,
  "matched_lines": 387,
  "by_level": {
    "ERROR": 312,
    "WARN": 75
  },
  "by_ip": {
    "10.0.1.23": 89,
    "10.0.1.45": 67,
    "10.0.1.12": 54
  },
  "by_hour": {
    "2026-06-13 14:00": 128,
    "2026-06-13 15:00": 97,
    "2026-06-13 10:00": 62
  }
}
```

## 实战 2：服务健康检查工具

运维巡检的另一个核心场景：快速检查一批服务的可用性。

### 完整代码

`cmd/health.go`：

```go
package cmd

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/spf13/cobra"
)

var (
	healthTimeout  time.Duration
	healthWorkers  int
	healthOutput   string
	healthFile     string
)

// Target 检查目标
type Target struct {
	Name string
	URL  string
}

// CheckResult 检查结果
type CheckResult struct {
	Name      string        `json:"name"`
	URL       string        `json:"url"`
	Status    string        `json:"status"`
	StatusCode int          `json:"status_code,omitempty"`
	Latency   time.Duration `json:"latency"`
	Error     string        `json:"error,omitempty"`
}

// HealthReport 健康检查报告
type HealthReport struct {
	Timestamp time.Time    `json:"timestamp"`
	Total     int          `json:"total"`
	Healthy   int          `json:"healthy"`
	Unhealthy int          `json:"unhealthy"`
	Results   []CheckResult `json:"results"`
}

var healthCmd = &cobra.Command{
	Use:   "health",
	Short: "并发检查多个 HTTP 端点的健康状态",
	Long: `并发检查多个 HTTP 端点的健康状态。

目标来源（优先级）：
  1. --file 指定的文件（每行一个 URL，格式: 名称 URL）
  2. 命令行直接传入的 URL`,
	Example: `  # 直接传入 URL
  logtool health https://api.example.com/health https://db.example.com:9200/_cluster/health

  # 从文件读取目标
  logtool health --file targets.txt --timeout 5s --workers 20

  # JSON 输出（便于接入告警系统）
  logtool health --file targets.txt -o json`,
	RunE: func(cmd *cobra.Command, args []string) error {
		targets, err := buildTargets(args)
		if err != nil {
			return err
		}
		if len(targets) == 0 {
			return fmt.Errorf("未指定检查目标")
		}

		report := runChecks(targets)
		return printReport(report)
	},
}

func buildTargets(args []string) ([]Target, error) {
	var targets []Target

	if healthFile != "" {
		data, err := os.ReadFile(healthFile)
		if err != nil {
			return nil, fmt.Errorf("读取目标文件失败: %w", err)
		}
		for _, line := range strings.Split(string(data), "\n") {
			line = strings.TrimSpace(line)
			if line == "" || strings.HasPrefix(line, "#") {
				continue
			}
			parts := strings.Fields(line)
			if len(parts) >= 2 {
				targets = append(targets, Target{Name: parts[0], URL: parts[1]})
			} else if len(parts) == 1 {
				targets = append(targets, Target{Name: parts[0], URL: parts[0]})
			}
		}
	}

	for _, url := range args {
		targets = append(targets, Target{Name: url, URL: url})
	}

	return targets, nil
}

func runChecks(targets []Target) *HealthReport {
	report := &HealthReport{
		Timestamp: time.Now(),
		Total:     len(targets),
		Results:   make([]CheckResult, 0, len(targets)),
	}

	results := make(chan CheckResult, len(targets))
	sem := make(chan struct{}, healthWorkers)

	var wg sync.WaitGroup
	for _, t := range targets {
		wg.Add(1)
		go func(target Target) {
			defer wg.Done()
			sem <- struct{}{}
			defer func() { <-sem }()
			results <- checkTarget(target)
		}(t)
	}

	go func() {
		wg.Wait()
		close(results)
	}()

	for r := range results {
		report.Results = append(report.Results, r)
		if r.Status == "healthy" {
			report.Healthy++
		} else {
			report.Unhealthy++
		}
	}

	return report
}

func checkTarget(target Target) CheckResult {
	result := CheckResult{
		Name: target.Name,
		URL:  target.URL,
	}

	client := &http.Client{Timeout: healthTimeout}
	start := time.Now()

	resp, err := client.Get(target.URL)
	result.Latency = time.Since(start)

	if err != nil {
		result.Status = "unhealthy"
		result.Error = err.Error()
		return result
	}
	defer resp.Body.Close()

	result.StatusCode = resp.StatusCode
	if resp.StatusCode >= 200 && resp.StatusCode < 400 {
		result.Status = "healthy"
	} else {
		result.Status = "unhealthy"
		result.Error = fmt.Sprintf("HTTP %d", resp.StatusCode)
	}

	return result
}

func printReport(report *HealthReport) error {
	switch healthOutput {
	case "json":
		encoder := json.NewEncoder(os.Stdout)
		encoder.SetIndent("", "  ")
		return encoder.Encode(report)

	default:
		fmt.Println("=== 服务健康检查报告 ===")
		fmt.Printf("时间: %s\n", report.Timestamp.Format("2006-01-02 15:04:05"))
		fmt.Printf("总数: %d  |  健康: %s%d%s  |  异常: %s%d%s\n",
			report.Total,
			green, report.Healthy, reset,
			red, report.Unhealthy, reset,
		)
		fmt.Println(strings.Repeat("-", 70))

		for _, r := range report.Results {
			var icon string
			var color string
			switch r.Status {
			case "healthy":
				icon = "OK"
				color = green
			default:
				icon = "FAIL"
				color = red
			}

			latency := fmt.Sprintf("%dms", r.Latency.Milliseconds())
			fmt.Printf("  %s[%s]%s %-40s %s  %s\n",
				color, icon, reset,
				truncate(r.Name, 40),
				latency,
				r.Error,
			)
		}

		fmt.Println(strings.Repeat("-", 70))
		if report.Unhealthy > 0 {
			fmt.Printf("%s%d 个服务异常%s\n", red, report.Unhealthy, reset)
		} else {
			fmt.Printf("%s全部服务正常%s\n", green, reset)
		}

		return nil
	}
}

func truncate(s string, maxLen int) string {
	if len(s) <= maxLen {
		return s
	}
	return s[:maxLen-3] + "..."
}

// ANSI 颜色
const (
	red   = "\033[31m"
	green = "\033[32m"
	reset = "\033[0m"
)

func init() {
	rootCmd.AddCommand(healthCmd)
	healthCmd.Flags().DurationVarP(&healthTimeout, "timeout", "t", 5*time.Second, "单个请求超时时间")
	healthCmd.Flags().IntVarP(&healthWorkers, "workers", "w", 10, "并发工作数")
	healthCmd.Flags().StringVarP(&healthOutput, "output", "o", "text", "输出格式: text|json")
	healthCmd.Flags().StringVarP(&healthFile, "file", "f", "", "目标文件路径（每行: 名称 URL）")
}
```

### 目标文件示例 `targets.txt`

```
# 基础设施
API服务 https://api.example.com/health
数据库  https://db.example.com:9200/_cluster/health
Redis   https://redis.example.com:6379/ping
```

### 使用示例

```bash
# 并发检查多个端点
./logtool health https://httpbin.org/status/200 https://httpbin.org/status/503

# 从文件读取，20 并发，3 秒超时
./logtool health -f targets.txt -w 20 -t 3s

# JSON 输出，对接告警
./logtool health -f targets.txt -o json | jq '.results[] | select(.status=="unhealthy")'
```

终端输出效果：

```
=== 服务健康检查报告 ===
时间: 2026-06-13 14:30:05
总数: 3  |  健康: 2  |  异常: 1
----------------------------------------------------------------------
  [OK]   API服务                              45ms
  [OK]   数据库                                120ms
  [FAIL] Redis                                3015ms  Get "https://...": context deadline exceeded
----------------------------------------------------------------------
1 个服务异常
```

## 实战 3：批量操作工具

SSH 批量执行命令是运维的看家本领。这个工具实现了并发 SSH、超时控制和结果汇总。

### 安装依赖

```bash
go get golang.org/x/crypto/ssh@latest
```

### 完整代码

`cmd/batch.go`：

```go
package cmd

import (
	"encoding/json"
	"fmt"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/spf13/cobra"
	"golang.org/x/crypto/ssh"
)

var (
	batchUser      string
	batchKeyFile   string
	batchPassword  string
	batchPort      int
	batchTimeout   time.Duration
	batchWorkers   int
	batchOutput    string
	batchHostFile  string
)

// HostResult 单台主机执行结果
type HostResult struct {
	Host     string        `json:"host"`
	Success  bool          `json:"success"`
	Output   string        `json:"output"`
	Error    string        `json:"error,omitempty"`
	Duration time.Duration `json:"duration"`
}

// BatchReport 批量执行报告
type BatchReport struct {
	Command  string       `json:"command"`
	Total    int          `json:"total"`
	Success  int          `json:"success"`
	Failed   int          `json:"failed"`
	Results  []HostResult `json:"results"`
}

var batchCmd = &cobra.Command{
	Use:   "batch <command>",
	Short: "通过 SSH 在多台主机上批量执行命令",
	Long: `通过 SSH 在多台主机上批量执行命令。

主机来源（优先级）：
  1. --file 指定的主机列表文件（每行一个 IP/主机名）
  2. --hosts 逗号分隔的主机列表

认证方式（优先级）：
  1. --key 指定的 SSH 私钥文件
  2. --password 指定的密码`,
	Args: cobra.ExactArgs(1),
	Example: `  # 在多台主机上执行 df -h
  logtool batch "df -h" --hosts "10.0.1.1,10.0.1.2,10.0.1.3" --key ~/.ssh/id_rsa

  # 从文件读取主机列表
  logtool batch "uptime" --file hosts.txt --user deploy --timeout 10s

  # 使用密码认证
  logtool batch "systemctl status nginx" --hosts "web1,web2" --password secret`,
	RunE: func(cmd *cobra.Command, args []string) error {
		hosts, err := loadHosts()
		if err != nil {
			return err
		}
		if len(hosts) == 0 {
			return fmt.Errorf("未指定目标主机")
		}

		sshConfig, err := buildSSHConfig()
		if err != nil {
			return err
		}

		report := executeBatch(hosts, args[0], sshConfig)
		return printBatchReport(report)
	},
}

func loadHosts() ([]string, error) {
	var hosts []string

	if batchHostFile != "" {
		data, err := os.ReadFile(batchHostFile)
		if err != nil {
			return nil, fmt.Errorf("读取主机文件失败: %w", err)
		}
		for _, line := range strings.Split(string(data), "\n") {
			line = strings.TrimSpace(line)
			if line != "" && !strings.HasPrefix(line, "#") {
				hosts = append(hosts, line)
			}
		}
	}

	if cmd, _ := batchCmd.Flags().GetString("hosts"); cmd != "" {
		for _, h := range strings.Split(cmd, ",") {
			h = strings.TrimSpace(h)
			if h != "" {
				hosts = append(hosts, h)
			}
		}
	}

	return hosts, nil
}

func buildSSHConfig() (*ssh.ClientConfig, error) {
	var authMethods []ssh.AuthMethod

	// 优先使用密钥认证
	if batchKeyFile != "" {
		key, err := os.ReadFile(batchKeyFile)
		if err != nil {
			return nil, fmt.Errorf("读取私钥文件失败: %w", err)
		}
		signer, err := ssh.ParsePrivateKey(key)
		if err != nil {
			return nil, fmt.Errorf("解析私钥失败: %w", err)
		}
		authMethods = append(authMethods, ssh.PublicKeys(signer))
	}

	// 密码认证
	if batchPassword != "" {
		authMethods = append(authMethods, ssh.Password(batchPassword))
	}

	if len(authMethods) == 0 {
		return nil, fmt.Errorf("请指定 --key 或 --password 进行认证")
	}

	config := &ssh.ClientConfig{
		User:            batchUser,
		Auth:            authMethods,
		Timeout:         batchTimeout,
		HostKeyCallback: ssh.InsecureIgnoreHostKey(), // 生产环境应使用 known_hosts
	}

	return config, nil
}

func executeBatch(hosts []string, command string, sshConfig *ssh.ClientConfig) *BatchReport {
	report := &BatchReport{
		Command: command,
		Total:   len(hosts),
		Results: make([]HostResult, 0, len(hosts)),
	}

	resultChan := make(chan HostResult, len(hosts))
	sem := make(chan struct{}, batchWorkers)

	var wg sync.WaitGroup
	for _, host := range hosts {
		wg.Add(1)
		go func(h string) {
			defer wg.Done()
			sem <- struct{}{}
			defer func() { <-sem }()
			resultChan <- executeOnHost(h, command, sshConfig)
		}(host)
	}

	go func() {
		wg.Wait()
		close(resultChan)
	}()

	for r := range resultChan {
		report.Results = append(report.Results, r)
		if r.Success {
			report.Success++
		} else {
			report.Failed++
		}
	}

	return report
}

func executeOnHost(host, command string, config *ssh.ClientConfig) HostResult {
	result := HostResult{Host: host}
	start := time.Now()

	addr := fmt.Sprintf("%s:%d", host, batchPort)
	conn, err := ssh.Dial("tcp", addr, config)
	if err != nil {
		result.Error = fmt.Sprintf("连接失败: %v", err)
		result.Duration = time.Since(start)
		return result
	}
	defer conn.Close()

	session, err := conn.NewSession()
	if err != nil {
		result.Error = fmt.Sprintf("创建会话失败: %v", err)
		result.Duration = time.Since(start)
		return result
	}
	defer session.Close()

	output, err := session.CombinedOutput(command)
	result.Duration = time.Since(start)

	if err != nil {
		result.Error = err.Error()
		result.Output = string(output)
		return result
	}

	result.Success = true
	result.Output = strings.TrimSpace(string(output))
	return result
}

func printBatchReport(report *BatchReport) error {
	switch batchOutput {
	case "json":
		encoder := json.NewEncoder(os.Stdout)
		encoder.SetIndent("", "  ")
		return encoder.Encode(report)

	default:
		fmt.Println("=== 批量执行报告 ===")
		fmt.Printf("命令: %s\n", report.Command)
		fmt.Printf("总数: %d  |  成功: %s%d%s  |  失败: %s%d%s\n",
			report.Total,
			green, report.Success, reset,
			red, report.Failed, reset,
		)
		fmt.Println(strings.Repeat("-", 60))

		for _, r := range report.Results {
			status := "OK"
			color := green
			if !r.Success {
				status = "FAIL"
				color = red
			}
			fmt.Printf("  %s[%s]%s %-20s (%s)\n", color, status, reset, r.Host, r.Duration)
			if r.Output != "" {
				// 缩进输出
				for _, line := range strings.Split(r.Output, "\n") {
					fmt.Printf("    %s\n", line)
				}
			}
			if r.Error != "" {
				fmt.Printf("    %s错误: %s%s\n", red, r.Error, reset)
			}
		}

		return nil
	}
}

func init() {
	rootCmd.AddCommand(batchCmd)
	batchCmd.Flags().StringVarP(&batchUser, "user", "u", "root", "SSH 用户名")
	batchCmd.Flags().StringVarP(&batchKeyFile, "key", "k", "", "SSH 私钥文件路径")
	batchCmd.Flags().StringVarP(&batchPassword, "password", "P", "", "SSH 密码")
	batchCmd.Flags().IntVarP(&batchPort, "port", "p", 22, "SSH 端口")
	batchCmd.Flags().DurationVarP(&batchTimeout, "timeout", "t", 10*time.Second, "连接超时")
	batchCmd.Flags().IntVarP(&batchWorkers, "workers", "w", 5, "并发数")
	batchCmd.Flags().StringVarP(&batchOutput, "output", "o", "text", "输出格式: text|json")
	batchCmd.Flags().StringVarP(&batchHostFile, "file", "f", "", "主机列表文件路径")
	batchCmd.Flags().String("hosts", "", "逗号分隔的主机列表")
}
```

### 使用示例

```bash
# 使用 SSH 密钥在 3 台主机上执行命令
./logtool batch "df -h" --hosts "10.0.1.1,10.0.1.2,10.0.1.3" -k ~/.ssh/id_rsa

# 从文件读取主机列表
./logtool batch "uptime" -f hosts.txt -u deploy -t 15s

# 20 并发，JSON 输出
./logtool batch "systemctl is-active nginx" -f web-hosts.txt -w 20 -o json

# 检查磁盘空间并过滤
./logtool batch "df -h /data" -f hosts.txt -k ~/.ssh/id_rsa | grep -A5 "90%"
```

## CLI 工具最佳实践

### 配置管理

不要把所有参数都塞进命令行。用 [viper](https://github.com/spf13/viper) 实现配置文件 + 环境变量 + 命令行参数三层优先级：

```go
package config

import (
	"fmt"
	"os"

	"github.com/spf13/viper"
)

type Config struct {
	DefaultTimeout string            `mapstructure:"default_timeout"`
	DefaultWorkers int               `mapstructure:"default_workers"`
	SSHUser        string            `mapstructure:"ssh_user"`
	SSHKeyFile     string            `mapstructure:"ssh_key_file"`
	Hosts          map[string]string `mapstructure:"hosts"`
}

func Load(cfgFile string) (*Config, error) {
	v := viper.New()

	// 设置默认值
	v.SetDefault("default_timeout", "10s")
	v.SetDefault("default_workers", 5)
	v.SetDefault("ssh_user", "root")

	// 环境变量前缀
	v.SetEnvPrefix("LOGTOOL")
	v.AutomaticEnv()

	// 配置文件
	if cfgFile != "" {
		v.SetConfigFile(cfgFile)
	} else {
		v.SetConfigName(".logtool")
		v.AddConfigPath("$HOME")
		v.AddConfigPath(".")
	}

	if err := v.ReadInConfig(); err != nil {
		if _, ok := err.(viper.ConfigFileNotFoundError); !ok {
			return nil, fmt.Errorf("读取配置文件失败: %w", err)
		}
		// 配置文件不存在不是错误，使用默认值
	}

	var cfg Config
	if err := v.Unmarshal(&cfg); err != nil {
		return nil, fmt.Errorf("解析配置失败: %w", err)
	}

	return &cfg, nil
}
```

配置文件 `.logtool.yaml`：

```yaml
default_timeout: 10s
default_workers: 10
ssh_user: deploy
ssh_key_file: ~/.ssh/id_ed25519

hosts:
  web1: 10.0.1.1
  web2: 10.0.1.2
  db1:  10.0.2.1
```

环境变量覆盖：

```bash
export LOGTOOL_DEFAULT_TIMEOUT=30s
export LOGTOOL_SSH_USER=admin
```

### 结构化日志输出

Go 1.21 引入的 `log/slog` 是标准库的结构化日志方案，无需引入第三方包：

```go
package main

import (
	"log/slog"
	"os"
)

func setupLogger(verbose bool) {
	level := slog.LevelInfo
	if verbose {
		level = slog.LevelDebug
	}

	handler := slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{
		Level: level,
	})

	slog.SetDefault(slog.New(handler))
}

// 使用示例
func exampleUsage() {
	slog.Info("开始健康检查",
		"targets", 10,
		"timeout", "5s",
	)

	slog.Debug("连接详情",
		"host", "10.0.1.1",
		"port", 22,
		"user", "deploy",
	)

	slog.Error("连接失败",
		"host", "10.0.1.1",
		"error", "connection refused",
		"attempt", 3,
	)
}
```

输出：

```
time=2026-06-13T14:30:05.123Z level=INFO msg="开始健康检查" targets=10 timeout=5s
time=2026-06-13T14:30:05.124Z level=DEBUG msg="连接详情" host=10.0.1.1 port=22 user=deploy
time=2026-06-13T14:30:05.456Z level=ERROR msg="连接失败" host=10.0.1.1 error="connection refused" attempt=3
```

### 优雅的错误处理和退出码

不要用 `log.Fatal` 一把梭。遵循 Unix 惯例，用有意义的退出码：

```go
package main

const (
	ExitSuccess      = 0
	ExitGeneralError = 1
	ExitConfigError  = 2
	ExitNetworkError = 3
)

func main() {
	if err := run(); err != nil {
		switch {
		case isConfigError(err):
			fmt.Fprintf(os.Stderr, "配置错误: %v\n", err)
			os.Exit(ExitConfigError)
		case isNetworkError(err):
			fmt.Fprintf(os.Stderr, "网络错误: %v\n", err)
			os.Exit(ExitNetworkError)
		default:
			fmt.Fprintf(os.Stderr, "错误: %v\n", err)
			os.Exit(ExitGeneralError)
		}
	}
	os.Exit(ExitSuccess)
}

func isConfigError(err error) bool {
	// 判断是否为配置相关错误
	return strings.Contains(err.Error(), "配置") ||
		strings.Contains(err.Error(), "config")
}

func isNetworkError(err error) bool {
	// 判断是否为网络相关错误
	var netErr net.Error
	return errors.As(err, &netErr) ||
		strings.Contains(err.Error(), "connection refused")
}
```

shell 脚本中可以据此做条件判断：

```bash
./logtool health -f targets.txt
case $? in
  0) echo "全部正常" ;;
  1) echo "通用错误" ;;
  2) echo "配置文件有问题" ;;
  3) echo "网络不可达，检查 VPN" ;;
esac
```

### 进度条（纯标准库实现）

批量操作时给用户一个进度反馈，不需要第三方库：

```go
package progress

import (
	"fmt"
	"io"
	"os"
	"strings"
	"sync"
)

// Bar 简易进度条
type Bar struct {
	total     int
	current   int
	width     int
	desc      string
	mu        sync.Mutex
	output    io.Writer
}

// NewBar 创建进度条
func NewBar(desc string, total, width int) *Bar {
	return &Bar{
		total:  total,
		width:  width,
		desc:   desc,
		output: os.Stderr, // 输出到 stderr，不影响 stdout 的管道
	}
}

// Add 增加进度
func (b *Bar) Add(n int) {
	b.mu.Lock()
	defer b.mu.Unlock()

	b.current += n
	if b.current > b.total {
		b.current = b.total
	}
	b.render()
}

// Done 完成进度条
func (b *Bar) Done() {
	b.mu.Lock()
	defer b.mu.Unlock()
	b.current = b.total
	b.render()
	fmt.Fprintln(b.output)
}

func (b *Bar) render() {
	percent := float64(b.current) / float64(b.total)
	filled := int(percent * float64(b.width))

	bar := strings.Repeat("=", filled)
	if filled < b.width {
		bar += ">"
		bar += strings.Repeat(" ", b.width-filled-1)
	}

	fmt.Fprintf(b.output, "\r%s [%s] %d/%d (%.0f%%)",
		b.desc, bar, b.current, b.total, percent*100)
}

// 使用示例
func ExampleUsage() {
	total := 50
	bar := NewBar("检查主机", total, 40)

	for i := 0; i < total; i++ {
		// 模拟工作
		// time.Sleep(50 * time.Millisecond)
		bar.Add(1)
	}
	bar.Done()
}
```

效果：

```
检查主机 [==================>                   ] 23/50 (46%)
```

## 构建与分发

### 基础构建

```bash
# 开发版本
go build -o logtool .

# 带版本信息
go build -ldflags "-X main.version=1.0.0 -X main.buildTime=$(date -u +%Y-%m-%dT%H:%M:%SZ)" -o logtool .
```

在代码中接收版本信息：

```go
package main

var (
	version   = "dev"
	buildTime = "unknown"
)

func init() {
	rootCmd.Version = fmt.Sprintf("%s (built at %s)", version, buildTime)
}
```

### 交叉编译

一次性构建所有平台：

```bash
#!/bin/bash
# build.sh

APP_NAME="logtool"
VERSION=${1:-"dev"}
BUILD_TIME=$(date -u +%Y-%m-%dT%H:%M:%SZ)
LDFLAGS="-X main.version=${VERSION} -X main.buildTime=${BUILD_TIME}"

# 平台列表
PLATFORMS=(
	"linux/amd64"
	"linux/arm64"
	"darwin/amd64"
	"darwin/arm64"
	"windows/amd64"
)

mkdir -p dist

for PLATFORM in "${PLATFORMS[@]}"; do
	IFS='/' read -r GOOS GOARCH <<< "$PLATFORM"
	OUTPUT="dist/${APP_NAME}-${GOOS}-${GOARCH}"
	if [ "$GOOS" = "windows" ]; then
		OUTPUT="${OUTPUT}.exe"
	fi

	echo "构建 ${PLATFORM}..."
	GOOS=$GOOS GOARCH=$GOARCH go build \
		-ldflags "$LDFLAGS" \
		-o "$OUTPUT" .

	if [ $? -ne 0 ]; then
		echo "构建失败: ${PLATFORM}"
		exit 1
	fi
done

echo "构建完成，输出在 dist/ 目录："
ls -lh dist/
```

### goreleaser 自动化

[goreleaser](https://goreleaser.com/) 能自动构建、打包、生成 changelog 并发布到 GitHub Releases：

`.goreleaser.yml`：

```yaml
project_name: logtool

builds:
  - env:
      - CGO_ENABLED=0
    goos:
      - linux
      - darwin
      - windows
    goarch:
      - amd64
      - arm64
    ldflags:
      - -s -w
      - -X main.version={{.Version}}
      - -X main.buildTime={{.Date}}
    flags:
      - -trimpath

archives:
  - format: tar.gz
    name_template: >-
      {{ .ProjectName }}_
      {{- .Version }}_
      {{- .Os }}_
      {{- if eq .Arch "amd64" }}x86_64
      {{- else if eq .Arch "arm64" }}aarch64
      {{- else }}{{ .Arch }}{{ end }}
    format_overrides:
      - goos: windows
        format: zip

checksum:
  name_template: "checksums.txt"

changelog:
  sort: asc
  filters:
    exclude:
      - "^docs:"
      - "^test:"
      - "^ci:"

release:
  github:
    owner: yourname
    name: logtool
```

使用：

```bash
# 本地测试构建
goreleaser build --snapshot --clean

# 正式发布（打 tag 后执行）
git tag v1.0.0
git push origin v1.0.0
goreleaser release --clean
```

## 小结

| 工具 | 核心能力 | 关键技术点 |
|------|----------|------------|
| 日志分析 | 过滤/搜索/聚合 | 正则匹配、管道输入、JSON 输出 |
| 健康检查 | 并发 HTTP 探测 | goroutine 池、ANSI 彩色输出 |
| 批量操作 | SSH 并发执行 | ssh 包、信号量并发控制、结果汇总 |

Go 开发运维工具的核心优势是：**写一次，到处运行**。不需要在目标机器上安装运行时，编译出来一个二进制文件就能用。配合 cobra 的命令行框架、标准库的网络和并发能力，大部分运维场景都能用几百行代码搞定。

下一步可以探索的方向：
- 集成 Prometheus metrics 输出，把工具接入监控体系
- 用 `context.Context` 实现全局超时和取消
- 编写 Table-driven 测试确保工具可靠性
- 用 `afero` 抽象文件系统，方便单元测试
