---
title: Go 面向对象：结构体、方法与接口
icon: cube
date: 2026-06-13
category:
  - 技术
tag:
  - Go
  - Golang
  - 编程语言
---

# Go 面向对象：结构体、方法与接口

Go 语言没有 class 和 extends 关键字，但它通过结构体（struct）、方法（method）和接口（interface）实现了一套简洁而强大的面向对象编程模型。本文将系统介绍这些核心概念，帮助你建立扎实的 Go OOP 基础。

<!-- more -->

## 结构体定义与初始化

结构体是 Go 中组织数据的基本方式，相当于其他语言中的 class 的数据部分。

### 定义结构体

```go
package main

import "fmt"

// 定义一个 Person 结构体
type Person struct {
    Name string
    Age  int
}

func main() {
    // 方式一：按字段名初始化（推荐）
    p1 := Person{
        Name: "Alice",
        Age:  30,
    }
    fmt.Println(p1) // {Alice 30}

    // 方式二：按字段顺序初始化（不推荐，字段顺序变化时会出问题）
    p2 := Person{"Bob", 25}
    fmt.Println(p2) // {Bob 25}

    // 方式三：使用 new 函数，返回指针，字段为零值
    p3 := new(Person)
    fmt.Println(p3)        // &{ 0}
    fmt.Printf("%T\n", p3) // *main.Person

    // 方式四：取地址初始化
    p4 := &Person{
        Name: "Charlie",
        Age:  35,
    }
    fmt.Println(p4)        // &{Charlie 35}
    fmt.Printf("%T\n", p4) // *main.Person

    // 访问和修改字段（无论是指针还是值，都用点号访问）
    p1.Age = 31
    p4.Age = 36
    fmt.Println(p1.Age, p4.Age) // 31 36
}
```

::: tip 选择哪种方式？
- 日常开发中，**按字段名初始化**最清晰可读，是首选方式。
- 当需要修改结构体且避免值拷贝时，使用**取地址**或 `new` 获得指针。
- 按顺序初始化不建议使用，因为结构体字段调整后容易出错。
:::

## 结构体嵌入（Go 的"继承"）

Go 没有传统意义上的继承，而是通过**结构体嵌入（embedding）**实现代码复用。这本质上是组合（composition），而非继承。

```go
package main

import "fmt"

// 基础结构体
type Animal struct {
    Name string
}

func (a Animal) Speak() string {
    return a.Name + " makes a sound"
}

// 嵌入 Animal，Dog "继承"了 Animal 的字段和方法
type Dog struct {
    Animal // 匿名嵌入，不是字段名: 类型，而是直接写类型
    Breed  string
}

// Dog 可以定义自己的方法
func (d Dog) Fetch(item string) string {
    return d.Name + " fetches " + item
}

// Dog 可以"覆盖"Animal 的方法
func (d Dog) Speak() string {
    return d.Name + " barks"
}

func main() {
    d := Dog{
        Animal: Animal{Name: "Buddy"},
        Breed:  "Golden Retriever",
    }

    // 可以直接访问嵌入结构体的字段
    fmt.Println(d.Name)       // Buddy（等价于 d.Animal.Name）
    fmt.Println(d.Breed)      // Golden Retriever

    // 调用方法
    fmt.Println(d.Speak())    // Buddy barks（Dog 自己的 Speak 覆盖了 Animal 的）
    fmt.Println(d.Fetch("ball")) // Buddy fetches ball

    // 也可以通过嵌入字段显式访问被覆盖的方法
    fmt.Println(d.Animal.Speak()) // Buddy makes a sound
}
```

::: warning 嵌入不是继承
嵌入不会产生 is-a 关系。Dog 嵌入了 Animal，但 Dog 并不是 Animal 的子类型。嵌入只是语法糖，编译器帮你生成了委托调用。Go 社区的理念是：**组合优于继承**。
:::

## 方法定义：值接收者 vs 指针接收者

Go 的方法就是带有**接收者（receiver）**的函数。接收者可以是值类型或指针类型。

