---
title: Go 并发编程：Goroutine 与 Channel 实战
icon: arrows-spin
date: 2026-06-13
category:
  - 技术
tag:
  - Go
  - Golang
  - 并发
---

# Go 并发编程：Goroutine 与 Channel 实战

并发是 Go 语言最强大的特性之一。Go 在语言层面原生支持并发编程，通过 Goroutine 和 Channel 提供了简洁、高效的并发模型。本文将从概念到实战，系统讲解 Go 并发编程的核心知识，帮助你写出高性能、安全的并发程序。

<!-- more -->

## 并发 vs 并行

在深入 Go 并发之前，先厘清两个容易混淆的概念：

- **并发（Concurrency）**：指程序具备处理多个任务的能力，多个任务可以在重叠的时间段内推进。并发是**结构化**程序的方式，关注的是如何组织和调度。
- **并行（Parallelism）**：指多个任务在同一时刻真正同时执行，需要多核 CPU 的物理支持。并行是**执行**程序的方式。

用一句话概括 Rob Pike 的经典论述：**并发是关于处理很多事情，并行是关于同时做很多事情。**

Go 的 runtime 调度器会在少量系统线程上 multiplex 大量 Goroutine，即使只有单核 CPU，也能实现高效的并发。当有多核可用时，Go 调度器会自动利用多核实现并行。

## Goroutine

### 启动 Goroutine

Goroutine 是 Go 语言中的轻量级线程。使用 `go` 关键字即可启动一个 Goroutine，它比操作系统线程轻量得多——初始栈仅 2KB（可动态增长），创建和切换开销极小。

```go
package main

import (
    "fmt"
    "time"
)

func sayHello(name string) {
    for i := 0; i < 3; i++ {
        fmt.Printf("Hello, %s! (count: %d)\n", name, i+1)
        time.Sleep(100 * time.Millisecond)
    }
}

func main() {
    // 使用 go 关键字启动 Goroutine
    go sayHello("Goroutine-A")
    go sayHello("Goroutine-B")

    // 匿名函数 Goroutine
    go func() {
        fmt.Println("匿名 Goroutine 执行完毕")
    }()

    // 主 Goroutine 的工作
    fmt.Println("主 Goroutine 正在工作...")

    // 等待其他 Goroutine 完成（简单方式，实际项目中用 WaitGroup）
    time.Sleep(500 * time.Millisecond)
    fmt.Println("程序结束")
}
```

### GMP 调度模型简介

Go runtime 使用 **GMP 调度模型**来管理 Goroutine 的调度：

- **G（Goroutine）**：每个 `go` 语句创建一个 G，包含栈、指令指针等调度信息。
- **M（Machine）**：代表操作系统线程，由操作系统调度。G 最终在 M 上执行。
- **P（Processor）**：逻辑处理器，承载本地 G 队列。P 的数量默认等于 CPU 核心数（可通过 `GOMAXPROCS` 设置）。

调度流程概要：

1. 每个 P 持有一个本地 G 队列（local run queue），新创建的 G 优先放入当前 P 的本地队列。
2. 当 P 的本地队列为空时，会从全局队列（global run queue）或其他 P 的本地队列中**窃取（work stealing）** G。
3. 当 G 执行系统调用等阻塞操作时，M 会与 P 解绑，P 会绑定另一个空闲的 M 继续执行其他 G，避免浪费 CPU。

这种模型使得 Go 可以在少量系统线程上高效调度数十万个 Goroutine。

### Goroutine 生命周期管理

Goroutine 没有直接的 ID 暴露给用户，也无法从外部"杀死"一个 Goroutine。生命周期管理通常通过以下方式实现：

```go
package main

import (
    "fmt"
    "time"
)

func worker(done chan struct{}) {
    defer fmt.Println("worker: 退出清理完成")

    for {
        select {
        case <-done:
            // 收到退出信号
            return
        default:
            fmt.Println("worker: 正在工作...")
            time.Sleep(200 * time.Millisecond)
        }
    }
}

func main() {
    done := make(chan struct{})

    go worker(done)

    // 让 worker 运行一段时间
    time.Sleep(600 * time.Millisecond)

    // 通知 worker 退出
    fmt.Println("main: 发送退出信号")
    close(done)

    // 等待 worker 确认退出
    time.Sleep(100 * time.Millisecond)
    fmt.Println("main: 程序结束")
}
```

