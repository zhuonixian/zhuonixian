---
title: Go 数据类型、流程控制与错误处理
icon: list-check
date: 2026-06-13
category:
  - 技术
tag:
  - Go
  - Golang
  - 编程语言
---

# Go 数据类型、流程控制与错误处理

Go 语言以简洁著称，它的数据类型设计、流程控制语句和错误处理机制都体现了"少即是多"的哲学。本文面向 Go 初学者，系统梳理复合数据类型、字符串处理、指针、流程控制、defer、错误处理以及 panic/recover 等核心知识点。

<!-- more -->

## 复合数据类型

### 数组 vs 切片（Slice）

数组（array）是固定长度的序列，切片（slice）则是动态长度的引用类型。实际开发中，切片的使用远多于数组。

```go
package main

import "fmt"

func main() {
    // --- 数组：长度是类型的一部分 ---
    var arr1 [3]int                     // 零值数组 [0 0 0]
    arr2 := [3]int{1, 2, 3}            // 字面量初始化
    arr3 := [...]int{10, 20, 30}       // 编译器推断长度
    fmt.Println(arr1, arr2, arr3)

    // --- 切片：灵活的动态数组 ---
    var s1 []int                        // nil 切片，len=0, cap=0
    s2 := []int{1, 2, 3}               // 切片字面量
    s3 := make([]int, 0, 10)           // make 创建：len=0, cap=10
    fmt.Println(s1, s2, s3)
    fmt.Println(len(s1), cap(s3))

    // append 返回新切片（可能触发扩容）
    s2 = append(s2, 4, 5)
    fmt.Println("append 后:", s2)

    // 切片操作 [low:high]，左闭右开
    sub := s2[1:4] // [2 3 4]
    fmt.Println("子切片:", sub)

    // 切片共享底层数组，修改子切片会影响原切片
    sub[0] = 99
    fmt.Println("修改 sub 后 s2:", s2) // [1 99 3 4 5]

    // 使用 copy 避免共享
    dst := make([]int, len(s2))
    copy(dst, s2)
    dst[0] = 100
    fmt.Println("dst:", dst, "s2:", s2) // s2 不受影响

    // 删除切片元素（删除索引 2）
    s2 = append(s2[:2], s2[3:]...)
    fmt.Println("删除索引 2 后:", s2)
}
```

**要点总结：**

| 特性 | 数组 | 切片 |
|------|------|------|
| 长度 | 固定，属于类型的一部分 | 动态，可 append 扩容 |
| 零值 | 元素类型的零值填充 | nil |
| 传参 | 值拷贝（复制整个数组） | 传引用（共享底层数组） |
| 使用频率 | 较少 | 几乎所有场景 |

### Map

map 是无序的键值对集合，通过 `make` 创建。Go 的 map 并发不安全，多 goroutine 读写需要加锁或使用 `sync.Map`。

```go
package main

import "fmt"

func main() {
    // 声明并初始化
    scores := map[string]int{
        "Alice": 90,
        "Bob":   85,
    }
    fmt.Println("scores:", scores)

    // 用 make 创建
    ages := make(map[string]int)
    ages["Charlie"] = 22

    // 遍历（顺序随机）
    for key, value := range scores {
        fmt.Printf("  %s -> %d\n", key, value)
    }

    // 判断 key 是否存在
    val, ok := scores["Alice"]
    if ok {
        fmt.Println("Alice 的分数:", val)
    }

    val, ok = scores["David"]
    if !ok {
        fmt.Println("David 不存在")
    }

    // 删除 key
    delete(scores, "Bob")
    fmt.Println("删除 Bob 后:", scores)

    // map 的零值是 nil，nil map 可以读取但不能写入
    var nilMap map[string]int
    fmt.Println("nil map 读取:", nilMap["key"]) // 返回 0
    // nilMap["key"] = 1 // ❌ panic: assignment to entry in nil map
    _ = nilMap
}
```

## 字符串处理

### strings 包常用函数

Go 的字符串是不可变的字节序列（UTF-8 编码）。`strings` 包提供了丰富的操作函数。