```go
package main

import "fmt"

type Counter struct {
    Count int
}

// 值接收者：操作的是副本，不影响原始值
func (c Counter) Value() int {
    return c.Count
}

// 指针接收者：操作的是原始值，可以修改
func (c *Counter) Increment() {
    c.Count++
}

// 指针接收者：可以修改原始值
func (c *Counter) Reset() {
    c.Count = 0
}

func main() {
    c := Counter{Count: 0}

    // 调用指针接收者方法，Go 自动取地址 (&c).Increment()
    c.Increment()
    c.Increment()
    fmt.Println(c.Value()) // 2

    c.Reset()
    fmt.Println(c.Value()) // 0

    // 指针变量同样可以调用值接收者方法
    pc := &Counter{Count: 10}
    fmt.Println(pc.Value()) // 10
}
```

### 如何选择接收者类型？

遵循以下原则：

| 场景 | 接收者类型 |
|------|-----------|
| 需要修改接收者的状态 | **指针接收者** |
| 结构体较大，避免拷贝开销 | **指针接收者** |
| 需要保持一致性（某些方法需要指针） | **指针接收者** |
| 只读操作，结构体很小（如 `time.Time`） | 值接收者 |

::: tip 经验法则
如果拿不准，就用**指针接收者**。同一个类型的方法，尽量统一使用指针接收者或统一使用值接收者，不要混用。
:::

## 接口定义与隐式实现

Go 的接口是**隐式实现**的：只要一个类型实现了接口定义的所有方法，它就自动满足该接口，不需要 `implements` 关键字。这种风格常被称为 **duck typing**。

```go
package main

import "fmt"

// 定义接口
type Shape interface {
    Area() float64
    Perimeter() float64
}

// Circle 实现了 Shape 接口（隐式）
type Circle struct {
    Radius float64
}

func (c Circle) Area() float64 {
    return 3.14159 * c.Radius * c.Radius
}

func (c Circle) Perimeter() float64 {
    return 2 * 3.14159 * c.Radius
}

// Rectangle 也实现了 Shape 接口（隐式）
type Rectangle struct {
    Width, Height float64
}

func (r Rectangle) Area() float64 {
    return r.Width * r.Height
}

func (r Rectangle) Perimeter() float64 {
    return 2 * (r.Width + r.Height)
}

// 接口作为参数：任何实现了 Shape 的类型都可以传入
func PrintShapeInfo(s Shape) {
    fmt.Printf("面积: %.2f, 周长: %.2f\n", s.Area(), s.Perimeter())
}

func main() {
    c := Circle{Radius: 5}
    r := Rectangle{Width: 3, Height: 4}

    PrintShapeInfo(c) // 面积: 78.54, 周长: 31.42
    PrintShapeInfo(r) // 面积: 12.00, 周长: 14.00

    // 接口变量可以持有任何实现了该接口的值
    var shapes []Shape
    shapes = append(shapes, c, r)

    for _, s := range shapes {
        fmt.Printf("类型: %T, 面积: %.2f\n", s, s.Area())
    }
    // 类型: main.Circle, 面积: 78.54
    // 类型: main.Rectangle, 面积: 12.00
}
```

::: info 隐式实现的优势
- 解耦：实现者不需要导入接口定义所在的包。
- 灵活：你可以为第三方包的类型定义接口，而无需修改它的源码。
- 简洁：少了 `implements` 声明，代码更干净。
:::

## 空接口 interface{} 与 any

空接口 `interface{}` 没有任何方法要求，所以**所有类型都满足空接口**。Go 1.18 引入了 `any` 作为 `interface{}` 的类型别名，推荐使用 `any`。

```go
package main

import "fmt"

// any 是 interface{} 的别名（Go 1.18+）
func PrintAnything(v any) {
    fmt.Printf("值: %v, 类型: %T\n", v, v)
}

func main() {
    PrintAnything(42)           // 值: 42, 类型: int
    PrintAnything("hello")      // 值: hello, 类型: string
    PrintAnything(3.14)         // 值: 3.14, 类型: float64
    PrintAnything([]int{1, 2})  // 值: [1 2], 类型: []int
    PrintAnything(nil)          // 值 <nil>, 类型: <nil>

    // any 的常见用途：作为 map 的值类型
    config := map[string]any{
        "host":    "localhost",
        "port":    8080,
        "debug":   true,
        "version": 1.2,
    }
    fmt.Println(config) // map[debug:true host:localhost port:8080 version:1.2]
}
```

