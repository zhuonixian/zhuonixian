---
title: Go 标准库精讲与项目实战
icon: folder-open
date: 2026-06-13
category:
  - 技术
tag:
  - Go
  - Golang
  - 标准库
  - 项目实战
---

# Go 标准库精讲与项目实战

Go 语言的标准库是其最大的优势之一——涵盖了 I/O、文件操作、网络编程、JSON 处理、日志、测试等方方面面，且质量极高。很多开发者习惯第一时间引入第三方库，但实际上标准库已经能解决绝大多数问题。本文将系统梳理 Go 标准库的核心包，并通过一个完整的 REST API 项目将它们串联起来。

<!-- more -->

## io 包：一切 I/O 的基石

`io` 包定义了两个最核心的接口 `Reader` 和 `Writer`，几乎所有涉及数据流动的标准库组件都依赖它们。

### Reader 和 Writer 接口

```go
type Reader interface {
    Read(p []byte) (n int, err error)
}

type Writer interface {
    Write(p []byte) (n int, err error)
}
```

只要一个类型实现了 `Read` 方法，它就是一个 `Reader`；实现了 `Write` 方法，它就是一个 `Writer`。这种极简的接口设计让组合变得非常灵活。

下面我们实现一个自定义 Reader，统计读取过的字节数：

```go
package main

import (
    "fmt"
    "io"
    "strings"
)

// CountingReader 包装一个 Reader，统计总共读取的字节数
type CountingReader struct {
    reader io.Reader
    Count  int
}

func (cr *CountingReader) Read(p []byte) (int, error) {
    n, err := cr.reader.Read(p)
    cr.Count += n
    return n, err
}

func main() {
    src := strings.NewReader("Hello, Go 标准库！让我们一起深入探索。")
    cr := &CountingReader{reader: src}

    buf := make([]byte, 8)
    for {
        _, err := cr.Read(buf)
        if err == io.EOF {
            break
        }
        if err != nil {
            fmt.Println("读取错误:", err)
            return
        }
    }

    fmt.Printf("总共读取了 %d 字节\n", cr.Count)
    // 总共读取了 51 字节
}
```

### io.Copy：高效的数据搬运

`io.Copy` 从 Reader 持续读取数据并写入 Writer，直到遇到 `EOF`，内部使用 32KB 缓冲区，非常高效。

```go
package main

import (
    "fmt"
    "io"
    "strings"
)

// HashWriter 是一个简单的 Writer，统计写入的字节数
type HashWriter struct {
    total int
}

func (hw *HashWriter) Write(p []byte) (int, error) {
    hw.total += len(p)
    return len(p), nil
}

func main() {
    src := strings.NewReader("Go 语言的标准库设计优雅且功能强大。")
    dst := &HashWriter{}

    written, err := io.Copy(dst, src)
    if err != nil {
        fmt.Println("复制出错:", err)
        return
    }

    fmt.Printf("io.Copy 写入了 %d 字节，HashWriter 统计 %d 字节\n", written, dst.total)
    // io.Copy 写入了 45 字节，HashWriter 统计 45 字节
}
```

### io.ReadAll：一次性读取全部内容

当需要将 Reader 中的数据一次性全部读入内存时，使用 `io.ReadAll`（Go 1.16+ 替代了旧的 `ioutil.ReadAll`）。

```go
package main

import (
    "fmt"
    "io"
    "strings"
)

func main() {
    r := strings.NewReader("读取全部内容示例")
    data, err := io.ReadAll(r)
    if err != nil {
        fmt.Println("读取失败:", err)
        return
    }
    fmt.Println(string(data))
    // 读取全部内容示例
}
```

> **最佳实践**：如果知道数据大小，优先用 `io.ReadFull`；如果数据量不确定且可能很大，使用 `io.Copy` 流式处理，避免 `io.ReadAll` 占用过多内存。

## os 包：与操作系统交互

`os` 包提供了文件操作、环境变量、命令行参数等功能。

### 文件操作

Go 1.16+ 推荐使用 `os.ReadFile` 和 `os.WriteFile` 来替代旧的 `ioutil` 函数。

```go
package main

import (
    "fmt"
    "os"
)

func main() {
    // 写入文件
    content := []byte("Hello, Go 文件操作！\n第二行内容\n")
    err := os.WriteFile("example.txt", content, 0644)
    if err != nil {
        fmt.Println("写入失败:", err)
        return
    }
    fmt.Println("文件写入成功")

    // 读取文件
    data, err := os.ReadFile("example.txt")
    if err != nil {
        fmt.Println("读取失败:", err)
        return
    }
    fmt.Printf("文件内容:\n%s", data)

    // 使用 Open 和 Read 进行更精细的控制
    f, err := os.Open("example.txt")
    if err != nil {
        fmt.Println("打开失败:", err)
        return
    }
    defer f.Close()

    buf := make([]byte, 100)
    n, err := f.Read(buf)
    if err != nil {
        fmt.Println("读取出错:", err)
        return
    }
    fmt.Printf("读取了 %d 字节: %s", n, buf[:n])

    // 使用 Create 创建新文件（如果存在则截断）
    f2, err := os.Create("output.txt")
    if err != nil {
        fmt.Println("创建失败:", err)
        return
    }
    defer f2.Close()

    f2.WriteString("通过 Create 创建并写入\n")

    // 清理示例文件
    os.Remove("example.txt")
    os.Remove("output.txt")
}
```

### 环境变量

```go
package main

import (
    "fmt"
    "os"
)

func main() {
    // 设置环境变量
    os.Setenv("APP_NAME", "stdlib-demo")
    os.Setenv("APP_PORT", "8080")

    // 获取单个环境变量
    appName := os.Getenv("APP_NAME")
    fmt.Println("应用名称:", appName)

    // 环境变量不存在时返回空字符串
    dbURL := os.Getenv("DATABASE_URL")
    if dbURL == "" {
        fmt.Println("DATABASE_URL 未设置，使用默认值")
    }

    // 查看所有环境变量
    for _, env := range os.Environ() {
        fmt.Println(env)
    }
}
```

### 命令行参数