```go
package main

import (
    "fmt"
    "strings"
)

func main() {
    s := "Hello, 世界"

    // 长度：返回字节数，不是字符数
    fmt.Println("字节长度:", len(s)) // 13（英文7字节 + 逗号1字节 + 中文5字节）

    // 查找与判断
    fmt.Println("包含 Hello:", strings.Contains(s, "Hello"))       // true
    fmt.Println("前缀:", strings.HasPrefix(s, "Hello"))            // true
    fmt.Println("后缀:", strings.HasSuffix(s, "世界"))              // true
    fmt.Println("索引:", strings.Index(s, ","))                    // 5

    // 分割与拼接
    parts := strings.Split("a,b,c", ",")
    fmt.Println("分割:", parts)                                    // [a b c]
    joined := strings.Join(parts, "-")
    fmt.Println("拼接:", joined)                                   // a-b-c

    // 替换
    fmt.Println(strings.Replace("foo bar foo", "foo", "baz", 1))  // baz bar foo
    fmt.Println(strings.ReplaceAll("foo bar foo", "foo", "baz"))  // baz bar baz

    // 大小写
    fmt.Println(strings.ToUpper("hello"))                          // HELLO
    fmt.Println(strings.ToLower("HELLO"))                          // hello

    // 修剪
    fmt.Println(strings.TrimSpace("  hello  "))                   // "hello"
    fmt.Println(strings.Trim("!!hello!!", "!"))                   // "hello"

    // 重复
    fmt.Println(strings.Repeat("Go", 3))                          // GoGoGo
}
```

### rune 与 byte

Go 中字符串的底层是 `[]byte`，而 `rune` 是 `int32` 的别名，代表一个 Unicode 码点。处理中文等非 ASCII 字符时，必须区分两者。

```go
package main

import (
    "fmt"
    "unicode/utf8"
)

func main() {
    s := "Go语言"

    // byte 遍历：按字节，中文会拆开
    fmt.Println("byte 遍历:")
    for i := 0; i < len(s); i++ {
        fmt.Printf("  s[%d] = %x (%c)\n", i, s[i], s[i])
    }

    // rune 遍历：按字符，每次迭代得到一个 rune
    fmt.Println("rune 遍历:")
    for i, r := range s {
        fmt.Printf("  位置 %d, rune: %c, 值: %U\n", i, r, r)
    }

    // 获取字符数（不是字节数）
    fmt.Println("字节长度:", len(s))                        // 8
    fmt.Println("字符数:", utf8.RuneCountInString(s))       // 4
    fmt.Println("字符数([]rune):", len([]rune(s)))          // 4

    // string 与 []rune 互转
    runes := []rune(s)
    runes[2] = '编'
    newStr := string(runes)
    fmt.Println("替换后:", newStr) // Go编程
}
```

**何时用 rune，何时用 byte：**

| 场景 | 推荐类型 |
|------|----------|
| 处理 ASCII 文本 | `byte` |
| 处理中文、Emoji 等 Unicode | `rune` |
| 需要按字符索引/修改 | 转为 `[]rune` |
| 网络/文件 I/O | `byte`（`[]byte`） |

## 指针基础

Go 保留了指针以提高性能（避免大结构体的拷贝），但去掉了指针运算，避免了很多安全隐患。

```go
package main

import "fmt"

// 值传递：函数操作的是副本
func doubleVal(x int) {
    x *= 2
}

// 指针传递：函数可以修改原始值
func doublePtr(x *int) {
    *x *= 2 // 解引用后修改
}

// 结构体指针
type User struct {
    Name string
    Age  int
}

func updateAge(u *User, newAge int) {
    u.Age = newAge // 不需要 (*u).Age，Go 自动解引用
}

func main() {
    // 取地址 &  解引用 *
    x := 42
    p := &x          // p 是 *int 类型，指向 x
    fmt.Println("地址:", p)
    fmt.Println("值:", *p)  // 解引用，得到 42

    *p = 100         // 通过指针修改原值
    fmt.Println("x =", x)  // 100

    // 值传递 vs 指针传递
    n := 10
    doubleVal(n)
    fmt.Println("doubleVal 后:", n) // 10，未改变

    doublePtr(&n)
    fmt.Println("doublePtr 后:", n) // 20，已改变

    // 结构体指针
    u := User{Name: "Alice", Age: 25}
    updateAge(&u, 26)
    fmt.Printf("更新后: %+v\n", u)

    // 指针的零值是 nil
    var ptr *int
    fmt.Println("nil 指针:", ptr)
    // fmt.Println(*ptr) // ❌ panic: nil pointer dereference

    // new 函数：分配零值内存并返回指针
    q := new(int)
    fmt.Println("new(int):", *q) // 0
    *q = 42
    fmt.Println("赋值后:", *q)
}
```

**Go 指针 vs C 指针：**

| 特性 | Go | C |
|------|----|---|
| 指针运算 | 不支持 | 支持 |
| 指针转换 | 受限（`unsafe` 包） | 自由转换 |
| 空指针 | `nil` | `NULL` |
| 垃圾回收 | 有 | 无 |
| 悬垂指针 | 不会（GC 管理） | 可能 |

