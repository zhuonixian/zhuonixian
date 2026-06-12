---
title: Go 语言入门：环境搭建与基础语法
icon: code
date: 2026-06-13
category:
  - 技术
tag:
  - Go
  - Golang
  - 编程语言
---

# Go 语言入门：环境搭建与基础语法

Go（又称 Golang）是 Google 于 2007 年开始设计、2009 年以 BSD 许可证开源的编程语言。它是一门**静态类型、编译型**语言，自带垃圾回收（GC），编译速度极快，生成的二进制文件无需额外运行时依赖即可部署。Go 尤其擅长构建高并发网络服务、命令行工具和云原生基础设施——Docker、Kubernetes、etcd 等知名项目均使用 Go 编写。

截至本文撰写时，Go 的最新稳定版本为 **Go 1.24**（2025 年发布）。该版本延续了 Go 团队对工具链性能和语言兼容性的承诺，同时在泛型、工具链等方面持续改进。

<!-- more -->

## 环境搭建

### 安装 Go

**Linux / macOS**

推荐使用官方提供的二进制发行包。以 Linux（amd64）为例：

```bash
# Download and extract (adjust version as needed)
wget https://go.dev/dl/go1.24.0.linux-amd64.tar.gz
sudo tar -C /usr/local -xzf go1.24.0.linux-amd64.tar.gz
```

然后将 Go 的 `bin` 目录加入 `PATH`。在 `~/.bashrc` 或 `~/.zshrc` 中添加：

```bash
export PATH=$PATH:/usr/local/go/bin
```

保存后执行 `source ~/.bashrc`，然后验证安装：

```bash
go version
# go version go1.24.0 linux/amd64
```

**macOS** 用户也可以通过 Homebrew 安装：

```bash
brew install go
```

**Windows** 用户可从 <https://go.dev/dl/> 下载 MSI 安装包，运行后按向导操作即可。

### GOPATH 与 GO111MODULE

Go 的项目组织方式经历过一次重要演进：

- **GOPATH 模式**（旧）：所有项目代码必须放在 `$GOPATH/src` 下，依赖通过 `go get` 直接拉取到 `$GOPATH/src`，没有版本锁定机制。`GOPATH` 默认是 `$HOME/go`。
- **Go Modules 模式**（当前标准）：从 Go 1.11 引入、Go 1.16 起成为默认。项目可以放在任意目录，通过 `go.mod` 文件声明模块路径和依赖，`go.sum` 记录依赖的校验哈希。

`GO111MODULE` 环境变量控制这一行为：

| 值 | 行为 |
|---|---|
| `off` | 强制使用 GOPATH 模式 |
| `on` | 强制使用 Go Modules 模式 |
| `auto`（Go 1.16 之前的默认值） | 在 `$GOPATH/src` 外且存在 `go.mod` 时使用 Modules |

从 Go 1.16 开始，默认值等同于 `on`，**新项目无需手动设置此变量**。如果你仍在维护旧项目，可以通过以下命令确认当前状态：

```bash
go env GO111MODULE
```

### IDE 推荐

| IDE / 编辑器 | 说明 |
|---|---|
| **VS Code + Go 扩展** | 免费且轻量，安装 Go 团队官方维护的 `gopls` 语言服务器后可获得代码补全、跳转定义、重构等完整功能。适合大多数开发者。 |
| **GoLand** | JetBrains 出品的商业 IDE，开箱即用，调试、测试、性能分析工具齐全。适合对 IDE 功能要求较高的团队。 |

> **建议**：个人开发者或轻量项目优先选择 VS Code，其 Go 扩展已经非常成熟；企业级项目或需要深度调试的场景可以考虑 GoLand。

## 第一个程序：Hello World

创建项目目录并初始化模块：

```bash
mkdir hello && cd hello
go mod init example.com/hello
```

这会生成一个 `go.mod` 文件，内容类似：

```
module example.com/hello

go 1.24
```

创建 `main.go`：

```go
package main

import "fmt"

func main() {
    fmt.Println("Hello, World!")
}
```

运行：

```bash
go run main.go
# Output: Hello, World!
```

编译生成二进制：

```bash
go build -o hello
./hello
# Output: Hello, World!
```

::: tip 关于 package main
Go 程序的入口是 `package main` 中的 `func main()`。`package main` 是一个特殊约定——编译器会将它构建为可执行文件，而非可复用的库包。
:::

## Go 项目结构

一个典型的 Go 项目目录如下：