## Channel

Channel（通道）是 Goroutine 之间通信的核心机制，遵循 **"不要通过共享内存来通信，而要通过通信来共享内存"**（Do not communicate by sharing memory; instead, share memory by communicating）的设计哲学。

### 创建与基本操作

```go
package main

import "fmt"

func main() {
    // 使用 make 创建 channel
    ch := make(chan string)

    // 启动 Goroutine 发送数据
    go func() {
        ch <- "你好，Channel！" // 发送（send）
    }()

    // 在主 Goroutine 中接收
    msg := <-ch // 接收（receive）
    fmt.Println("收到消息:", msg)

    // 关闭 channel
    close(ch)

    // 从已关闭的 channel 接收会得到零值
    val, ok := <-ch
    fmt.Printf("关闭后接收: val=%q, ok=%v\n", val, ok)
}
```

### 无缓冲 vs 缓冲 Channel

```go
package main

import (
    "fmt"
    "time"
)

func main() {
    // --- 无缓冲 channel（同步通道）---
    // 发送和接收必须同时就绪，否则阻塞
    unbuffered := make(chan int)

    go func() {
        fmt.Println("Goroutine: 准备发送...")
        unbuffered <- 42
        fmt.Println("Goroutine: 发送成功")
    }()

    time.Sleep(100 * time.Millisecond) // 模拟主 Goroutine 稍后接收
    val := <-unbuffered
    fmt.Println("主 Goroutine 接收:", val)

    // --- 缓冲 channel ---
    // 缓冲区未满时发送不阻塞，缓冲区不为空时接收不阻塞
    buffered := make(chan int, 3) // 缓冲区大小为 3

    // 可以连续发送 3 个值而不阻塞
    buffered <- 1
    buffered <- 2
    buffered <- 3
    fmt.Println("缓冲 channel: 已发送 3 个值")

    fmt.Println("接收:", <-buffered)
    fmt.Println("接收:", <-buffered)
    fmt.Println("接收:", <-buffered)
}
```

关键区别总结：

| 特性 | 无缓冲 channel | 缓冲 channel |
|---|---|---|
| 创建方式 | `make(chan T)` | `make(chan T, n)` |
| 发送阻塞条件 | 没有接收者就绪 | 缓冲区已满 |
| 接收阻塞条件 | 没有发送者就绪 | 缓冲区为空 |
| 典型用途 | 同步信号、事件通知 | 解耦生产消费速率 |

### 遍历 Channel（range）

当发送端关闭 channel 后，接收端可以用 `range` 遍历所有值：

```go
package main

import "fmt"

func fibonacci(n int, ch chan<- int) {
    a, b := 0, 1
    for i := 0; i < n; i++ {
        ch <- a
        a, b = b, a+b
    }
    close(ch) // 发送端关闭 channel
}

func main() {
    ch := make(chan int)

    go fibonacci(10, ch)

    // range 自动在 channel 关闭后退出
    for val := range ch {
        fmt.Printf("%d ", val)
    }
    fmt.Println()
}
```

注意 channel 的方向标注：`chan<- int` 表示只发送通道，`<-chan int` 表示只接收通道，这是很好的类型安全实践。

## select 语句

`select` 让一个 Goroutine 同时等待多个 channel 操作，类似于 switch 但专门用于 channel。

### 多 Channel 复用

```go
package main

import (
    "fmt"
    "math/rand"
    "time"
)

func main() {
    ch1 := make(chan string)
    ch2 := make(chan string)

    // 模拟两个不同速度的数据源
    go func() {
        for i := 0; ; i++ {
            time.Sleep(time.Duration(200+rand.Intn(300)) * time.Millisecond)
            ch1 <- fmt.Sprintf("源A-消息%d", i)
        }
    }()

    go func() {
        for i := 0; ; i++ {
            time.Sleep(time.Duration(300+rand.Intn(400)) * time.Millisecond)
            ch2 <- fmt.Sprintf("源B-消息%d", i)
        }
    }()

    // select 多路复用
    received := 0
    for received < 6 {
        select {
        case msg1 := <-ch1:
            fmt.Println("收到:", msg1)
            received++
        case msg2 := <-ch2:
            fmt.Println("收到:", msg2)
            received++
        }
    }
    fmt.Println("收集完毕，共收到", received, "条消息")
}
```