## 流程控制

### if 语句

Go 的 `if` 可以带初始化语句，声明的变量作用域限于 `if-else` 块内。

```go
package main

import (
    "fmt"
    "math/rand"
)

func main() {
    // 基本 if
    x := 10
    if x > 5 {
        fmt.Println("x > 5")
    }

    // if 带初始化语句（err 游见模式）
    if err := doSomething(); err != nil {
        fmt.Println("发生错误:", err)
    } else {
        fmt.Println("成功")
    }
    // fmt.Println(err) // ❌ 编译错误：err 超出作用域

    // 常见模式：从 map 取值
    m := map[string]int{"score": 95}
    if val, ok := m["score"]; ok {
        fmt.Println("分数:", val)
    }
}

func doSomething() error {
    if rand.Intn(2) == 0 {
        return fmt.Errorf("随机失败")
    }
    return nil
}
```

### for 循环

Go 只有一个循环关键字 `for`，但它能表达 `while`、`for-each` 等多种形式。`range` 关键字用于遍历切片、map、字符串和通道。

```go
package main

import "fmt"

func main() {
    // 经典三段式 for
    sum := 0
    for i := 1; i <= 10; i++ {
        sum += i
    }
    fmt.Println("1+2+...+10 =", sum)

    // 当作 while 使用
    n := 1
    for n < 100 {
        n *= 2
    }
    fmt.Println("n =", n) // 128

    // 无限循环
    count := 0
    for {
        count++
        if count >= 3 {
            break
        }
    }
    fmt.Println("循环次数:", count)

    // range 遍历切片
    nums := []string{"Go", "Rust", "Python"}
    for i, v := range nums {
        fmt.Printf("  索引 %d: %s\n", i, v)
    }

    // 只需要值，不需要索引
    for _, v := range nums {
        fmt.Println("  语言:", v)
    }

    // 只需要索引
    for i := range nums {
        fmt.Println("  索引:", i)
    }

    // range 遍历 map
    m := map[string]int{"a": 1, "b": 2}
    for k, v := range m {
        fmt.Printf("  %s = %d\n", k, v)
    }

    // range 遍历字符串（按 rune）
    for i, r := range "Go语言" {
        fmt.Printf("  byte 位 %d: %c\n", i, r)
    }
}
```

### switch 语句

Go 的 `switch` 默认每个 case 末尾自带 `break`，不会像 C 那样穿透（fall through）。需要穿透时显式使用 `fallthrough` 关键字。

```go
package main

import (
    "fmt"
    "runtime"
)

func main() {
    // 基本 switch：默认不穿透
    lang := "Go"
    switch lang {
    case "Go":
        fmt.Println("简洁高效")
    case "Rust":
        fmt.Println("安全至上")
    case "Python":
        fmt.Println("快速开发")
    default:
        fmt.Println("其他语言")
    }

    // switch 无条件（替代 if-else 链）
    score := 85
    switch {
    case score >= 90:
        fmt.Println("优秀")
    case score >= 80:
        fmt.Println("良好")
    case score >= 60:
        fmt.Println("及格")
    default:
        fmt.Println("不及格")
    }

    // 多值匹配
    day := "Saturday"
    switch day {
    case "Saturday", "Sunday":
        fmt.Println("周末")
    default:
        fmt.Println("工作日")
    }

    // fallthrough：显式穿透下一个 case
    num := 1
    switch num {
    case 1:
        fmt.Println("一")
        fallthrough
    case 2:
        fmt.Println("二")
        fallthrough
    case 3:
        fmt.Println("三")
    }

    // type switch：根据接口的实际类型分支
    var x interface{} = "hello"
    switch v := x.(type) {
    case string:
        fmt.Printf("字符串: %s (长度 %d)\n", v, len(v))
    case int:
        fmt.Printf("整数: %d\n", v)
    case bool:
        fmt.Printf("布尔: %t\n", v)
    default:
        fmt.Printf("未知类型: %T\n", v)
    }

    // 简单类型判断
    checkType(42)
    checkType(3.14)
    checkType(true)
}

func checkType(v interface{}) {
    switch v.(type) {
    case int:
        fmt.Println("int 类型")
    case float64:
        fmt.Println("float64 类型")
    default:
        fmt.Printf("%T 类型\n", v)
    }
}
```

## defer 机制

`defer` 语句将函数调用推迟到外层函数返回之前执行。多个 defer 按 LIFO（后进先出）顺序执行，类似栈。