::: caution 谨慎使用空接口
`any` 丢失了类型安全，应尽量避免在 API 边界以外的地方使用。优先定义明确的接口，让编译器帮你检查类型。
:::

## 类型断言与类型切换

当你持有接口类型的值并需要访问底层具体类型时，使用**类型断言**或**类型切换（type switch）**。

```go
package main

import "fmt"

func describe(i interface{}) {
    // 类型断言：提取底层具体类型
    // 语法：value, ok := interfaceValue.(ConcreteType)
    if s, ok := i.(string); ok {
        fmt.Printf("这是一个字符串: %q (长度 %d)\n", s, len(s))
        return
    }

    if n, ok := i.(int); ok {
        fmt.Printf("这是一个整数: %d\n", n)
        return
    }

    // 类型切换：更优雅的多类型判断
    switch v := i.(type) {
    case string:
        fmt.Printf("type switch: string = %q\n", v)
    case int:
        fmt.Printf("type switch: int = %d\n", v)
    case bool:
        fmt.Printf("type switch: bool = %t\n", v)
    case []int:
        fmt.Printf("type switch: []int = %v (长度 %d)\n", v, len(v))
    case nil:
        fmt.Println("type switch: nil")
    default:
        fmt.Printf("type switch: 未知类型 %T = %v\n", v, v)
    }
}

func main() {
    describe("hello")        // 这是一个字符串: "hello" (长度 5)
    describe(42)             // 这是一个整数: 42
    describe(true)           // type switch: bool = true
    describe([]int{1, 2, 3}) // type switch: []int = [1 2 3] (长度 3)
    describe(3.14)           // type switch: 未知类型 float64 = 3.14
    describe(nil)            // type switch: nil
}
```

::: warning 类型断言失败会 panic
不使用 `ok` 值的断言如果失败会触发 panic。除非你百分之百确定类型，否则始终使用 `value, ok := i.(Type)` 的安全形式。
:::

## 常用标准库接口

Go 标准库定义了许多小巧而强大的接口，掌握它们是写出惯用 Go 代码的关键。

### fmt.Stringer

`fmt.Stringer` 定义在 `fmt` 包中，类似 Java 的 `toString()`。只要实现 `String() string` 方法，`fmt.Println` 等函数就能自动使用它。

```go
package main

import "fmt"

// fmt.Stringer 接口定义（无需自己定义，由标准库提供）：
// type Stringer interface {
//     String() string
// }

type Student struct {
    Name string
    Age  int
}

// 实现 fmt.Stringer 接口
func (s Student) String() string {
    return fmt.Sprintf("%s (年龄 %d)", s.Name, s.Age)
}

func main() {
    s := Student{Name: "小明", Age: 18}
    fmt.Println(s)             // 小明 (年龄 18)
    fmt.Printf("学生: %v\n", s) // 学生: 小明 (年龄 18)
}
```

### io.Reader 和 io.Writer

`io.Reader` 和 `io.Writer` 是 Go 中最核心的 I/O 接口，几乎所有涉及数据读写的地方都在使用它们。

```go
package main

import (
    "fmt"
    "io"
    "strings"
)

// io.Reader 接口定义：
// type Reader interface {
//     Read(p []byte) (n int, err error)
// }
//
// io.Writer 接口定义：
// type Writer interface {
//     Write(p []byte) (n int, err error)
// }

// 自定义 Reader：将读取内容转为大写
type UpperReader struct {
    src io.Reader
}

func (u *UpperReader) Read(p []byte) (int, error) {
    n, err := u.src.Read(p)
    for i := 0; i < n; i++ {
        if p[i] >= 'a' && p[i] <= 'z' {
            p[i] -= 32
        }
    }
    return n, err
}

func main() {
    // strings.NewReader 实现了 io.Reader
    r := strings.NewReader("hello, world!")

    // 用我们的 UpperReader 包装它
    upper := &UpperReader{src: r}

    // 读取所有内容
    data, err := io.ReadAll(upper)
    if err != nil {
        fmt.Println("读取错误:", err)
        return
    }
    fmt.Println(string(data)) // HELLO, WORLD!
}
```