### 超时处理（time.After）

`select` 配合 `time.After` 可以实现超时控制，避免 Goroutine 永远阻塞：

```go
package main

import (
    "fmt"
    "time"
)

func slowOperation(ch chan<- string) {
    time.Sleep(3 * time.Second) // 模拟耗时操作
    ch <- "操作结果"
}

func main() {
    result := make(chan string, 1)

    go slowOperation(result)

    select {
    case res := <-result:
        fmt.Println("成功:", res)
    case <-time.After(1 * time.Second):
        fmt.Println("超时：操作未在 1 秒内完成")
    }
}
```

### 非阻塞收发（default）

```go
package main

import "fmt"

func main() {
    ch := make(chan int, 1)

    // 非阻塞发送
    select {
    case ch <- 42:
        fmt.Println("发送成功")
    default:
        fmt.Println("发送失败：channel 已满")
    }

    // 非阻塞接收
    select {
    case val := <-ch:
        fmt.Println("接收:", val)
    default:
        fmt.Println("接收失败：channel 为空")
    }
}
```

## sync 包：同步原语

### WaitGroup

`sync.WaitGroup` 用于等待一组 Goroutine 完成，是最常用的同步工具之一：

```go
package main

import (
    "fmt"
    "math/rand"
    "sync"
    "time"
)

func fetchURL(id int, wg *sync.WaitGroup) {
    defer wg.Done() // 确保在函数退出时调用 Done

    duration := time.Duration(100+rand.Intn(400)) * time.Millisecond
    fmt.Printf("任务 %d: 开始下载（预计 %v）\n", id, duration)
    time.Sleep(duration) // 模拟网络请求
    fmt.Printf("任务 %d: 下载完成\n", id)
}

func main() {
    var wg sync.WaitGroup

    for i := 1; i <= 5; i++ {
        wg.Add(1) // 在启动 Goroutine 前调用 Add
        go fetchURL(i, &wg)
    }

    wg.Wait() // 阻塞直到所有 Goroutine 完成
    fmt.Println("所有下载任务完成")
}
```

要点：`wg.Add(1)` 必须在 `go` 之前调用，`defer wg.Done()` 确保即使发生 panic 也能计数正确。

### Mutex

`sync.Mutex` 用于保护共享资源，防止竞态条件：

```go
package main

import (
    "fmt"
    "sync"
)

type SafeCounter struct {
    mu sync.Mutex
    m  map[string]int
}

func (c *SafeCounter) Inc(key string) {
    c.mu.Lock()
    defer c.mu.Unlock()
    c.m[key]++
}

func (c *SafeCounter) Get(key string) int {
    c.mu.Lock()
    defer c.mu.Unlock()
    return c.m[key]
}

func main() {
    counter := SafeCounter{m: make(map[string]int)}

    var wg sync.WaitGroup

    // 100 个 Goroutine 并发递增计数器
    for i := 0; i < 100; i++ {
        wg.Add(1)
        go func() {
            defer wg.Done()
            counter.Inc("requests")
        }()
    }

    wg.Wait()
    fmt.Printf("最终计数: %d\n", counter.Get("requests")) // 输出: 100
}
```

如果只需要读写锁（读多写少场景），可以使用 `sync.RWMutex`，读操作用 `RLock/RUnlock`，写操作用 `Lock/Unlock`。

### Once

`sync.Once` 确保某个操作只执行一次，常用于单例模式和初始化：

```go
package main

import (
    "fmt"
    "sync"
)

type Database struct {
    name string
}

var (
    dbInstance *Database
    dbOnce     sync.Once
)

func GetDatabase() *Database {
    dbOnce.Do(func() {
        fmt.Println("初始化数据库连接（仅执行一次）...")
        dbInstance = &Database{name: "production-db"}
    })
    return dbInstance
}

func main() {
    var wg sync.WaitGroup

    for i := 0; i < 5; i++ {
        wg.Add(1)
        go func(id int) {
            defer wg.Done()
            db := GetDatabase()
            fmt.Printf("Goroutine %d 获取数据库实例: %s\n", id, db.name)
        }(i)
    }

    wg.Wait()
}
```