```
myproject/
├── go.mod        # Module declaration and dependency list
├── go.sum        # Dependency checksums (auto-generated, do not edit manually)
├── main.go       # Entry point
├── internal/     # Private packages (not importable by external modules)
│   └── config/
│       └── config.go
├── pkg/          # Public packages (convention, not enforced)
│   └── utils/
│       └── utils.go
└── cmd/          # Multiple executables (optional)
    └── server/
        └── main.go
```

### go.mod 详解

`go.mod` 是 Go Modules 的核心文件，示例：

```
module github.com/yourname/myproject

go 1.24

require (
    github.com/gin-gonic/gin v1.10.0
    github.com/go-sql-driver/mysql v1.8.1
)
```

- `module`：声明当前模块的导入路径。通常使用代码仓库地址（如 `github.com/yourname/project`），这样其他人可以直接 `go get` 你的项目。
- `go 1.24`：指定使用的 Go 版本，工具链会据此选择合适的语言特性和依赖解析策略。
- `require`：列出直接依赖及其版本。

### go.sum

`go.sum` 记录每个依赖包的加密哈希值，格式为：

```
github.com/gin-gonic/gin v1.10.0 h1:abcd1234...
github.com/gin-gonic/gin v1.10.0/go.mod h1:efgh5678...
```

::: warning 注意
`go.sum` 由工具链自动管理，**不要手动编辑**。它的作用是确保团队中每个人以及 CI/CD 环境拉取到的依赖是完全一致的，防止供应链攻击。该文件**必须纳入版本控制**（提交到 Git）。
:::

## 基础语法

### 变量声明

Go 提供两种变量声明方式：

**完整声明（var）**

```go
package main

import "fmt"

func main() {
    // Explicit type declaration
    var name string = "Go"

    // Type inferred from the right-hand side
    var version = 1.24

    // Zero-value initialization (string defaults to "")
    var message string

    // Multiple variables at once
    var x, y int = 10, 20

    fmt.Println(name, version, message, x, y)
}
```

**短变量声明（:=）**

这是函数内最常用的写法，省略 `var` 和类型：

```go
package main

import "fmt"

func main() {
    language := "Go"
    year := 2009
    isAwesome := true

    fmt.Println(language, year, isAwesome)
}
```

::: warning 短变量声明的限制
`:=` **只能在函数内部使用**，不能用于包级别的变量声明。另外，左侧必须至少有一个新变量，否则编译报错。如果要对已声明变量赋值，使用 `=` 即可。
:::

**零值（Zero Value）机制**

Go 中声明但未赋值的变量会被自动初始化为对应类型的零值，不会出现未定义行为：

| 类型 | 零值 |
|---|---|
| `int`, `float64` 等 | `0` |
| `string` | `""`（空字符串） |
| `bool` | `false` |
| `pointer`, `slice`, `map`, `chan`, `interface`, `function` | `nil` |

### 常量

使用 `const` 声明，支持类型推断。配合 `iota` 可实现优雅的枚举：

```go
package main

import "fmt"

const Pi = 3.14159
const Language = "Go"

// Grouped constants with iota
type Weekday int

const (
    Sunday    Weekday = iota // 0
    Monday                   // 1
    Tuesday                  // 2
    Wednesday                // 3
    Thursday                 // 4
    Friday                   // 5
    Saturday                 // 6
)

func main() {
    fmt.Println(Pi)
    fmt.Println(Language)
    fmt.Println("Today is day number:", Wednesday)
}
```

`iota` 在每个 `const` 块中从 0 开始递增，每行加 1。这一特性在实现位标志、权限枚举等场景中非常实用。

### 基本数据类型

Go 是强类型语言，类型之间不能隐式转换。

```go
package main

import "fmt"

func main() {
    // Integer types
    var a int     = 42       // Platform-dependent size (64-bit on modern systems)
    var b int64   = 1<<62    // Explicitly 64-bit
    var c uint8   = 255      // 0 to 255

    // Floating-point types
    var pi float64 = 3.14159
    var e  float32 = 2.718

    // Boolean
    var isActive bool = true

    // String (UTF-8 encoded, immutable)
    var greeting string = "你好，世界"

    // Type conversion must be explicit
    var f float64 = float64(a)
    var g int     = int(pi)

    fmt.Printf("a=%d, b=%d, c=%d\n", a, b, c)
    fmt.Printf("pi=%.5f, e=%.3f\n", pi, e)
    fmt.Printf("isActive=%t, greeting=%s\n", isActive, greeting)
    fmt.Printf("f=%.0f, g=%d\n", f, g)
}
```

::: tip 类型选择建议
- 默认使用 `int` 和 `float64`，除非有明确的性能或精度需求。
- 需要与 C 交互或处理二进制协议时，使用固定大小的类型（`int32`、`uint16` 等）。
- 字符串默认就是 UTF-8 编码，处理中文无需额外配置。
:::