```go
package main

import (
    "fmt"
    "os"
)

func main() {
    // os.Args[0] 是程序本身，os.Args[1:] 是参数
    args := os.Args

    if len(args) < 2 {
        fmt.Printf("用法: %s <name> [age]\n", args[0])
        os.Exit(1)
    }

    name := args[1]
    fmt.Printf("你好, %s!\n", name)

    if len(args) >= 3 {
        fmt.Printf("年龄参数: %s\n", args[2])
    }
}
```

## bufio 包：缓冲读写

`bufio` 包在 `io.Reader`/`io.Writer` 外包了一层缓冲，减少系统调用次数，大幅提升读写性能。

### 缓冲读写

```go
package main

import (
    "bufio"
    "fmt"
    "os"
    "strings"
)

func main() {
    // 创建临时文件用于演示
    f, err := os.CreateTemp("", "bufio-demo-*.txt")
    if err != nil {
        fmt.Println("创建临时文件失败:", err)
        return
    }
    defer os.Remove(f.Name())
    defer f.Close()

    // 缓冲写入
    writer := bufio.NewWriter(f)
    lines := []string{
        "第一行： bufio 包入门",
        "第二行： 缓冲写入提升性能",
        "第三行： 注意 Flush 的时机",
    }
    for _, line := range lines {
        _, err := writer.WriteString(line + "\n")
        if err != nil {
            fmt.Println("写入失败:", err)
            return
        }
    }
    // 必须调用 Flush 将缓冲区数据刷到磁盘
    if err := writer.Flush(); err != nil {
        fmt.Println("Flush 失败:", err)
        return
    }
    fmt.Println("缓冲写入完成")

    // 重新打开文件进行读取
    f2, err := os.Open(f.Name())
    if err != nil {
        fmt.Println("打开文件失败:", err)
        return
    }
    defer f2.Close()

    // 缓冲逐行读取
    scanner := bufio.NewScanner(f2)
    lineNum := 0
    for scanner.Scan() {
        lineNum++
        fmt.Printf("第 %d 行: %s\n", lineNum, scanner.Text())
    }
    if err := scanner.Err(); err != nil {
        fmt.Println("扫描出错:", err)
    }
}
```

### Scanner 高级用法

```go
package main

import (
    "bufio"
    "fmt"
    "strings"
)

func main() {
    input := "apple,banana,cherry,dragon fruit,elderberry"

    // 默认按行分割
    scanner := bufio.NewScanner(strings.NewReader(input))

    // 自定义分割函数：按逗号分割
    scanner.Split(func(data []byte, atEOF bool) (advance int, token []byte, err error) {
        for i := 0; i < len(data); i++ {
            if data[i] == ',' {
                return i + 1, data[:i], nil
            }
        }
        if atEOF && len(data) > 0 {
            return len(data), data, nil
        }
        return 0, nil, nil
    })

    for scanner.Scan() {
        fmt.Printf("词元: [%s]\n", scanner.Text())
    }
}
```

## encoding/json：JSON 处理

JSON 是现代 API 最常用的数据格式，`encoding/json` 是 Go 处理 JSON 的核心包。

### 基本序列化和反序列化

```go
package main

import (
    "encoding/json"
    "fmt"
)

type User struct {
    ID       int    `json:"id"`
    Name     string `json:"name"`
    Email    string `json:"email"`
    Password string `json:"-"`           // json:"-" 表示完全忽略该字段
    Age      int    `json:"age,omitempty"` // omitempty：零值时省略
    Role     string `json:"role"`
}

func main() {
    // 序列化（结构体 -> JSON）
    user := User{
        ID:       1,
        Name:     "张三",
        Email:    "zhangsan@example.com",
        Password: "secret123",
        Role:     "admin",
        // Age 未设置，为零值 0，因为 omitempty 会被省略
    }

    jsonData, err := json.MarshalIndent(user, "", "  ")
    if err != nil {
        fmt.Println("序列化失败:", err)
        return
    }
    fmt.Println("序列化结果:")
    fmt.Println(string(jsonData))

    // 反序列化（JSON -> 结构体）
    jsonInput := `{
        "id": 2,
        "name": "李四",
        "email": "lisi@example.com",
        "age": 28,
        "role": "user"
    }`

    var user2 User
    if err := json.Unmarshal([]byte(jsonInput), &user2); err != nil {
        fmt.Println("反序列化失败:", err)
        return
    }
    fmt.Printf("\n反序列化结果: %+v\n", user2)
    // 注意 Password 字段始终为空，因为 json tag 是 "-"

    // 处理动态 JSON（map 或 interface）
    var data map[string]any
    json.Unmarshal([]byte(jsonInput), &data)
    fmt.Printf("\n动态解析: name=%v, age=%v\n", data["name"], data["age"])
}
```

### 自定义 MarshalJSON

当默认的序列化行为不满足需求时，可以通过实现 `json.Marshaler` 接口来自定义输出。

```go
package main

import (
    "encoding/json"
    "fmt"
    "strings"
    "time"
)

type Event struct {
    Name      string    `json:"name"`
    Location  string    `json:"location"`
    StartTime time.Time `json:"-"`
    EndTime   time.Time `json:"-"`
}

// 自定义 MarshalJSON 控制时间格式输出
func (e Event) MarshalJSON() ([]byte, error) {
    type Alias Event // 创建别名避免递归调用
    return json.Marshal(&struct {
        StartTime string `json:"start_time"`
        EndTime   string `json:"end_time"`
        *Alias
    }{
        StartTime: e.StartTime.Format("2006-01-02 15:04:05"),
        EndTime:   e.EndTime.Format("2006-01-02 15:04:05"),
        Alias:     (*Alias)(&e),
    })
}

// 自定义 UnmarshalJSON 控制时间格式解析
func (e *Event) UnmarshalJSON(data []byte) error {
    type Alias Event
    aux := &struct {
        StartTime string `json:"start_time"`
        EndTime   string `json:"end_time"`
        *Alias
    }{
        Alias: (*Alias)(e),
    }
    if err := json.Unmarshal(data, aux); err != nil {
        return err
    }

    var err error
    layout := "2006-01-02 15:04:05"
    e.StartTime, err = time.Parse(layout, aux.StartTime)
    if err != nil {
        return fmt.Errorf("解析 start_time 失败: %w", err)
    }
    e.EndTime, err = time.Parse(layout, aux.EndTime)
    if err != nil {
        return fmt.Errorf("解析 end_time 失败: %w", err)
    }
    return nil
}

func main() {
    event := Event{
        Name:      "Go 标准库研讨会",
        Location:  "线上",
        StartTime: time.Date(2026, 6, 13, 14, 0, 0, 0, time.Local),
        EndTime:   time.Date(2026, 6, 13, 17, 0, 0, 0, time.Local),
    }

    data, _ := json.MarshalIndent(event, "", "  ")
    fmt.Println(string(data))

    // 反序列化验证
    jsonStr := `{
        "name": "Go Meetup",
        "location": "北京",
        "start_time": "2026-07-01 09:00:00",
        "end_time": "2026-07-01 18:00:00"
    }`
    var evt Event
    json.Unmarshal([]byte(jsonStr), &evt)
    fmt.Printf("\n反序列化: %+v\n", evt)
    fmt.Printf("StartTime: %s\n", evt.StartTime)

    _ = strings.TrimSpace("")
}
```