## context 包

`context` 包是 Go 并发编程中不可或缺的工具，用于在 Goroutine 树中传递截止时间、取消信号和请求级别的值。

### Context 传值

```go
package main

import (
    "context"
    "fmt"
)

func processRequest(ctx context.Context) {
    // 从 context 中获取请求 ID
    if reqID, ok := ctx.Value("requestID").(string); ok {
        fmt.Printf("处理请求，ID: %s\n", reqID)
    }

    // 获取用户信息
    if user, ok := ctx.Value("user").(string); ok {
        fmt.Printf("当前用户: %s\n", user)
    }
}

func main() {
    // 使用 WithValue 添加请求级别的值
    ctx := context.Background()
    ctx = context.WithValue(ctx, "requestID", "req-20260613-001")
    ctx = context.WithValue(ctx, "user", "alice")

    processRequest(ctx)
}
```

::: warning
`context.Value` 应该仅用于请求级别的跨 API 数据传递（如 request-scoped 的 trace ID、认证信息），不应该用来传递可选参数或业务逻辑数据。
:::

### 取消（WithCancel）

```go
package main

import (
    "context"
    "fmt"
    "time"
)

func longRunningTask(ctx context.Context, id int) {
    for i := 0; ; i++ {
        select {
        case <-ctx.Done():
            fmt.Printf("任务 %d: 收到取消信号，退出（原因: %v）\n", id, ctx.Err())
            return
        default:
            fmt.Printf("任务 %d: 正在工作... (step %d)\n", id, i)
            time.Sleep(200 * time.Millisecond)
        }
    }
}

func main() {
    // 创建可取消的 context
    ctx, cancel := context.WithCancel(context.Background())

    // 启动多个工作任务
    go longRunningTask(ctx, 1)
    go longRunningTask(ctx, 2)

    // 让任务运行一段时间
    time.Sleep(600 * time.Millisecond)

    // 取消所有任务
    fmt.Println("主 Goroutine: 取消所有任务")
    cancel()

    time.Sleep(100 * time.Millisecond)
    fmt.Println("程序结束")
}
```

### 超时（WithTimeout）

```go
package main

import (
    "context"
    "fmt"
    "time"
)

func fetchData(ctx context.Context, id int) error {
    // 模拟耗时数据获取
    select {
    case <-time.After(2 * time.Second):
        fmt.Printf("任务 %d: 数据获取成功\n", id)
        return nil
    case <-ctx.Done():
        return fmt.Errorf("任务 %d 被取消: %w", id, ctx.Err())
    }
}

func main() {
    // 设置 1 秒超时
    ctx, cancel := context.WithTimeout(context.Background(), 1*time.Second)
    defer cancel() // 确保资源释放

    err := fetchData(ctx, 1)
    if err != nil {
        fmt.Println("错误:", err) // 输出: 任务 1 被取消: context deadline exceeded
    }
}
```

### Context 最佳实践

1. **Context 作为函数的第一个参数**，不要放在结构体字段中。
2. **不要传递 nil context**，如果不确定用什么，用 `context.TODO()`。
3. **context.WithValue 只传请求级别的数据**（trace ID、auth token 等），不传业务参数。
4. **始终调用 cancel 函数**（用 `defer cancel()`），即使超时会自动取消，也要手动释放资源。
5. **Context 是只读的**，衍生出的子 context 不影响父 context，但父 context 取消时所有子 context 都会被取消。

```go
// 推荐的函数签名
func DoSomething(ctx context.Context, data string) error {
    // ...
    return nil
}

// 不推荐
func DoSomethingBad(data string, ctx context.Context) error { return nil }
func DoSomethingWorse(data string) context.Context { return nil }
```

## 常见并发模式

### Fan-in / Fan-out

Fan-out：将工作分发到多个 Goroutine 并行处理。Fan-in：将多个 Goroutine 的结果汇集到一个 channel。