### error 接口

Go 的错误处理基于一个极简接口：

```go
package main

import (
    "errors"
    "fmt"
)

// error 接口定义（由标准库内置）：
// type error interface {
//     Error() string
// }

// 自定义错误类型
type DivisionError struct {
    Dividend int
    Divisor  int
}

// 实现 error 接口
func (e *DivisionError) Error() string {
    return fmt.Sprintf("不能将 %d 除以 %d（除数不能为零）", e.Dividend, e.Divisor)
}

func divide(a, b int) (int, error) {
    if b == 0 {
        return 0, &DivisionError{Dividend: a, Divisor: b}
    }
    return a / b, nil
}

func main() {
    // 正常情况
    result, err := divide(10, 3)
    if err != nil {
        fmt.Println("错误:", err)
    } else {
        fmt.Printf("10 / 3 = %d\n", result) // 10 / 3 = 3
    }

    // 异常情况
    result, err = divide(5, 0)
    if err != nil {
        fmt.Println("错误:", err) // 错误: 不能将 5 除以 0（除数不能为零）

        // 使用类型断言获取自定义错误类型
        var divErr *DivisionError
        if errors.As(err, &divErr) {
            fmt.Printf("被除数: %d, 除数: %d\n", divErr.Dividend, divErr.Divisor)
        }
    }
}
```

## 组合优于继承

Go 的设计哲学强调**组合优于继承（Composition over Inheritance）**。这体现在：

1. **没有类继承链**：Go 不支持 `class A extends B`，避免了深层次的继承耦合。
2. **接口小而精**：标准库中的接口通常只有 1-2 个方法（如 `io.Reader`、`error`、`fmt.Stringer`），易于实现和组合。
3. **结构体嵌入是组合**：嵌入是"has-a"关系，而非"is-a"关系。
4. **通过接口实现多态**：不需要继承体系，任何类型只要实现接口就能参与多态。

```go
package main

import "fmt"

// 组合模式示例：一个日志系统

// 定义小巧的接口
type Encoder interface {
    Encode(msg string) string
}

type Writer interface {
    Write(data string) error
}

// 组合多个接口形成更大的接口
type Logger interface {
    Encoder
    Writer
    Log(msg string) error
}

// JSON 编码器
type JSONEncoder struct{}

func (j JSONEncoder) Encode(msg string) string {
    return fmt.Sprintf(`{"message": "%s"}`, msg)
}

// 控制台写入器
type ConsoleWriter struct{}

func (c ConsoleWriter) Write(data string) error {
    fmt.Println("[Console]", data)
    return nil
}

// 通过组合构建的日志器
type CompositeLogger struct {
    Encoder
    Writer
}

func (l CompositeLogger) Log(msg string) error {
    encoded := l.Encode(msg)
    return l.Write(encoded)
}

func main() {
    logger := CompositeLogger{
        Encoder: JSONEncoder{},
        Writer:  ConsoleWriter{},
    }

    // logger 满足 Logger 接口
    var l Logger = logger
    _ = l.Log("系统启动") // [Console] {"message": "系统启动"}
    _ = l.Log("服务就绪") // [Console] {"message": "服务就绪"}

    // 可以灵活替换组件
    // 比如换成 XML 编码器或文件写入器，无需修改 Logger 逻辑
}
```

## 泛型基础（Go 1.18+）

Go 1.18 引入了泛型（generics），允许函数和类型使用**类型参数**，在保持类型安全的同时减少重复代码。

### 类型参数