## net/http：构建 HTTP 服务与客户端

`net/http` 是 Go 标准库中最令人印象深刻的包之一——仅用几行代码就能启动一个高性能 HTTP 服务器。

### HTTP 服务端

```go
package main

import (
    "fmt"
    "net/http"
    "time"
)

func main() {
    // 方式一：使用 http.HandleFunc 注册路由
    http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
        fmt.Fprintf(w, "欢迎访问 Go HTTP 服务器！")
    })

    http.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
        w.Header().Set("Content-Type", "application/json")
        fmt.Fprintf(w, `{"status":"ok","time":"%s"}`, time.Now().Format(time.RFC3339))
    })

    http.HandleFunc("/greet", func(w http.ResponseWriter, r *http.Request) {
        // 从查询参数获取 name
        name := r.URL.Query().Get("name")
        if name == "" {
            name = "世界"
        }
        fmt.Fprintf(w, "你好, %s!", name)
    })

    // 方式二：使用 Go 1.22+ 增强的路由模式匹配
    // Go 1.22 支持方法和路径参数
    mux := http.NewServeMux()
    mux.HandleFunc("GET /api/v1/hello/{name}", func(w http.ResponseWriter, r *http.Request) {
        name := r.PathValue("name") // 获取路径参数
        fmt.Fprintf(w, "Hello, %s!", name)
    })

    mux.HandleFunc("POST /api/v1/echo", func(w http.ResponseWriter, r *http.Request) {
        // 读取请求体
        body := make([]byte, r.ContentLength)
        r.Body.Read(body)
        w.Header().Set("Content-Type", "text/plain")
        w.Write(body)
    })

    // 启动服务器
    fmt.Println("服务器启动在 :8080")
    // http.ListenAndServe(":8080", nil) // 使用 DefaultServeMux
    http.ListenAndServe(":8080", mux) // 使用自定义 mux
}
```

### HTTP 客户端

```go
package main

import (
    "bytes"
    "encoding/json"
    "fmt"
    "io"
    "net/http"
    "time"
)

func main() {
    client := &http.Client{
        Timeout: 10 * time.Second,
    }

    // GET 请求
    resp, err := client.Get("https://httpbin.org/get")
    if err != nil {
        fmt.Println("GET 请求失败:", err)
        return
    }
    defer resp.Body.Close()

    body, _ := io.ReadAll(resp.Body)
    fmt.Printf("GET 响应 (状态码 %d):\n%s\n\n", resp.StatusCode, body)

    // POST JSON 请求
    payload := map[string]string{
        "name":  "张三",
        "email": "zhangsan@example.com",
    }
    jsonData, _ := json.Marshal(payload)

    resp2, err := client.Post(
        "https://httpbin.org/post",
        "application/json",
        bytes.NewReader(jsonData),
    )
    if err != nil {
        fmt.Println("POST 请求失败:", err)
        return
    }
    defer resp2.Body.Close()

    body2, _ := io.ReadAll(resp2.Body)
    fmt.Printf("POST 响应 (状态码 %d):\n%s\n", resp2.StatusCode, body2)

    // 自定义请求（设置 Header 等）
    req, _ := http.NewRequest("GET", "https://httpbin.org/headers", nil)
    req.Header.Set("X-Custom-Header", "my-value")
    req.Header.Set("Authorization", "Bearer token123")

    resp3, err := client.Do(req)
    if err != nil {
        fmt.Println("自定义请求失败:", err)
        return
    }
    defer resp3.Body.Close()

    body3, _ := io.ReadAll(resp3.Body)
    fmt.Printf("\n自定义 Header 响应:\n%s\n", body3)
}
```

## testing 包：保证代码质量

`testing` 包是 Go 内置的测试框架，无需任何第三方依赖。

### 单元测试和表格驱动测试

假设有如下待测代码文件 `math_utils.go`：

```go
package mathutils

import "errors"

// Add 返回两个数的和
func Add(a, b int) int {
    return a + b
}

// Divide 安全的除法运算
func Divide(a, b float64) (float64, error) {
    if b == 0 {
        return 0, errors.New("除数不能为零")
    }
    return a / b, nil
}

// IsPalindrome 判断字符串是否为回文
func IsPalindrome(s string) bool {
    runes := []rune(s)
    n := len(runes)
    for i := 0; i < n/2; i++ {
        if runes[i] != runes[n-1-i] {
            return false
        }
    }
    return true
}
```

对应的测试文件 `math_utils_test.go`：