```go
package main

import (
    "fmt"
    "sync"
    "time"
)

// 模拟处理单个任务
func process(id int) string {
    duration := time.Duration(100+id*50) * time.Millisecond
    time.Sleep(duration)
    return fmt.Sprintf("结果-%d (耗时 %v)", id, duration)
}

// Fan-out：启动多个 worker 并行消费任务
func fanOut(tasks []int, workerCount int) <-chan string {
    taskCh := make(chan int, len(tasks))
    resultCh := make(chan string, len(tasks))

    // 分发任务
    for _, t := range tasks {
        taskCh <- t
    }
    close(taskCh)

    // 启动多个 worker（Fan-out）
    var wg sync.WaitGroup
    for i := 0; i < workerCount; i++ {
        wg.Add(1)
        go func(workerID int) {
            defer wg.Done()
            for task := range taskCh {
                result := process(task)
                fmt.Printf("  Worker %d 完成: %s\n", workerID, result)
                resultCh <- result
            }
        }(i)
    }

    // Fan-in：等待所有 worker 完成后关闭结果 channel
    go func() {
        wg.Wait()
        close(resultCh)
    }()

    return resultCh
}

func main() {
    tasks := []int{1, 2, 3, 4, 5, 6, 7, 8}

    fmt.Println("=== Fan-out / Fan-in 模式 ===")
    start := time.Now()

    results := fanOut(tasks, 3) // 3 个 worker 并行

    for res := range results {
        fmt.Println("收集:", res)
    }

    fmt.Printf("总耗时: %v\n", time.Since(start))
}
```

### Pipeline

Pipeline 模式将处理流程拆分为多个阶段（stage），每个阶段通过 channel 串联，形成流水线。

```go
package main

import (
    "fmt"
    "time"
)

// 阶段1：生成数据
func generate(nums ...int) <-chan int {
    out := make(chan int)
    go func() {
        for _, n := range nums {
            fmt.Printf("  生成: %d\n", n)
            out <- n
        }
        close(out)
    }()
    return out
}

// 阶段2：平方计算
func square(in <-chan int) <-chan int {
    out := make(chan int)
    go func() {
        for n := range in {
            result := n * n
            fmt.Printf("  平方: %d -> %d\n", n, result)
            out <- result
        }
        close(out)
    }()
    return out
}

// 阶段3：加倍
func double(in <-chan int) <-chan int {
    out := make(chan int)
    go func() {
        for n := range in {
            result := n * 2
            fmt.Printf("  加倍: %d -> %d\n", n, result)
            out <- result
        }
        close(out)
    }()
    return out
}

func main() {
    fmt.Println("=== Pipeline 模式 ===")
    start := time.Now()

    // 组装流水线: generate -> square -> double
    pipeline := double(square(generate(1, 2, 3, 4, 5)))

    for result := range pipeline {
        fmt.Printf("最终结果: %d\n", result)
    }

    fmt.Printf("流水线总耗时: %v\n", time.Since(start))
}
```

### Worker Pool

Worker Pool 控制并发 Goroutine 的数量，避免资源耗尽：

```go
package main

import (
    "fmt"
    "sync"
    "time"
)

type Job struct {
    ID    int
    Input string
}

type Result struct {
    JobID  int
    Output string
}

func worker(id int, jobs <-chan Job, results chan<- Result, wg *sync.WaitGroup) {
    defer wg.Done()
    for job := range jobs {
        fmt.Printf("  Worker %d 开始处理任务 %d\n", id, job.ID)
        time.Sleep(100 * time.Millisecond) // 模拟处理耗时
        results <- Result{
            JobID:  job.ID,
            Output: fmt.Sprintf("%s-processed-by-worker-%d", job.Input, id),
        }
    }
}

func main() {
    fmt.Println("=== Worker Pool 模式 ===")

    const numWorkers = 3
    const numJobs = 10

    jobs := make(chan Job, numJobs)
    results := make(chan Result, numJobs)

    // 启动固定数量的 worker
    var wg sync.WaitGroup
    for i := 1; i <= numWorkers; i++ {
        wg.Add(1)
        go worker(i, jobs, results, &wg)
    }

    // 分发任务
    for i := 1; i <= numJobs; i++ {
        jobs <- Job{ID: i, Input: fmt.Sprintf("task-%d", i)}
    }
    close(jobs) // 关闭任务 channel，通知 worker 没有更多任务

    // 等待所有 worker 完成
    go func() {
        wg.Wait()
        close(results)
    }()

    // 收集结果
    start := time.Now()
    for res := range results {
        fmt.Printf("结果: 任务%d -> %s\n", res.JobID, res.Output)
    }
    fmt.Printf("%d 个任务由 %d 个 worker 处理，总耗时: %v\n", numJobs, numWorkers, time.Since(start))
}
```