## fmt 包格式化输出

`fmt` 是 Go 标准库中最常用的包之一，提供格式化输入输出功能。

### 常用格式化动词（Format Verbs）

| 动词 | 用途 | 示例 |
|---|---|---|
| `%d` | 十进制整数 | `fmt.Printf("%d", 42)` → `42` |
| `%f` | 浮点数 | `fmt.Printf("%.2f", 3.14)` → `3.14` |
| `%s` | 字符串 | `fmt.Printf("%s", "Go")` → `Go` |
| `%t` | 布尔值 | `fmt.Printf("%t", true)` → `true` |
| `%v` | 默认格式（通用） | `fmt.Printf("%v", obj)` |
| `%+v` | 带字段名的结构体 | `fmt.Printf("%+v", struct)` |
| `%#v` | Go 语法表示 | `fmt.Printf("%#v", "Go")` → `"Go"` |
| `%T` | 打印类型 | `fmt.Printf("%T", 42)` → `int` |
| `%p` | 指针地址 | `fmt.Printf("%p", &x)` |
| `%%` | 输出百分号本身 | `fmt.Printf("100%%")` → `100%` |

### Print、Printf 与 Println

```go
package main

import "fmt"

func main() {
    name := "Go"
    version := 1.24

    // Println: adds spaces between arguments, appends newline
    fmt.Println("Language:", name, "Version:", version)
    // Output: Language: Go Version: 1.24

    // Printf: formatted output, no automatic newline
    fmt.Printf("Language: %s, Version: %.2f\n", name, version)
    // Output: Language: Go, Version: 1.24

    // Sprintf: returns formatted string instead of printing
    msg := fmt.Sprintf("Welcome to %s %.2f!", name, version)
    fmt.Println(msg)
    // Output: Welcome to Go 1.24!
}
```

> **注意**：`Printf` 不会自动追加换行符，需要手动写 `\n`。`Println` 会自动加换行并在参数间插入空格。实际开发中建议根据场景选择，格式化输出用 `Printf`，简单日志用 `Println`。

## 包管理

### 添加依赖

```bash
# Add a dependency (downloads and updates go.mod)
go get github.com/gin-gonic/gin@v1.10.0

# Or let Go resolve the latest compatible version
go get github.com/gin-gonic/gin
```

### 整理依赖

```bash
# Add missing dependencies and remove unused ones
go mod tidy
```

`go mod tidy` 是日常开发中**使用频率最高**的依赖管理命令。它做了两件事：

1. 扫描源码中的 `import`，将用到的依赖添加到 `go.mod`。
2. 移除 `go.mod` 中已不再使用的依赖。

建议在以下时机执行 `go mod tidy`：

- 添加或删除 `import` 后
- 合并代码分支后
- 提交代码前（可加入 Git pre-commit hook）

### 常用模块命令一览

```bash
# Initialize a new module
go mod init github.com/yourname/project

# Download dependencies to local cache
go mod download

# View dependency graph
go mod graph

# Verify downloaded modules match go.sum checksums
go mod verify

# List all dependencies and their versions
go list -m all
```

### 依赖版本机制

Go Modules 采用**语义版本（Semantic Versioning）**进行依赖解析：

- `v1.10.0`：主版本 1 以下的更新被认为是兼容的。
- `v2.0.0`及以上：Go 要求在模块路径中显式标注，如 `github.com/gin-gonic/gin/v2`。这一设计确保了不同主版本可以共存。

> **实践建议**：在 `go get` 时始终指定具体版本或使用 `@latest`，避免意外拉入不兼容的变更。`go.sum` 文件务必提交到版本控制中，它是依赖完整性和可重复构建的保障。

## 小结

本文涵盖了 Go 语言开发的核心起步知识：从安装配置到模块管理，从变量声明到格式化输出。关键要点回顾：

- Go Modules 是当前标准的包管理方式，`go mod init` / `go mod tidy` / `go.sum` 构成了项目依赖管理的核心链路。
- Go 的变量声明设计兼顾了明确性（`var`）和简洁性（`:=`），类型系统严格，不允许隐式转换。
- `fmt` 包是日常开发的基础工具，掌握格式化动词对调试和日志输出至关重要。

Go 的设计哲学是"少即是多"——通过少量的语法规则和强大的内置工具链，让开发者将精力集中在解决实际问题上。搭建好环境、理解基础语法之后，下一步可以学习控制流（if/for/switch）、函数、结构体和接口，以及 Go 最具特色的 goroutine 与 channel 并发模型。