```go
package mathutils

import "testing"

// 基本单元测试
func TestAdd(t *testing.T) {
    result := Add(2, 3)
    if result != 5 {
        t.Errorf("Add(2, 3) = %d; want 5", result)
    }
}

// 表格驱动测试（推荐方式）
func TestDivide(t *testing.T) {
    tests := []struct {
        name      string
        a         float64
        b         float64
        want      float64
        wantErr   bool
    }{
        {"正常除法", 10, 2, 5, false},
        {"小数除法", 7, 2, 3.5, false},
        {"负数除法", -6, 3, -2, false},
        {"除以零", 10, 0, 0, true},
        {"零除以数", 0, 5, 0, false},
    }

    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            got, err := Divide(tt.a, tt.b)
            if (err != nil) != tt.wantErr {
                t.Errorf("Divide(%v, %v) error = %v, wantErr %v", tt.a, tt.b, err, tt.wantErr)
                return
            }
            if !tt.wantErr && got != tt.want {
                t.Errorf("Divide(%v, %v) = %v, want %v", tt.a, tt.b, got, tt.want)
            }
        })
    }
}

func TestIsPalindrome(t *testing.T) {
    tests := []struct {
        input string
        want  bool
    }{
        {"上海自来水来自海上", true},
        {"aba", true},
        {"abc", false},
        {"a", true},
        {"", true},
        {"Aba", false},
    }

    for _, tt := range tests {
        t.Run(tt.input, func(t *testing.T) {
            if got := IsPalindrome(tt.input); got != tt.want {
                t.Errorf("IsPalindrome(%q) = %v, want %v", tt.input, got, tt.want)
            }
        })
    }
}
```

运行测试：

```bash
# 运行当前包的所有测试
go test ./...

# 显示详细输出
go test -v ./...

# 运行特定测试
go test -run TestDivide -v ./...

# 查看测试覆盖率
go test -cover ./...
```

### 基准测试

```go
package mathutils

import (
    "strconv"
    "testing"
)

// 基准测试：测量性能
func BenchmarkAdd(b *testing.B) {
    for i := 0; i < b.N; i++ {
        Add(i, i+1)
    }
}

func BenchmarkDivide(b *testing.B) {
    for i := 0; i < b.N; i++ {
        Divide(float64(i), 2.0)
    }
}

func BenchmarkIsPalindrome(b *testing.B) {
    s := "上海自来水来自海上"
    for i := 0; i < b.N; i++ {
        IsPalindrome(s)
    }
}

// 基准测试也可以是表格驱动的（Go 1.22+ 的 B.Loop）
func BenchmarkFormatInt(b *testing.B) {
    for i := range b.N {
        strconv.Itoa(i)
    }
}
```

运行基准测试：

```bash
# 运行基准测试
go test -bench=. -benchmem ./...

# 输出示例：
# BenchmarkAdd-8              1000000000    0.256 ns/op    0 B/op    0 allocs/op
# BenchmarkDivide-8           1000000000    0.312 ns/op    0 B/op    0 allocs/op
# BenchmarkIsPalindrome-8      50000000     28.3 ns/op     0 B/op    0 allocs/op
```

## log/slog 包：结构化日志（Go 1.21+）

`log/slog` 是 Go 1.21 引入的结构化日志包，支持键值对日志和多种输出格式。

```go
package main

import (
    "log/slog"
    "os"
    "time"
)

type RequestInfo struct {
    Method string
    Path   string
    IP     string
}

func main() {
    // 1. 使用默认的 TextHandler
    slog.Info("服务启动", "port", 8080, "env", "production")

    // 2. 创建 JSON 格式的 Logger
    jsonHandler := slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{
        Level: slog.LevelDebug, // 设置最低日志级别
    })
    logger := slog.New(jsonHandler)
    slog.SetDefault(logger) // 设为默认 logger

    // 使用默认 logger（现在是 JSON 格式）
    slog.Info("请求处理完成",
        "method", "GET",
        "path", "/api/users",
        "duration", 42*time.Millisecond,
    )

    // Debug 级别
    slog.Debug("调试信息", "detail", "仅在开发环境可见")

    // Warn 级别
    slog.Warn("磁盘使用率较高", "usage", "85%", "threshold", "80%")

    // Error 级别
    slog.Error("数据库连接失败",
        "error", "connection refused",
        "retry", 3,
    )

    // 3. 使用 slog 的类型安全属性
    slog.Info("带类型的属性",
        slog.String("user", "张三"),
        slog.Int("age", 30),
        slog.Bool("active", true),
        slog.Duration("elapsed", 150*time.Millisecond),
    )

    // 4. 使用 LogValue 接口自定义类型的日志输出
    req := RequestInfo{Method: "POST", Path: "/api/users", IP: "192.168.1.1"}
    slog.Info("收到请求", "request", req)

    // 5. 使用 With 创建带预设属性的子 Logger
    requestLogger := slog.With(
        "request_id", "req-abc-123",
        "user_id", 42,
    )
    requestLogger.Info("处理开始")
    requestLogger.Info("处理完成", "status", 200)
}
```

为自定义类型实现 `slog.LogValuer` 接口：

```go
package main

import (
    "fmt"
    "log/slog"
)

type ServerStatus struct {
    Host    string
    Port    int
    Healthy bool
}

// 实现 slog.LogValuer 接口，控制日志输出格式
func (s ServerStatus) LogValue() slog.Value {
    return slog.GroupValue(
        slog.String("host", s.Host),
        slog.Int("port", s.Port),
        slog.Bool("healthy", s.Healthy),
    )
}

func main() {
    status := ServerStatus{
        Host:    "api.example.com",
        Port:    8080,
        Healthy: true,
    }

    slog.Info("服务器状态检查", "server", status)
    // 输出: {"time":"...","level":"INFO","msg":"服务器状态检查","server":{"host":"api.example.com","port":8080,"healthy":true}}

    _ = fmt.Sprintf("")
}
```

## 项目实战：构建完整的 REST API 服务

现在我们将前面学到的所有知识整合起来，构建一个完整的项目——一个**任务管理系统（Task Manager） REST API**。纯标准库实现，不依赖任何第三方框架。

### 项目结构

```
taskmanager/
├── cmd/
│   └── server/
│       └── main.go          # 程序入口
├── internal/
│   ├── handler/
│   │   └── task.go          # HTTP 处理器
│   ├── model/
│   │   └── task.go          # 数据模型
│   └── store/
│       └── memory.go        # 内存存储
├── pkg/
│   └── response/
│       └── response.go      # 响应工具
└── go.mod
```

### 初始化项目

```bash
mkdir -p taskmanager/cmd/server
mkdir -p taskmanager/internal/handler
mkdir -p taskmanager/internal/model
mkdir -p taskmanager/internal/store
mkdir -p taskmanager/pkg/response
cd taskmanager
go mod init example.com/taskmanager
```

### 数据模型 — internal/model/task.go