## 并发安全与竞态检测

### 竞态条件

竞态条件（Race Condition）发生在多个 Goroutine 同时访问共享数据且至少有一个执行写操作时：

```go
// 错误示例：存在竞态条件
package main

import (
    "fmt"
    "sync"
)

func main() {
    var counter int
    var wg sync.WaitGroup

    for i := 0; i < 1000; i++ {
        wg.Add(1)
        go func() {
            defer wg.Done
            counter++ // 多个 Goroutine 并发读写，不安全！
        }()
    }

    wg.Wait()
    fmt.Println("counter =", counter) // 结果大概率不是 1000
}
```

### go test -race

Go 内置了强大的竞态检测器（Race Detector），使用非常简单：

```bash
# 测试时检测竞态
go test -race ./...

# 运行时检测竞态
go run -race main.go

# 构建时嵌入竞态检测
go build -race -o myapp .
```

实际使用示例，创建一个 `counter_test.go`：

```go
package main

import (
    "sync"
    "testing"
)

func TestCounterRace(t *testing.T) {
    var counter int
    var wg sync.WaitGroup

    for i := 0; i < 1000; i++ {
        wg.Add(1)
        go func() {
            defer wg.Done()
            counter++ // race detector 会检测到这里
        }()
    }

    wg.Wait()

    if counter != 1000 {
        t.Errorf("期望 1000，实际 %d", counter)
    }
}
```

运行 `go test -race` 会输出类似以下信息：

```
==================
WARNING: DATA RACE
Write at 0x... by goroutine ...
Previous write at 0x... by goroutine ...
==================
```

### 修复竞态条件

使用 `sync.Mutex` 或 `sync/atomic` 包修复：

```go
package main

import (
    "fmt"
    "sync"
    "sync/atomic"
)

func main() {
    // 方式一：使用 Mutex
    var mu sync.Mutex
    var counter1 int
    var wg sync.WaitGroup

    for i := 0; i < 1000; i++ {
        wg.Add(1)
        go func() {
            defer wg.Done()
            mu.Lock()
            counter1++
            mu.Unlock()
        }()
    }
    wg.Wait()
    fmt.Println("Mutex 方式:", counter1) // 1000

    // 方式二：使用 atomic（适合简单计数场景）
    var counter2 int64

    for i := 0; i < 1000; i++ {
        wg.Add(1)
        go func() {
            defer wg.Done()
            atomic.AddInt64(&counter2, 1)
        }()
    }
    wg.Wait()
    fmt.Println("Atomic 方式:", counter2) // 1000
}
```

## errgroup：并发任务编排与错误收集

`golang.org/x/sync/errgroup` 包提供了更优雅的并发任务编排方式，能够在一个任务失败时取消所有其他任务，并收集第一个错误。

### 基本用法

```go
package main

import (
    "context"
    "fmt"
    "time"

    "golang.org/x/sync/errgroup"
)

func fetchURL(ctx context.Context, url string, duration time.Duration) error {
    select {
    case <-time.After(duration):
        fmt.Printf("  成功获取: %s (耗时 %v)\n", url, duration)
        return nil
    case <-ctx.Done():
        return fmt.Errorf("获取 %s 被取消: %w", url, ctx.Err())
    }
}

func main() {
    // 创建 errgroup（关联 context）
    g, ctx := errgroup.WithContext(context.Background())

    urls := []struct {
        name     string
        duration time.Duration
    }{
        {"https://api.example.com/users", 200 * time.Millisecond},
        {"https://api.example.com/posts", 300 * time.Millisecond},
        {"https://api.example.com/comments", 400 * time.Millisecond},
    }

    fmt.Println("=== errgroup 并发获取 ===")

    for _, u := range urls {
        u := u // 捕获循环变量
        g.Go(func() error {
            return fetchURL(ctx, u.name, u.duration)
        })
    }

    // Wait 等待所有任务完成，返回第一个非 nil 错误
    if err := g.Wait(); err != nil {
        fmt.Printf("错误: %v\n", err)
    } else {
        fmt.Println("所有请求成功")
    }
}
```