```go
package main

import "fmt"

func main() {
    // LIFO 顺序：3 -> 2 -> 1
    defer fmt.Println("第一层 defer")
    defer fmt.Println("第二层 defer")
    defer fmt.Println("第三层 defer")
    fmt.Println("正常执行")
    // 输出：
    // 正常执行
    // 第三层 defer
    // 第二层 defer
    // 第一层 defer

    // defer 参数在声明时就求值
    x := 10
    defer fmt.Println("defer 捕获的 x =", x) // 输出 10
    x = 20
    fmt.Println("修改后的 x =", x) // 输出 20
    // 输出：
    // 修改后的 x = 20
    // defer 捕获的 x = 10

    // 经典用途：关闭资源
    result := readFile()
    fmt.Println("结果:", result)

    // defer 与返回值
    fmt.Println("f() =", f()) // 输出 1（defer 修改了命名返回值）
}

// defer 关闭资源的典型模式
func readFile() string {
    fmt.Println("  打开文件...")
    // 实际场景：file, err := os.Open("data.txt")
    // defer file.Close()
    defer fmt.Println("  关闭文件") // 紧跟资源获取之后
    fmt.Println("  读取数据...")
    return "文件内容"
}

// defer 可以修改命名返回值
func f() (result int) {
    defer func() {
        result++ // 修改命名返回值
    }()
    return 0 // 先赋值 result=0，然后 defer 执行 result++
}
```

**defer 常见用途：**

- 关闭文件：`defer file.Close()`
- 解锁互斥锁：`defer mu.Unlock()`
- 关闭 HTTP 响应体：`defer resp.Body.Close()`
- 配合 `recover` 捕获 panic

## 错误处理

Go 不使用 try-catch 机制，而是通过返回 `error` 接口让调用者显式处理错误。这是 Go 最重要的设计哲学之一。

### error 接口与基本用法

```go
package main

import (
    "errors"
    "fmt"
)

// error 是一个内置接口：type error interface { Error() string }

func divide(a, b float64) (float64, error) {
    if b == 0 {
        return 0, errors.New("除数不能为零")
    }
    return a / b, nil
}

func main() {
    // 基本错误处理
    result, err := divide(10, 3)
    if err != nil {
        fmt.Println("错误:", err)
        return
    }
    fmt.Printf("10 / 3 = %.2f\n", result)

    // 触发错误
    _, err = divide(10, 0)
    if err != nil {
        fmt.Println("错误:", err) // 除数不能为零
    }

    // fmt.Errorf：格式化错误信息
    e := fmt.Errorf("用户 %s 不存在，ID: %d", "Alice", 42)
    fmt.Println(e)

    // %w 动词：包装错误（Go 1.13+）
    original := errors.New("连接超时")
    wrapped := fmt.Errorf("数据库查询失败: %w", original)
    fmt.Println(wrapped)
}
```

### 自定义错误类型

当需要携带更多上下文信息时，可以定义自己的错误类型。

```go
package main

import "fmt"

// 自定义错误类型
type NotFoundError struct {
    Resource string
    ID       int
}

// 实现 error 接口
func (e *NotFoundError) Error() string {
    return fmt.Sprintf("%s (id=%d) 不存在", e.Resource, e.ID)
}

func getUser(id int) (string, error) {
    users := map[int]string{1: "Alice", 2: "Bob"}
    if name, ok := users[id]; ok {
        return name, nil
    }
    return "", &NotFoundError{Resource: "User", ID: id}
}

func main() {
    name, err := getUser(1)
    if err != nil {
        fmt.Println("错误:", err)
    } else {
        fmt.Println("找到用户:", name)
    }

    _, err = getUser(99)
    if err != nil {
        fmt.Println("错误:", err) // User (id=99) 不存在

        // 类型断言获取详细信息
        if nfe, ok := err.(*NotFoundError); ok {
            fmt.Printf("资源: %s, ID: %d\n", nfe.Resource, nfe.ID)
        }
    }
}
```

### errors.Is 与 errors.As（Go 1.13+）

`errors.Is` 用于判断错误链中是否包含特定错误值，`errors.As` 用于判断错误链中是否包含特定类型的错误。它们能正确处理 `%w` 包装的错误链。