```go
package model

import (
    "encoding/json"
    "fmt"
    "time"
)

// Status 表示任务状态
type Status string

const (
    StatusTodo       Status = "todo"
    StatusInProgress Status = "in_progress"
    StatusDone       Status = "done"
)

// Task 表示一个任务
type Task struct {
    ID          string    `json:"id"`
    Title       string    `json:"title"`
    Description string    `json:"description,omitempty"`
    Status      Status    `json:"status"`
    Priority    int       `json:"priority"`
    CreatedAt   time.Time `json:"created_at"`
    UpdatedAt   time.Time `json:"updated_at"`
}

// CreateTaskRequest 创建任务的请求体
type CreateTaskRequest struct {
    Title       string `json:"title"`
    Description string `json:"description"`
    Priority    int    `json:"priority"`
}

// UpdateTaskRequest 更新任务的请求体
type UpdateTaskRequest struct {
    Title       *string `json:"title,omitempty"`
    Description *string `json:"description,omitempty"`
    Status      *Status `json:"status,omitempty"`
    Priority    *int    `json:"priority,omitempty"`
}

// Validate 校验创建请求
func (r CreateTaskRequest) Validate() error {
    if r.Title == "" {
        return fmt.Errorf("title 不能为空")
    }
    if r.Priority < 0 || r.Priority > 5 {
        return fmt.Errorf("priority 必须在 0-5 之间")
    }
    return nil
}

// ErrorResponse 错误响应
type ErrorResponse struct {
    Error   string `json:"error"`
    Message string `json:"message"`
}

// ListResponse 列表响应（带分页）
type ListResponse struct {
    Data   []Task `json:"data"`
    Total  int    `json:"total"`
    Offset int    `json:"offset"`
    Limit  int    `json:"limit"`
}

// 自定义 Task 的 JSON 序列化：确保时间格式统一
func (t Task) MarshalJSON() ([]byte, error) {
    type Alias Task
    return json.Marshal(&struct {
        CreatedAt string `json:"created_at"`
        UpdatedAt string `json:"updated_at"`
        *Alias
    }{
        CreatedAt: t.CreatedAt.Format(time.RFC3339),
        UpdatedAt: t.UpdatedAt.Format(time.RFC3339),
        Alias:     (*Alias)(&t),
    })
}
```

### 内存存储 — internal/store/memory.go

```go
package store

import (
    "fmt"
    "sort"
    "sync"
    "time"

    "example.com/taskmanager/internal/model"
)

// MemoryStore 内存任务存储
type MemoryStore struct {
    mu    sync.RWMutex
    tasks map[string]model.Task
    seq   int
}

// NewMemoryStore 创建新的内存存储
func NewMemoryStore() *MemoryStore {
    return &MemoryStore{
        tasks: make(map[string]model.Task),
    }
}

// Create 创建任务
func (s *MemoryStore) Create(req model.CreateTaskRequest) model.Task {
    s.mu.Lock()
    defer s.mu.Unlock()

    s.seq++
    now := time.Now()
    task := model.Task{
        ID:          fmt.Sprintf("task-%04d", s.seq),
        Title:       req.Title,
        Description: req.Description,
        Status:      model.StatusTodo,
        Priority:    req.Priority,
        CreatedAt:   now,
        UpdatedAt:   now,
    }
    s.tasks[task.ID] = task
    return task
}

// GetByID 根据 ID 获取任务
func (s *MemoryStore) GetByID(id string) (model.Task, bool) {
    s.mu.RLock()
    defer s.mu.RUnlock()

    task, ok := s.tasks[id]
    return task, ok
}

// List 列出任务（支持分页和状态过滤）
func (s *MemoryStore) List(offset, limit int, statusFilter model.Status) ([]model.Task, int) {
    s.mu.RLock()
    defer s.mu.RUnlock()

    // 收集符合条件的任务
    var tasks []model.Task
    for _, t := range s.tasks {
        if statusFilter != "" && t.Status != statusFilter {
            continue
        }
        tasks = append(tasks, t)
    }

    // 按创建时间排序（最新的在前）
    sort.Slice(tasks, func(i, j int) bool {
        return tasks[i].CreatedAt.After(tasks[j].CreatedAt)
    })

    total := len(tasks)

    // 分页处理
    if offset >= total {
        return []model.Task{}, total
    }
    end := offset + limit
    if end > total {
        end = total
    }

    return tasks[offset:end], total
}

// Update 更新任务
func (s *MemoryStore) Update(id string, req model.UpdateTaskRequest) (model.Task, error) {
    s.mu.Lock()
    defer s.mu.Unlock()

    task, ok := s.tasks[id]
    if !ok {
        return model.Task{}, fmt.Errorf("任务 %s 不存在", id)
    }

    // 仅更新提供的字段
    if req.Title != nil {
        task.Title = *req.Title
    }
    if req.Description != nil {
        task.Description = *req.Description
    }
    if req.Status != nil {
        task.Status = *req.Status
    }
    if req.Priority != nil {
        task.Priority = *req.Priority
    }
    task.UpdatedAt = time.Now()

    s.tasks[id] = task
    return task, nil
}

// Delete 删除任务
func (s *MemoryStore) Delete(id string) error {
    s.mu.Lock()
    defer s.mu.Unlock()

    if _, ok := s.tasks[id]; !ok {
        return fmt.Errorf("任务 %s 不存在", id)
    }
    delete(s.tasks, id)
    return nil
}
```

### 响应工具 — pkg/response/response.go

```go
package response

import (
    "encoding/json"
    "log/slog"
    "net/http"
)

// JSON 发送 JSON 响应
func JSON(w http.ResponseWriter, status int, data any) {
    w.Header().Set("Content-Type", "application/json; charset=utf-8")
    w.WriteHeader(status)
    if data != nil {
        if err := json.NewEncoder(w).Encode(data); err != nil {
            slog.Error("JSON 编码失败", "error", err)
        }
    }
}

// Error 发送错误响应
func Error(w http.ResponseWriter, status int, msg string) {
    JSON(w, status, map[string]string{"error": msg})
}

// DecodeJSON 解码请求体中的 JSON
func DecodeJSON(r *http.Request, dst any) error {
    if r.Body == nil {
        return fmt.Errorf("请求体为空")
    }
    defer r.Body.Close()
    dec := json.NewDecoder(r.Body)
    dec.DisallowUnknownFields() // 禁止未知字段，更严格
    return dec.Decode(dst)
}
```