```go
package main

import "fmt"

// 泛型函数：使用类型参数 T
// comparable 是一个内置约束，表示可以使用 == 和 != 比较的类型
func Contains[T comparable](slice []T, target T) bool {
    for _, v := range slice {
        if v == target {
            return true
        }
    }
    return false
}

// 多类型参数
func Map[T any, U any](slice []T, f func(T) U) []U {
    result := make([]U, len(slice))
    for i, v := range slice {
        result[i] = f(v)
    }
    return result
}

func main() {
    // 类型参数可以自动推断
    fmt.Println(Contains([]string{"apple", "banana", "cherry"}, "banana")) // true
    fmt.Println(Contains([]int{1, 2, 3, 4, 5}, 3))                         // true
    fmt.Println(Contains([]int{1, 2, 3}, 99))                              // false

    // Map 函数示例
    nums := []int{1, 2, 3, 4}
    strs := Map(nums, func(n int) string {
        return fmt.Sprintf("num_%d", n)
    })
    fmt.Println(strs) // [num_1 num_2 num_3 num_4]

    // 类型转换
    floats := Map(nums, func(n int) float64 {
        return float64(n) * 1.5
    })
    fmt.Printf("%.2f\n", floats) // [1.50 3.00 4.50 6.00]
}
```

### 自定义约束与 constraints 包

```go
package main

import (
    "fmt"
    "golang.org/x/exp/constraints"
)

// 使用 constraints 包中的内置约束
// Signed  ~int | ~int8 | ~int16 | ~int32 | ~int64
// Unsigned ~uint | ~uint8 | ~uint16 | ~uint32 | ~uint64 | ~uintptr
// Integer = Signed | Unsigned
// Float ~float32 | ~float64
// Ordered = Integer | Float | ~string

func Max[T constraints.Ordered](a, b T) T {
    if a > b {
        return a
    }
    return b
}

func Sum[T constraints.Integer | constraints.Float](nums []T) T {
    var total T
    for _, n := range nums {
        total += n
    }
    return total
}

// 自定义约束：使用接口定义类型集合
type Number interface {
    ~int | ~int8 | ~int16 | ~int32 | ~int64 |
    ~float32 | ~float64
}

// 泛型结构体
type Pair[T Number] struct {
    First  T
    Second T
}

func (p Pair[T]) Sum() T {
    return p.First + p.Second
}

func main() {
    fmt.Println(Max(3, 7))        // 7
    fmt.Println(Max("abc", "xyz")) // xyz
    fmt.Println(Max(3.14, 2.71))  // 3.14

    fmt.Println(Sum([]int{1, 2, 3, 4, 5}))         // 15
    fmt.Println(Sum([]float64{1.1, 2.2, 3.3}))     // 6.6

    p := Pair[float64]{First: 10.5, Second: 20.3}
    fmt.Println(p.Sum()) // 30.8
}
```

::: info 关于 `~` 符号
`~int` 表示底层类型（underlying type）为 `int` 的所有类型。比如 `type MyInt int` 的底层类型是 `int`，使用 `~int` 约束时 `MyInt` 也能满足。
:::

### 泛型与接口结合

```go
package main

import "fmt"

// 定义泛型约束接口
type Stringer interface {
    ~string | ~[]byte
}

// 将任意满足约束的值转为字符串
func Stringify[T Stringer](v T) string {
    return string(v)
}

func main() {
    type MyString string // 底层类型是 string，满足 ~string 约束

    fmt.Println(Stringify("hello"))          // hello
    fmt.Println(Stringify(MyString("world"))) // world
    fmt.Println(Stringify([]byte("bytes")))  // bytes
}
```

## 总结

| 概念 | 要点 |
|------|------|
| **结构体** | Go 中组织数据的基本方式，支持多种初始化方法 |
| **嵌入** | Go 的代码复用机制，是组合而非继承 |
| **方法** | 带接收者的函数，优先使用指针接收者 |
| **接口** | 隐式实现，鸭子类型，小接口优先 |
| **空接口** | `any`（`interface{}`）可持有任意类型，但应谨慎使用 |
| **类型断言** | 从接口值中提取具体类型，注意安全形式 |
| **标准接口** | `fmt.Stringer`、`io.Reader/Writer`、`error` 是核心 |
| **组合** | Go OOP 的核心理念，优于继承 |
| **泛型** | Go 1.18+ 的类型参数，减少重复代码，保持类型安全 |

Go 的面向对象模型摒弃了传统 OOP 的复杂性，用最少的语法特性（结构体 + 方法 + 接口）实现了强大的表达能力。掌握这些概念，你就掌握了 Go 代码组织的核心方式。