```go
package main

import (
    "errors"
    "fmt"
)

// 定义哨兵错误（sentinel error）
var (
    ErrNotFound  = errors.New("资源不存在")
    ErrForbidden = errors.New("无权限访问")
)

func fetchResource(id int) error {
    if id <= 0 {
        return fmt.Errorf("fetchResource(%d): %w", id, ErrNotFound)
    }
    return nil
}

func main() {
    // errors.Is：判断错误链中是否包含特定错误值
    err := fetchResource(-1)
    if errors.Is(err, ErrNotFound) {
        fmt.Println("匹配到 ErrNotFound")
    }
    if !errors.Is(err, ErrForbidden) {
        fmt.Println("不是 ErrForbidden")
    }

    // errors.As：从错误链中提取特定类型的错误
    type TimeoutError struct {
        Duration int
    }
    timeoutErr := &TimeoutError{Duration: 30}
    wrappedErr := fmt.Errorf("请求失败: %w", timeoutErr)

    var te *TimeoutError
    if errors.As(wrappedErr, &te) {
        fmt.Printf("超时错误，时长: %d 秒\n", te.Duration)
    }

    // errors.Unwrap：获取被包装的内层错误
    inner := errors.Unwrap(wrappedErr)
    fmt.Println("内层错误:", inner)
}
```

**错误处理最佳实践：**

| 做法 | 说明 |
|------|------|
| 及时处理错误 | 不要忽略 `_`，至少打印日志 |
| 错误只处理一次 | 不要既 log 又 return 同一个错误 |
| 添加上下文 | 用 `fmt.Errorf("函数名: %w", err)` 包装 |
| 定义哨兵错误 | 包级 `var ErrXXX` 供调用方判断 |
| 自定义错误类型 | 需要携带额外信息时使用 |

## panic 与 recover

`panic` 用于不可恢复的严重错误，会立即中断当前函数并开始逐层退出 goroutine 的调用栈。`recover` 只能在 `defer` 中调用，用于捕获 panic 使程序恢复正常。

```go
package main

import "fmt"

func main() {
    // recover 捕获 panic
    safeCall()

    fmt.Println("程序继续运行") // 正常执行

    // panic 的触发场景
    demonstratePanic()
}

func safeCall() {
    // 必须在 defer 中调用 recover
    defer func() {
        if r := recover(); r != nil {
            fmt.Println("捕获 panic:", r)
        }
    }()

    fmt.Println("即将 panic...")
    panic("发生严重错误")
    // fmt.Println("这行不会执行") // panic 之后的代码不可达
}

func demonstratePanic() {
    // recover 在非 defer 中调用返回 nil
    defer func() {
        if r := recover(); r != nil {
            fmt.Printf("recover 返回值: %v (类型: %T)\n", r, r)
        }
    }()

    // panic 可以传递任意值
    panic(42) // 传递 int
}
```

### panic 与 error 的选择

| 场景 | 推荐 |
|------|------|
| 文件不存在、网络超时 | `error`（可预期的错误） |
| 数组越界、空指针解引用 | `panic`（程序 bug，运行时自动触发） |
| 配置缺失导致程序无法启动 | `panic` / `log.Fatal` |
| 库的初始化失败 | `panic`（在 `init` 或 `MustXxx` 函数中） |
| 用户输入校验失败 | `error` |

```go
package main

import (
    "fmt"
    "regexp"
)

// MustXxx 模式：失败时 panic，用于包初始化场景
func mustParsePattern(pattern string) *regexp.Regexp {
    re, err := regexp.Compile(pattern)
    if err != nil {
        panic(fmt.Sprintf("正则表达式编译失败: %v", err))
    }
    return re
}

// recover 保护 goroutine：防止子 goroutine 的 panic 导致整个程序崩溃
func safeGo(fn func()) {
    go func() {
        defer func() {
            if r := recover(); r != nil {
                fmt.Printf("goroutine panic 已捕获: %v\n", r)
            }
        }()
        fn()
    }()
}

func main() {
    // MustXxx 使用
    re := mustParsePattern(`^\d+$`)
    fmt.Println("匹配数字:", re.MatchString("12345")) // true

    // 安全 goroutine
    safeGo(func() {
        panic("goroutine 中的 panic")
    })

    safeGo(func() {
        fmt.Println("这个 goroutine 正常运行")
    })

    // 给 goroutine 一点时间执行
    select {}
}
```

## 总结

Go 的数据类型和控制流设计遵循"显式优于隐式"的原则：

- **切片和 map** 是最常用的复合类型，理解底层模型（切片头、哈希表）有助于写出高效的代码
- **字符串** 底层是 `[]byte`，处理 Unicode 需要 `rune`
- **指针** 去掉了运算能力，保留了引用语义的实用性
- **流程控制** 极简：`if` 可带初始化语句，`for` 是唯一循环，`switch` 默认不穿透
- **defer** 是资源管理的利器，LIFO 顺序需牢记
- **错误处理** 以 `error` 接口为核心，Go 1.13+ 的 `errors.Is/As` 解决了错误链判断
- **panic/recover** 仅用于不可恢复的场景，日常业务应优先使用 `error`