注意：`response.go` 中 `Error` 函数用到了 `fmt.Errorf`，需要补充 import：

```go
package response

import (
    "encoding/json"
    "fmt"
    "log/slog"
    "net/http"
)

// JSON 发送 JSON 响应
func JSON(w http.ResponseWriter, status int, data any) {
    w.Header().Set("Content-Type", "application/json; charset=utf-8")
    w.WriteHeader(status)
    if data != nil {
        if err := json.NewEncoder(w).Encode(data); err != nil {
            slog.Error("JSON 编码失败", "error", err)
        }
    }
}

// Error 发送错误响应
func Error(w http.ResponseWriter, status int, msg string) {
    JSON(w, status, map[string]string{"error": msg})
}

// DecodeJSON 解码请求体中的 JSON
func DecodeJSON(r *http.Request, dst any) error {
    if r.Body == nil {
        return fmt.Errorf("请求体为空")
    }
    defer r.Body.Close()
    dec := json.NewDecoder(r.Body)
    dec.DisallowUnknownFields()
    return dec.Decode(dst)
}
```

### HTTP 处理器 — internal/handler/task.go

```go
package handler

import (
    "log/slog"
    "net/http"
    "strconv"

    "example.com/taskmanager/internal/model"
    "example.com/taskmanager/internal/store"
    "example.com/taskmanager/pkg/response"
)

// TaskHandler 任务处理器
type TaskHandler struct {
    store *store.MemoryStore
}

// NewTaskHandler 创建任务处理器
func NewTaskHandler(s *store.MemoryStore) *TaskHandler {
    return &TaskHandler{store: s}
}

// RegisterRoutes 注册路由（Go 1.22+ 路由模式）
func (h *TaskHandler) RegisterRoutes(mux *http.ServeMux) {
    mux.HandleFunc("GET /api/v1/tasks", h.ListTasks)
    mux.HandleFunc("POST /api/v1/tasks", h.CreateTask)
    mux.HandleFunc("GET /api/v1/tasks/{id}", h.GetTask)
    mux.HandleFunc("PUT /api/v1/tasks/{id}", h.UpdateTask)
    mux.HandleFunc("DELETE /api/v1/tasks/{id}", h.DeleteTask)
}

// CreateTask 创建任务
func (h *TaskHandler) CreateTask(w http.ResponseWriter, r *http.Request) {
    var req model.CreateTaskRequest
    if err := response.DecodeJSON(r, &req); err != nil {
        response.Error(w, http.StatusBadRequest, "无效的请求数据: "+err.Error())
        return
    }

    if err := req.Validate(); err != nil {
        response.Error(w, http.StatusBadRequest, err.Error())
        return
    }

    task := h.store.Create(req)

    slog.Info("任务创建成功",
        "task_id", task.ID,
        "title", task.Title,
        "remote_addr", r.RemoteAddr,
    )

    response.JSON(w, http.StatusCreated, task)
}

// ListTasks 列出任务（支持分页和状态过滤）
func (h *TaskHandler) ListTasks(w http.ResponseWriter, r *http.Request) {
    query := r.URL.Query()

    // 解析分页参数
    offset, _ := strconv.Atoi(query.Get("offset"))
    if offset < 0 {
        offset = 0
    }
    limit, _ := strconv.Atoi(query.Get("limit"))
    if limit <= 0 || limit > 100 {
        limit = 20
    }

    // 解析状态过滤
    statusFilter := model.Status(query.Get("status"))

    tasks, total := h.store.List(offset, limit, statusFilter)

    response.JSON(w, http.StatusOK, model.ListResponse{
        Data:   tasks,
        Total:  total,
        Offset: offset,
        Limit:  limit,
    })
}

// GetTask 获取单个任务
func (h *TaskHandler) GetTask(w http.ResponseWriter, r *http.Request) {
    id := r.PathValue("id")

    task, ok := h.store.GetByID(id)
    if !ok {
        response.Error(w, http.StatusNotFound, "任务不存在")
        return
    }

    response.JSON(w, http.StatusOK, task)
}

// UpdateTask 更新任务
func (h *TaskHandler) UpdateTask(w http.ResponseWriter, r *http.Request) {
    id := r.PathValue("id")

    var req model.UpdateTaskRequest
    if err := response.DecodeJSON(r, &req); err != nil {
        response.Error(w, http.StatusBadRequest, "无效的请求数据: "+err.Error())
        return
    }

    task, err := h.store.Update(id, req)
    if err != nil {
        response.Error(w, http.StatusNotFound, err.Error())
        return
    }

    slog.Info("任务更新成功",
        "task_id", task.ID,
        "status", task.Status,
    )

    response.JSON(w, http.StatusOK, task)
}

// DeleteTask 删除任务
func (h *TaskHandler) DeleteTask(w http.ResponseWriter, r *http.Request) {
    id := r.PathValue("id")

    if err := h.store.Delete(id); err != nil {
        response.Error(w, http.StatusNotFound, err.Error())
        return
    }

    slog.Info("任务删除成功", "task_id", id)

    w.WriteHeader(http.StatusNoContent)
}
```

### 程序入口 — cmd/server/main.go