### 错误取消：一个失败全部取消

```go
package main

import (
    "context"
    "fmt"
    "math/rand"
    "time"

    "golang.org/x/sync/errgroup"
)

func riskyTask(ctx context.Context, id int) error {
    delay := time.Duration(100+rand.Intn(500)) * time.Millisecond
    fail := rand.Float32() < 0.4 // 40% 概率失败

    select {
    case <-time.After(delay):
        if fail {
            return fmt.Errorf("任务 %d 失败（模拟错误）", id)
        }
        fmt.Printf("  任务 %d 成功 (耗时 %v)\n", id, delay)
        return nil
    case <-ctx.Done():
        return fmt.Errorf("任务 %d 被取消: %w", id, ctx.Err())
    }
}

func main() {
    g, ctx := errgroup.WithContext(context.Background())

    fmt.Println("=== errgroup 错误取消 ===")
    start := time.Now()

    // 启动 5 个任务
    for i := 1; i <= 5; i++ {
        i := i
        g.Go(func() error {
            return riskyTask(ctx, i)
        })
    }

    if err := g.Wait(); err != nil {
        fmt.Printf("第一个错误: %v (总耗时 %v)\n", err, time.Since(start))
    } else {
        fmt.Printf("全部成功 (总耗时 %v)\n", time.Since(start))
    }
}
```

### 设置并发限制

`errgroup` 支持通过 `SetLimit` 限制并发 Goroutine 数量：

```go
package main

import (
    "fmt"
    "sync/atomic"
    "time"

    "golang.org/x/sync/errgroup"
)

func main() {
    var concurrent int64
    var maxConcurrent int64

    g := new(errgroup.Group)
    g.SetLimit(3) // 最多 3 个 Goroutine 并行执行

    fmt.Println("=== errgroup 并发限制 ===")

    for i := 1; i <= 10; i++ {
        i := i
        g.Go(func() error {
            current := atomic.AddInt64(&concurrent, 1)

            // 记录最大并发数
            for {
                old := atomic.LoadInt64(&maxConcurrent)
                if current <= old || atomic.CompareAndSwapInt64(&maxConcurrent, old, current) {
                    break
                }
            }

            fmt.Printf("  任务 %d 开始（当前并发: %d）\n", i, current)
            time.Sleep(200 * time.Millisecond)

            atomic.AddInt64(&concurrent, -1)
            return nil
        })
    }

    if err := g.Wait(); err != nil {
        fmt.Printf("错误: %v\n", err)
    }

    fmt.Printf("最大并发数: %d（限制为 3）\n", atomic.LoadInt64(&maxConcurrent))
}
```

## 总结

Go 并发编程的核心工具和最佳实践一览：

| 工具/机制 | 适用场景 |
|---|---|
| `go` | 启动轻量级并发任务 |
| `channel` | Goroutine 间通信、数据传递 |
| `select` | 多 channel 复用、超时控制 |
| `sync.WaitGroup` | 等待一组 Goroutine 完成 |
| `sync.Mutex / RWMutex` | 保护共享资源的互斥访问 |
| `sync.Once` | 确保初始化只执行一次 |
| `sync/atomic` | 无锁原子操作（简单计数器等） |
| `context` | 传递取消信号、超时、请求级数据 |
| `errgroup` | 并发任务编排、错误收集、并发限制 |
| `go test -race` | 竞态条件检测 |

掌握这些工具后，你就能应对大多数 Go 并发编程场景。记住以下原则：

1. **优先使用 channel 通信**，而非共享内存加锁。
2. **始终处理 Goroutine 的生命周期**，避免 Goroutine 泄漏。
3. **使用 context 管理取消和超时**，不要用全局变量做退出信号。
4. **用 `go test -race` 检测竞态条件**，在 CI/CD 中保持开启。
5. **控制并发数量**，使用 worker pool 或 `errgroup.SetLimit` 避免 Goroutine 爆炸。