```go
package main

import (
    "context"
    "fmt"
    "log/slog"
    "net/http"
    "os"
    "os/signal"
    "syscall"
    "time"

    "example.com/taskmanager/internal/handler"
    "example.com/taskmanager/internal/store"
)

func main() {
    // 配置结构化日志
    logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{
        Level: slog.LevelInfo,
    }))
    slog.SetDefault(logger)

    // 从环境变量读取配置
    port := os.Getenv("PORT")
    if port == "" {
        port = "8080"
    }

    // 初始化存储和处理器
    taskStore := store.NewMemoryStore()
    taskHandler := handler.NewTaskHandler(taskStore)

    // 创建路由
    mux := http.NewServeMux()

    // 健康检查
    mux.HandleFunc("GET /health", func(w http.ResponseWriter, r *http.Request) {
        response := map[string]string{
            "status": "ok",
            "time":   time.Now().Format(time.RFC3339),
        }
        w.Header().Set("Content-Type", "application/json")
        fmt.Fprintf(w, `{"status":"%s","time":"%s"}`, response["status"], response["time"])
    })

    // 注册任务路由
    taskHandler.RegisterRoutes(mux)

    // 添加请求日志中间件
    loggedMux := loggingMiddleware(mux)

    // 创建 HTTP 服务器
    server := &http.Server{
        Addr:         ":" + port,
        Handler:      loggedMux,
        ReadTimeout:  10 * time.Second,
        WriteTimeout: 10 * time.Second,
        IdleTimeout:  60 * time.Second,
    }

    // 启动服务器（在 goroutine 中）
    go func() {
        slog.Info("服务器启动", "port", port)
        if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
            slog.Error("服务器异常退出", "error", err)
            os.Exit(1)
        }
    }()

    // 优雅关闭
    quit := make(chan os.Signal, 1)
    signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
    <-quit

    slog.Info("正在关闭服务器...")

    ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
    defer cancel()

    if err := server.Shutdown(ctx); err != nil {
        slog.Error("服务器强制关闭", "error", err)
    }

    slog.Info("服务器已停止")
}

// loggingMiddleware 请求日志中间件
func loggingMiddleware(next http.Handler) http.Handler {
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        start := time.Now()

        // 使用自定义 ResponseWriter 捕获状态码
        wrapped := &responseWriter{ResponseWriter: w, statusCode: http.StatusOK}

        next.ServeHTTP(wrapped, r)

        duration := time.Since(start)

        slog.Info("请求处理完成",
            "method", r.Method,
            "path", r.URL.Path,
            "status", wrapped.statusCode,
            "duration", duration.String(),
            "remote_addr", r.RemoteAddr,
        )
    })
}

// responseWriter 包装 http.ResponseWriter 以捕获状态码
type responseWriter struct {
    http.ResponseWriter
    statusCode int
}

func (rw *responseWriter) WriteHeader(code int) {
    rw.statusCode = code
    rw.ResponseWriter.WriteHeader(code)
}
```

### 运行和测试

```bash
# 启动服务器
go run cmd/server/main.go

# 输出：
# {"time":"2026-06-13T10:00:00.000Z","level":"INFO","msg":"服务器启动","port":"8080"}
```

在另一个终端测试 API：

```bash
# 创建任务
curl -X POST http://localhost:8080/api/v1/tasks \
  -H "Content-Type: application/json" \
  -d '{"title":"学习 Go 标准库","description":"阅读 net/http 和 encoding/json 的文档","priority":3}'

# 响应：
# {"id":"task-0001","title":"学习 Go 标准库","description":"阅读 net/http 和 encoding/json 的文档","status":"todo","priority":3,"created_at":"2026-06-13T10:01:00Z","updated_at":"2026-06-13T10:01:00Z"}

# 创建第二个任务
curl -X POST http://localhost:8080/api/v1/tasks \
  -H "Content-Type: application/json" \
  -d '{"title":"编写 REST API","priority":5}'

# 获取所有任务
curl http://localhost:8080/api/v1/tasks

# 获取单个任务
curl http://localhost:8080/api/v1/tasks/task-0001

# 更新任务（部分更新）
curl -X PUT http://localhost:8080/api/v1/tasks/task-0001 \
  -H "Content-Type: application/json" \
  -d '{"status":"in_progress"}'

# 按状态过滤
curl "http://localhost:8080/api/v1/tasks?status=in_progress&limit=10"

# 删除任务
curl -X DELETE http://localhost:8080/api/v1/tasks/task-0001

# 健康检查
curl http://localhost:8080/health
```

### 测试文件 — internal/handler/task_test.go

```go
package handler

import (
    "bytes"
    "encoding/json"
    "net/http"
    "net/http/httptest"
    "testing"

    "example.com/taskmanager/internal/model"
    "example.com/taskmanager/internal/store"
)

func setupHandler() *TaskHandler {
    return NewTaskHandler(store.NewMemoryStore())
}

func TestCreateTask(t *testing.T) {
    h := setupHandler()
    mux := http.NewServeMux()
    h.RegisterRoutes(mux)

    body := `{"title":"测试任务","priority":3}`
    req := httptest.NewRequest("POST", "/api/v1/tasks", bytes.NewBufferString(body))
    req.Header.Set("Content-Type", "application/json")
    w := httptest.NewRecorder()

    mux.ServeHTTP(w, req)

    if w.Code != http.StatusCreated {
        t.Errorf("状态码 = %d, want %d", w.Code, http.StatusCreated)
    }

    var task model.Task
    json.NewDecoder(w.Body).Decode(&task)
    if task.Title != "测试任务" {
        t.Errorf("Title = %q, want %q", task.Title, "测试任务")
    }
    if task.Status != model.StatusTodo {
        t.Errorf("Status = %q, want %q", task.Status, model.StatusTodo)
    }
}

func TestCreateTaskValidation(t *testing.T) {
    h := setupHandler()
    mux := http.NewServeMux()
    h.RegisterRoutes(mux)

    tests := []struct {
        name       string
        body       string
        wantStatus int
    }{
        {"空标题", `{"title":"","priority":1}`, http.StatusBadRequest},
        {"优先级超出范围", `{"title":"测试","priority":10}`, http.StatusBadRequest},
        {"空请求体", ``, http.StatusBadRequest},
    }

    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            req := httptest.NewRequest("POST", "/api/v1/tasks", bytes.NewBufferString(tt.body))
            req.Header.Set("Content-Type", "application/json")
            w := httptest.NewRecorder()

            mux.ServeHTTP(w, req)

            if w.Code != tt.wantStatus {
                t.Errorf("状态码 = %d, want %d", w.Code, tt.wantStatus)
            }
        })
    }
}

func TestGetTask(t *testing.T) {
    h := setupHandler()
    mux := http.NewServeMux()
    h.RegisterRoutes(mux)

    // 先创建一个任务
    body := `{"title":"获取测试","priority":1}`
    createReq := httptest.NewRequest("POST", "/api/v1/tasks", bytes.NewBufferString(body))
    createReq.Header.Set("Content-Type", "application/json")
    createW := httptest.NewRecorder()
    mux.ServeHTTP(createW, createReq)

    var created model.Task
    json.NewDecoder(createW.Body).Decode(&created)

    // 获取任务
    req := httptest.NewRequest("GET", "/api/v1/tasks/"+created.ID, nil)
    w := httptest.NewRecorder()
    mux.ServeHTTP(w, req)

    if w.Code != http.StatusOK {
        t.Errorf("状态码 = %d, want %d", w.Code, http.StatusOK)
    }

    var got model.Task
    json.NewDecoder(w.Body).Decode(&got)
    if got.ID != created.ID {
        t.Errorf("ID = %q, want %q", got.ID, created.ID)
    }
}

func TestListTasks(t *testing.T) {
    h := setupHandler()
    mux := http.NewServeMux()
    h.RegisterRoutes(mux)

    // 创建多个任务
    for i := 0; i < 5; i++ {
        body := `{"title":"任务` + string(rune('A'+i)) + `","priority":1}`
        req := httptest.NewRequest("POST", "/api/v1/tasks", bytes.NewBufferString(body))
        req.Header.Set("Content-Type", "application/json")
        w := httptest.NewRecorder()
        mux.ServeHTTP(w, req)
    }

    // 获取列表
    req := httptest.NewRequest("GET", "/api/v1/tasks?limit=3&offset=0", nil)
    w := httptest.NewRecorder()
    mux.ServeHTTP(w, req)

    if w.Code != http.StatusOK {
        t.Errorf("状态码 = %d, want %d", w.Code, http.StatusOK)
    }

    var listResp model.ListResponse
    json.NewDecoder(w.Body).Decode(&listResp)
    if listResp.Total != 5 {
        t.Errorf("Total = %d, want 5", listResp.Total)
    }
    if len(listResp.Data) != 3 {
        t.Errorf("返回条数 = %d, want 3", len(listResp.Data))
    }
}

func TestDeleteTask(t *testing.T) {
    h := setupHandler()
    mux := http.NewServeMux()
    h.RegisterRoutes(mux)

    // 创建任务
    body := `{"title":"待删除","priority":1}`
    createReq := httptest.NewRequest("POST", "/api/v1/tasks", bytes.NewBufferString(body))
    createReq.Header.Set("Content-Type", "application/json")
    createW := httptest.NewRecorder()
    mux.ServeHTTP(createW, createReq)

    var created model.Task
    json.NewDecoder(createW.Body).Decode(&created)

    // 删除任务
    delReq := httptest.NewRequest("DELETE", "/api/v1/tasks/"+created.ID, nil)
    delW := httptest.NewRecorder()
    mux.ServeHTTP(delW, delReq)

    if delW.Code != http.StatusNoContent {
        t.Errorf("删除状态码 = %d, want %d", delW.Code, http.StatusNoContent)
    }

    // 再次获取应该返回 404
    getReq := httptest.NewRequest("GET", "/api/v1/tasks/"+created.ID, nil)
    getW := httptest.NewRecorder()
    mux.ServeHTTP(getW, getReq)

    if getW.Code != http.StatusNotFound {
        t.Errorf("删除后获取状态码 = %d, want %d", getW.Code, http.StatusNotFound)
    }
}
```

运行项目测试：

```bash
go test -v ./...
```

## Go 项目布局建议

Go 社区虽然没有强制的目录结构，但经过多年实践，形成了一套约定俗成的布局模式：

```
myproject/
├── cmd/                    # 应用入口
│   └── server/
│       └── main.go         # main 函数，尽量精简
├── internal/               # 私有代码（其他项目无法 import）
│   ├── handler/            # HTTP 处理器
│   ├── service/            # 业务逻辑
│   ├── repository/         # 数据访问
│   └── model/              # 数据模型
├── pkg/                    # 可被外部项目引用的公共库
│   └── response/
│       └── response.go
├── configs/                # 配置文件
│   └── config.yaml
├── scripts/                # 构建、部署脚本
├── test/                   # 集成测试、测试数据
├── go.mod
├── go.sum
└── README.md
```

关键原则：

- **`cmd/`**：每个子目录对应一个可执行文件，`main.go` 只做初始化和启动，业务逻辑放 `internal/`
- **`internal/`**：Go 编译器强制保证该目录下的代码不能被外部模块导入，适合放业务核心代码
- **`pkg/`**：可复用的公共包，如果有跨项目复用的工具类放这里
- **避免过度设计**：小型项目可以只有一个 `main.go`，不必强套目录结构

```
# 简单项目示例
simple-tool/
├── main.go
├── go.mod
└── go.sum

# 中型项目示例
medium-service/
├── cmd/
│   └── server/
│       └── main.go
├── internal/
│   ├── handler/
│   ├── store/
│   └── model/
├── go.mod
└── go.sum
```

## 总结

Go 标准库的精妙之处在于：**接口简单，组合强大**。

| 包 | 核心能力 | 关键接口/函数 |
|---|---|---|
| `io` | 数据流抽象 | `Reader`, `Writer`, `Copy`, `ReadAll` |
| `os` | 系统交互 | `Open`, `Create`, `ReadFile`, `WriteFile` |
| `bufio` | 缓冲读写 | `NewScanner`, `NewWriter` |
| `encoding/json` | JSON 处理 | `Marshal`, `Unmarshal`, `MarshalJSON` |
| `net/http` | HTTP 服务 | `ServeMux`, `HandleFunc`, `ListenAndServe` |
| `testing` | 测试框架 | `TestXxx`, `BenchmarkXxx`, `t.Run` |
| `log/slog` | 结构化日志 | `Info`, `Error`, `With`, `JSONHandler` |

通过本文的实战项目可以看到：**仅用标准库就能构建一个功能完整的 REST API 服务**，包括路由匹配、JSON 处理、CRUD 操作、分页过滤、错误处理、请求日志、优雅关闭和完整的单元测试。在没有特殊需求的情况下，标准库完全够用。当你真正理解了标准库的设计思想，再去选择第三方框架时，会有更清晰的判断力——知道它在解决什么问题，又引入了什么复杂度。

Go 的哲学是 **少即是多**。掌握标准库，你就掌握了 Go 的精髓。
