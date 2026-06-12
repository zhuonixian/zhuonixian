---
title: 可观测性开发：Prometheus Exporter 与自定义指标
icon: chart-line
date: 2026-06-13
category:
  - 技术
tag:
  - Go
  - Prometheus
  - 可观测性
  - SRE
---

# 可观测性开发：Prometheus Exporter 与自定义指标

在云原生体系中，Prometheus 已经成为监控领域的事实标准。而真正让监控系统发挥价值的，不是安装 Prometheus 本身，而是你是否拥有**丰富、准确、有业务含义的指标**。本文从 Prometheus 数据模型出发，深入讲解如何使用 Go 客户端库开发自定义 Exporter，为你的应用和业务注入可观测性能力。

<!-- more -->

## Prometheus 监控模型

### Pull 模式

Prometheus 采用 **Pull 模式**采集指标：Prometheus Server 主动向目标服务发起 HTTP 请求，拉取 `/metrics` 端点暴露的指标数据。

```
┌─────────────────┐      HTTP GET /metrics       ┌──────────────┐
│  Prometheus      │ ───────────────────────────→ │  Application  │
│  Server          │ ←─────────────────────────── │  /metrics     │
│                  │   文本格式指标数据             │              │
└─────────────────┘                               └──────────────┘

优势：
- 服务发现：Prometheus 主动发现目标，应用无需配置推送地址
- 健康检查：Pull 失败即表示目标不可用，天然具备健康检测
- 简单调试：curl http://app:8080/metrics 即可查看所有指标
```

与之对比的 Push 模式（如 StatsD、Graphite）由应用主动推送数据，虽然延迟更低，但需要额外管理推送通道和缓冲策略。

### 时间序列数据模型

Prometheus 存储的数据本质是**时间序列（Time Series）**，每条时间序列由以下要素唯一标识：

```
指标名称 + 标签集合（Label Set）= 一条时间序列

示例：
http_request_duration_seconds{method="GET", path="/api/orders", status="200"}
                                    │
                                    └── 每个唯一的标签组合 = 一条独立的时间序列
```

每条时间序列是一组按时间排序的 `(timestamp, value)` 数据点。Prometheus 本地存储采用自定义的 TSDB，支持高效的压缩和查询。

### 四种指标类型

Prometheus 定义了四种核心指标类型，理解它们是设计高质量监控的前提。

#### 1. Counter（计数器）

Counter 只能**单调递增**（除非重启归零），适合累加型数据。

```
适用场景：
- 请求总数
- 错误总数
- 已处理的字节数
- 已完成的任务数

典型查询：
rate(http_requests_total[5m])        → 每 5 分钟的请求速率（QPS）
increase(http_requests_total[1h])    → 过去 1 小时新增请求数
```

#### 2. Gauge（仪表盘）

Gauge 可增可减，反映**当前状态**的瞬时值。

```
适用场景：
- 当前在线连接数
- 内存使用量
- 温度、CPU 使用率
- 队列深度

典型查询：
go_goroutines                          → 当前 goroutine 数量
node_memory_available_bytes             → 可用内存
predict_linear(cpu_temp[1h], 3600)     → 预测 1 小时后的 CPU 温度
```

#### 3. Histogram（直方图）

Histogram 将观测值放入预定义的 **Bucket** 中，用于分析**分布情况**，尤其是延迟的 Percentile。

```
适用场景：
- 请求延迟（P50、P90、P99）
- 响应大小分布
- 批处理任务耗时

Prometheus 会自动生成三个时间序列：
- _bucket{le="0.1"}    → ≤ 0.1s 的请求数
- _bucket{le="0.5"}    → ≤ 0.5s 的请求数
- _sum                  → 所有值的总和
- _count                → 观测总次数

典型查询：
histogram_quantile(0.99, rate(http_request_duration_seconds_bucket[5m]))
→ 计算 P99 延迟
```

#### 4. Summary（摘要）

Summary 在客户端侧计算分位数，减少服务端计算压力，但**不可聚合**。

```
适用场景：
- 单实例场景的分位数计算
- 不需要跨实例聚合的观测值

与 Histogram 的关键区别：
┌───────────────┬────────────────────────┬──────────────────────┐
│               │ Histogram              │ Summary              │
├───────────────┼────────────────────────┼──────────────────────┤
│ 分位数计算     │ 服务端（PromQL）        │ 客户端（应用进程内）  │
│ 可聚合        │ 是                     │ 否                   │
│ 资源消耗      │ 服务端消耗 CPU          │ 客户端消耗 CPU/内存   │
│ 适用场景      │ 多实例聚合分析（推荐）   │ 单实例、无需聚合      │
└───────────────┴────────────────────────┴──────────────────────┘

绝大多数场景推荐使用 Histogram。
```

### 如何选择指标类型

```
数据是只增不减的累加值？        → Counter
数据可以增减、反映当前状态？    → Gauge
需要分析分布 / 分位数？         → Histogram（优先） / Summary（单实例）
```

## Go Prometheus 客户端库

Prometheus 官方提供了 Go 客户端库 `prometheus/client_golang`，它是开发 Exporter 和应用内埋点的基础。

```bash
# 初始化项目
mkdir prometheus-demo && cd prometheus-demo
go mod init prometheus-demo

# 安装依赖
go get github.com/prometheus/client_golang@latest
# v1.20+ 版本支持原生 Histogram（Native Histogram）等新特性
```

核心包结构：

```
github.com/prometheus/client_golang/
├── prometheus
│   ├── promauto        → 自动注册的指标构造器（最常用）
│   ├── promhttp         → HTTP Handler，暴露 /metrics
│   ├── metrics          → 指标接口定义
│   └── collectors       → 内置 Collector（Go 运行时、进程指标等）
└── api                  → Prometheus HTTP API 客户端（用于查询）
```

## 实战 1：为 Go 应用添加指标

### 完整示例：HTTP 服务监控

以下是一个完整的 HTTP 服务，展示了 Counter、Gauge、Histogram 三种指标的实际用法。

```go
// main.go
package main

import (
	"math/rand"
	"net/http"
	"strconv"
	"time"

	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto"
	"github.com/prometheus/client_golang/prometheus/promhttp"
)

// ========== 指标定义 ==========

// httpRequestsTotal: HTTP 请求总数（Counter）
var httpRequestsTotal = promauto.NewCounterVec(
	prometheus.CounterOpts{
		Name: "http_requests_total",
		Help: "Total number of HTTP requests.",
	},
	[]string{"method", "path", "status"},
)

// httpRequestDuration: HTTP 请求延迟（Histogram）
var httpRequestDuration = promauto.NewHistogramVec(
	prometheus.HistogramOpts{
		Name:    "http_request_duration_seconds",
		Help:    "HTTP request duration in seconds.",
		Buckets: prometheus.DefBuckets, // 默认: .005, .01, .025, .05, .1, .25, .5, 1, 2.5, 5, 10
	},
	[]string{"method", "path"},
)

// activeConnections: 当前活跃连接数（Gauge）
var activeConnections = promauto.NewGauge(
	prometheus.GaugeOpts{
		Name: "http_active_connections",
		Help: "Current number of active HTTP connections.",
	},
)

// ordersProcessed: 业务指标 - 已处理订单数（Counter）
var ordersProcessed = promauto.NewCounterVec(
	prometheus.CounterOpts{
		Name: "orders_processed_total",
		Help: "Total number of orders processed.",
	},
	[]string{"status"}, // success, failed
)

// ========== 中间件 ==========

// metricsMiddleware 记录请求延迟和请求计数
func metricsMiddleware(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()

		// 增加活跃连接数
		activeConnections.Inc()
		defer activeConnections.Dec()

		// 包装 ResponseWriter 以捕获状态码
		rw := &responseWriter{ResponseWriter: w, statusCode: http.StatusOK}

		next(rw, r)

		// 记录延迟
		duration := time.Since(start).Seconds()
		httpRequestDuration.WithLabelValues(r.Method, r.URL.Path).Observe(duration)

		// 记录请求数
		httpRequestsTotal.WithLabelValues(
			r.Method,
			r.URL.Path,
			strconv.Itoa(rw.statusCode),
		).Inc()
	}
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

// ========== 业务 Handler ==========

func handleOrders(w http.ResponseWriter, r *http.Request) {
	// 模拟业务逻辑：随机延迟 10ms ~ 200ms
	processingTime := time.Duration(10+rand.Intn(190)) * time.Millisecond
	time.Sleep(processingTime)

	// 模拟 5% 的失败率
	if rand.Float64() < 0.05 {
		ordersProcessed.WithLabelValues("failed").Inc()
		http.Error(w, `{"error": "order processing failed"}`, http.StatusInternalServerError)
		return
	}

	ordersProcessed.WithLabelValues("success").Inc()
	w.Header().Set("Content-Type", "application/json")
	w.Write([]byte(`{"status": "ok", "order_id": "ORD-001"}`))
}

func handleHealth(w http.ResponseWriter, r *http.Request) {
	w.Write([]byte(`{"status": "healthy"}`))
}

// ========== 主函数 ==========

func main() {
	mux := http.NewServeMux()

	// 注册业务路由（使用 metrics 中间件）
	mux.HandleFunc("/api/orders", metricsMiddleware(handleOrders))
	mux.HandleFunc("/health", handleHealth)

	// 注册 /metrics 端点
	mux.Handle("/metrics", promhttp.Handler())

	// 启动服务
	server := &http.Server{
		Addr:         ":8080",
		Handler:      mux,
		ReadTimeout:  10 * time.Second,
		WriteTimeout: 10 * time.Second,
	}

	println("Server listening on :8080")
	println("Metrics available at http://localhost:8080/metrics")

	if err := server.ListenAndServe(); err != nil {
		panic(err)
	}
}
```

### 运行与验证

```bash
# 启动服务
go run main.go

# 另一个终端：模拟流量
for i in $(seq 1 100); do
  curl -s http://localhost:8080/api/orders > /dev/null
done

# 查看指标
curl http://localhost:8080/metrics | grep -E "^(http_|orders_)"

# 输出示例：
# http_requests_total{method="GET",path="/api/orders",status="200"} 95
# http_requests_total{method="GET",path="/api/orders",status="500"} 5
# http_request_duration_seconds_bucket{method="GET",path="/api/orders",le="0.005"} 0
# http_request_duration_seconds_bucket{method="GET",path="/api/orders",le="0.01"} 2
# http_request_duration_seconds_bucket{method="GET",path="/api/orders",le="0.05"} 28
# http_request_duration_seconds_sum 6.234
# http_request_duration_seconds_count 100
# http_active_connections 0
# orders_processed_total{status="success"} 95
# orders_processed_total{status="failed"} 5
```

### promhttp.Handler() 的工作原理

`promhttp.Handler()` 返回一个 `http.Handler`，它会：

1. 调用 `prometheus.DefaultGatherer.Gather()` 收集所有已注册的指标
2. 以 Prometheus 文本格式（`text/plain; version=0.0.4`）输出
3. 自动附带 Go 运行时指标（goroutine 数、GC 统计、内存分配等）

```go
// 如果需要自定义 Registry（而非使用默认的 DefaultRegisterer），可以：
registry := prometheus.NewRegistry()
registry.MustRegister(myCounter)
handler := promhttp.HandlerFor(registry, promhttp.HandlerOpts{
    EnableOpenMetrics: true,  // 支持 OpenMetrics 格式（推荐开启）
    MaxRequestsInFlight: 10,  // 限制并发采集请求
})
```

## 实战 2：开发自定义 Exporter

当需要监控**外部系统**（数据库、消息队列、第三方 API）时，需要开发独立的 Exporter 程序。Exporter 定期采集目标系统的指标，通过 `/metrics` 暴露给 Prometheus。

### Exporter 标准模式

Prometheus 社区约定：Exporter 实现 `prometheus.Collector` 接口。

```go
// Collector 接口定义
type Collector interface {
    // Describe 发送指标描述到 channel（用于指标校验）
    Describe(ch chan<- *Desc)
    // Collect 执行实际采集，发送指标数据到 channel
    Collect(ch chan<- Metric)
}
```

### 完整示例：数据库与业务指标 Exporter

```go
// main.go — 自定义 Exporter
package main

import (
	"database/sql"
	"fmt"
	"log"
	"net/http"
	"time"

	_ "github.com/go-sql-driver/mysql"
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promhttp"
)

// ========== Exporter 定义 ==========

// DatabaseExporter 采集数据库运行指标
type DatabaseExporter struct {
	db *sql.DB

	// 指标定义（在 Describe 中使用）
	connectionsActive    *prometheus.Desc
	connectionsMaxUsed   *prometheus.Desc
	slowQueries          *prometheus.Desc
	queriesTotal         *prometheus.Desc
	threadsRunning       *prometheus.Desc
	connectionErrors     *prometheus.Desc
}

// NewDatabaseExporter 创建 Exporter 实例
func NewDatabaseExporter(db *sql.DB) *DatabaseExporter {
	const (
		namespace   = "mysql"
		subsystem   = ""
		labelServer = "server"
	)

	return &DatabaseExporter{
		db: db,
		connectionsActive: prometheus.NewDesc(
			prometheus.BuildFQName(namespace, subsystem, "connections_active"),
			"Current number of active connections.",
			[]string{labelServer},
			nil,
		),
		connectionsMaxUsed: prometheus.NewDesc(
			prometheus.BuildFQName(namespace, subsystem, "connections_max_used"),
			"Maximum number of connections used since last reset.",
			[]string{labelServer},
			nil,
		),
		slowQueries: prometheus.NewDesc(
			prometheus.BuildFQName(namespace, subsystem, "slow_queries_total"),
			"Total number of slow queries.",
			[]string{labelServer},
			nil,
		),
		queriesTotal: prometheus.NewDesc(
			prometheus.BuildFQName(namespace, subsystem, "queries_total"),
			"Total number of queries executed.",
			[]string{labelServer},
			nil,
		),
		threadsRunning: prometheus.NewDesc(
			prometheus.BuildFQName(namespace, subsystem, "threads_running"),
			"Current number of running threads.",
			[]string{labelServer},
			nil,
		),
		connectionErrors: prometheus.NewDesc(
			prometheus.BuildFQName(namespace, subsystem, "connection_errors_total"),
			"Total number of connection errors.",
			[]string{labelServer, "error_type"},
			nil,
		),
	}
}

// Describe 发送所有指标描述
func (e *DatabaseExporter) Describe(ch chan<- *prometheus.Desc) {
	ch <- e.connectionsActive
	ch <- e.connectionsMaxUsed
	ch <- e.slowQueries
	ch <- e.queriesTotal
	ch <- e.threadsRunning
	ch <- e.connectionErrors
}

// Collect 执行数据库指标采集
func (e *DatabaseExporter) Collect(ch chan<- prometheus.Metric) {
	const serverLabel = "primary"

	// 采集 MySQL STATUS 变量
	queries := []struct {
		desc   *prometheus.Desc
		query  string
		labels []string
	}{
		{e.connectionsActive, "SHOW STATUS LIKE 'Threads_connected'", []string{serverLabel}},
		{e.slowQueries, "SHOW STATUS LIKE 'Slow_queries'", []string{serverLabel}},
		{e.queriesTotal, "SHOW STATUS LIKE 'Queries'", []string{serverLabel}},
		{e.threadsRunning, "SHOW STATUS LIKE 'Threads_running'", []string{serverLabel}},
		{e.connectionsMaxUsed, "SHOW STATUS LIKE 'Max_used_connections'", []string{serverLabel}},
	}

	for _, q := range queries {
		var name string
		var value float64
		err := e.db.QueryRow(q.query).Scan(&name, &value)
		if err != nil {
			log.Printf("query %s failed: %v", q.query, err)
			continue
		}
		ch <- prometheus.MustNewConstMetric(q.desc, prometheus.GaugeValue, value, q.labels...)
	}

	// 采集连接错误数（按错误类型分标签）
	errorTypes := []string{"Connection_errors_accept", "Connection_errors_internal",
		"Connection_errors_max_connections", "Connection_errors_peer_address",
		"Connection_errors_select", "Connection_errors_tcpwrap"}

	for _, errorType := range errorTypes {
		var name string
		var value float64
		query := fmt.Sprintf("SHOW STATUS LIKE '%s'", errorType)
		err := e.db.QueryRow(query).Scan(&name, &value)
		if err != nil {
			continue
		}
		ch <- prometheus.MustNewConstMetric(
			e.connectionErrors,
			prometheus.CounterValue,
			value,
			serverLabel, errorType,
		)
	}
}

// ========== 业务指标 Exporter ==========

// BusinessExporter 采集业务指标（订单量、支付成功率等）
type BusinessExporter struct {
	db *sql.DB

	ordersTotal       *prometheus.Desc
	orderAmount       *prometheus.Desc
	paymentSuccess    *prometheus.Desc
	paymentTotal      *prometheus.Desc
	orderDuration     *prometheus.Desc
}

// NewBusinessExporter 创建业务指标 Exporter
func NewBusinessExporter(db *sql.DB) *BusinessExporter {
	return &BusinessExporter{
		db: db,
		ordersTotal: prometheus.NewDesc(
			"business_orders_total",
			"Total number of orders.",
			[]string{"status"}, // pending, completed, cancelled
			nil,
		),
		orderAmount: prometheus.NewDesc(
			"business_order_amount_total",
			"Total amount of orders in yuan.",
			[]string{"status"},
			nil,
		),
		paymentSuccess: prometheus.NewDesc(
			"business_payment_success_total",
			"Total number of successful payments.",
			[]string{"channel"}, // alipay, wechat, credit_card
			nil,
		),
		paymentTotal: prometheus.NewDesc(
			"business_payment_total",
			"Total number of payment attempts.",
			[]string{"channel"},
			nil,
		),
		orderDuration: prometheus.NewDesc(
			"business_order_processing_duration_seconds",
			"Average order processing duration in seconds.",
			nil,
			nil,
		),
	}
}

// Describe 发送所有业务指标描述
func (e *BusinessExporter) Describe(ch chan<- *prometheus.Desc) {
	ch <- e.ordersTotal
	ch <- e.orderAmount
	ch <- e.paymentSuccess
	ch <- e.paymentTotal
	ch <- e.orderDuration
}

// Collect 执行业务指标采集
func (e *BusinessExporter) Collect(ch chan<- prometheus.Metric) {
	// 订单统计（按状态分组）
	statuses := []string{"pending", "completed", "cancelled"}
	for _, status := range statuses {
		var count float64
		var amount float64
		err := e.db.QueryRow(
			"SELECT COUNT(*), COALESCE(SUM(amount), 0) FROM orders WHERE status = ?",
			status,
		).Scan(&count, &amount)
		if err != nil {
			log.Printf("query orders (status=%s) failed: %v", status, err)
			continue
		}
		ch <- prometheus.MustNewConstMetric(e.ordersTotal, prometheus.GaugeValue, count, status)
		ch <- prometheus.MustNewConstMetric(e.orderAmount, prometheus.GaugeValue, amount, status)
	}

	// 支付统计（按渠道分组）
	channels := []string{"alipay", "wechat", "credit_card"}
	for _, channel := range channels {
		var total float64
		var success float64
		err := e.db.QueryRow(
			"SELECT COUNT(*), SUM(CASE WHEN status='success' THEN 1 ELSE 0 END) FROM payments WHERE channel = ?",
			channel,
		).Scan(&total, &success)
		if err != nil {
			log.Printf("query payments (channel=%s) failed: %v", channel, err)
			continue
		}
		ch <- prometheus.MustNewConstMetric(e.paymentTotal, prometheus.CounterValue, total, channel)
		ch <- prometheus.MustNewConstMetric(e.paymentSuccess, prometheus.CounterValue, success, channel)
	}

	// 订单处理平均耗时
	var avgDuration float64
	err := e.db.QueryRow(
		"SELECT COALESCE(AVG(TIMESTAMPDIFF(SECOND, created_at, completed_at)), 0) FROM orders WHERE status = 'completed' AND completed_at >= DATE_SUB(NOW(), INTERVAL 1 HOUR)",
	).Scan(&avgDuration)
	if err != nil {
		log.Printf("query order duration failed: %v", err)
	} else {
		ch <- prometheus.MustNewConstMetric(e.orderDuration, prometheus.GaugeValue, avgDuration)
	}
}

// ========== 主函数 ==========

func main() {
	// 连接数据库
	dsn := "exporter_user:exporter_pass@tcp(127.0.0.1:3306)/business_db"
	db, err := sql.Open("mysql", dsn)
	if err != nil {
		log.Fatalf("failed to connect to MySQL: %v", err)
	}
	defer db.Close()

	// 配置连接池
	db.SetMaxOpenConns(5)
	db.SetMaxIdleConns(2)
	db.SetConnMaxLifetime(5 * time.Minute)

	// 验证连接
	if err := db.Ping(); err != nil {
		log.Fatalf("MySQL ping failed: %v", err)
	}
	log.Println("Connected to MySQL")

	// 创建自定义 Registry
	registry := prometheus.NewRegistry()

	// 注册 Exporter
	registry.MustRegister(NewDatabaseExporter(db))
	registry.MustRegister(NewBusinessExporter(db))

	// 注册 Go 运行时和进程指标
	registry.MustRegister(prometheus.NewGoCollector())
	registry.MustRegister(prometheus.NewProcessCollector(prometheus.ProcessCollectorOpts{}))

	// 启动 HTTP 服务
	mux := http.NewServeMux()
	mux.Handle("/metrics", promhttp.HandlerFor(registry, promhttp.HandlerOpts{
		EnableOpenMetrics:   true,
		MaxRequestsInFlight: 5,
		Timeout:             10 * time.Second,
	}))
	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		if err := db.Ping(); err != nil {
			http.Error(w, "database unreachable", http.StatusServiceUnavailable)
			return
		}
		w.Write([]byte("ok"))
	})

	log.Println("Exporter listening on :9104")
	log.Println("Metrics available at http://localhost:9104/metrics")

	server := &http.Server{
		Addr:         ":9104",
		Handler:      mux,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
	}
	log.Fatal(server.ListenAndServe())
}
```

### Exporter 的最佳实践

```
1. 使用 prometheus.BuildFQName() 构造指标名
   → prometheus.BuildFQName("mysql", "", "connections_active")
   → 生成：mysql_connections_active

2. 采集超时控制
   → Collect 方法中必须有超时机制，避免阻塞 Prometheus 采集

3. 采集失败处理
   → 单个指标采集失败不应影响其他指标
   → 使用 log.Printf 记录错误，继续采集其余指标

4. 使用独立 Registry
   → 使用 prometheus.NewRegistry() 创建独立 Registry
   → 避免与默认 Registry 的指标冲突

5. Exporter 自身监控
   → 暴露Exporter 自身的采集耗时和错误数
   → promhttp.HandlerOpts 内置了这些指标
```

## 指标命名规范

Prometheus 社区有一套严格的命名规范，遵循规范可以让指标易于理解和复用。

### 命名格式

```
规则：namespace_subsystem_name_unit

示例：
http_request_duration_seconds          → 命名空间_子系统_名称_单位
mysql_connections_active               → 命名空间_名称
business_payment_success_total         → 命名空间_名称_后缀
node_cpu_seconds_total                 → 命名空间_子系统_单位_后缀
```

### 关键规则

| 规则 | 正确示例 | 错误示例 |
|------|----------|----------|
| 使用小写蛇形命名 | `http_requests_total` | `httpRequestsTotal` |
| Counter 必须以 `_total` 结尾 | `orders_total` | `orders_count` |
| 包含单位后缀 | `_seconds`, `_bytes`, `_bytes_total` | 不带单位的 `_size` |
| 使用标准单位名 | `_seconds`（而非 `_duration`） | `_ms`, `_milliseconds` |
| Gauge 不加 `_total` | `temperature_celsius` | `temperature_total` |
| 避免将目标名放入指标名 | `http_requests_total{target="api"}` | `http_api_requests_total` |

### 常用单位后缀

| 单位 | 后缀 | 适用指标类型 |
|------|------|-------------|
| 秒 | `_seconds` | Histogram、Summary（延迟、耗时） |
| 字节 | `_bytes` | Gauge（内存、磁盘） |
| 字节/秒 | `_bytes_total` | Counter（网络吞吐） |
| 比率 | `_ratio` | Gauge（0~1 之间的比例） |
| 百分比 | `_percent` | Gauge（0~100） |
| 无单位 | 无后缀 | Counter（计数）、Gauge（计数） |

## 标签设计

标签（Labels）是 Prometheus 的核心特性，但设计不当会导致严重的性能问题。

### 标签的正确用途

```go
// 正确：使用标签区分不同维度
httpRequestsTotal := promauto.NewCounterVec(
    prometheus.CounterOpts{
        Name: "http_requests_total",
    },
    []string{"method", "path", "status"},
)

// 查询时可以灵活聚合：
// rate(http_requests_total[5m])                          → 总 QPS
// sum by (status) (rate(http_requests_total[5m]))        → 按状态码聚合
// sum by (path) (rate(http_requests_total{status="200"}[5m]))  → 按路径聚合
```

### 高基数问题（The Cardinality Bomb）

每对标签的唯一组合都会创建一条新的时间序列。如果某个标签的取值范围很大，时间序列数会爆炸式增长。

```
高基数标签示例（危险！）：
- user_id     → 百万级用户 = 百万条时间序列
- request_id  → 每次请求唯一 = 无限增长
- ip_address  → 数十万 IP
- email       → 百万级邮箱
- query_sql   → 不同的 SQL 组合 = 不可控

安全的低基数标签：
- method      → GET, POST, PUT, DELETE      (~10)
- status      → 200, 301, 404, 500           (~10)
- datacenter  → bj-1, bj-2, sh-1            (~5)
- instance    → 可控数量的服务实例            (~100)
- service     → 可控数量的微服务名称          (~50)
```

### 基数控制策略

```go
// 策略 1：将高基数值映射为有限分类
// 不要记录精确延迟值，用 Bucket 分桶（Histogram 的设计思想）
httpRequestDuration.WithLabelValues("GET", "/api/orders").Observe(0.123)

// 策略 2：对 path 做归一化，避免 /api/orders/12345 变成不同标签
func normalizePath(path string) string {
    // /api/orders/12345 → /api/orders/:id
    // /api/users/abc    → /api/users/:id
    parts := strings.Split(path, "/")
    for i, p := range parts {
        if isID(p) {
            parts[i] = ":id"
        }
    }
    return strings.Join(parts, "/")
}

// 策略 3：限制标签值数量
// 如果必须使用动态标签，设置上限
const maxLabelValues = 100

// 策略 4：使用 relabeling 在 Prometheus 侧丢弃高基数标签
// prometheus.yml
// metric_relabel_configs:
//   - source_labels: [path]
//     regex: '/api/.*'
//     action: drop
```

### 检查时间序列基数

```promql
# 查询指标的时间序列数量
count(http_request_duration_seconds_bucket)

# 查询所有指标的总时间序列数
count({__name__=~".+"})

# 找出基数最高的指标
topk(10, count by (__name__) ({__name__=~".+"}))
```

## Grafana 面板设计

Grafana 是 Prometheus 最常用的可视化工具。好的面板设计能让团队快速定位问题。

### 关键面板设计原则

```
1. 自顶向下分层：
   SLI 概览 → 服务级指标 → 实例级指标 → 详细指标

2. 每个面板一个核心问题：
   "服务是否正常？" → 可用性面板（成功率）
   "延迟是否可接受？" → P50/P90/P99 延迟面板
   "容量是否充足？" → 资源使用率面板

3. 使用变量（Variables）实现多维度切换：
   $service, $instance, $datacenter
```

### 常用 PromQL 查询

```promql
# === 流量 ===
# 请求速率（QPS）
sum by (service) (rate(http_requests_total[5m]))

# === 延迟 ===
# P99 延迟
histogram_quantile(0.99,
  sum by (le, service) (rate(http_request_duration_seconds_bucket[5m]))
)

# P50 / P90 / P99 多分位数
histogram_quantile(0.50, sum by (le) (rate(http_request_duration_seconds_bucket[5m])))  # P50
histogram_quantile(0.90, sum by (le) (rate(http_request_duration_seconds_bucket[5m])))  # P90
histogram_quantile(0.99, sum by (le) (rate(http_request_duration_seconds_bucket[5m])))  # P99

# === 错误率 ===
# HTTP 错误率（5xx 占比）
sum by (service) (rate(http_requests_total{status=~"5.."}[5m]))
/
sum by (service) (rate(http_requests_total[5m]))

# === 饱和度 ===
# 连接池使用率
mysql_connections_active / mysql_connections_max_used * 100

# === 业务指标 ===
# 订单支付成功率
sum(rate(business_payment_success_total[1h]))
/
sum(rate(business_payment_total[1h])) * 100

# 订单处理耗时趋势
business_order_processing_duration_seconds
```

### RED 方法（Request-Error-Duration）

针对每个服务的三个核心维度设计面板：

```
┌─────────────────────────────────────────────────────────────┐
│                    Service Dashboard: order-service          │
├─────────────────────┬────────────────────┬──────────────────┤
│   Rate（流量）       │  Errors（错误率）   │ Duration（延迟）  │
│                     │                    │                  │
│   ┌──────────┐     │   ┌──────────┐    │   ┌──────────┐   │
│   │ ▁▂▃▄▅▆▇ │     │   │ ▁▁▁▂▁▁▁  │    │   │ ▃▃▂▂▃▄▃  │   │
│   │ QPS: 1.2k│     │   │ 0.5%     │    │   │ P99: 120ms│  │
│   └──────────┘     │   └──────────┘    │   └──────────┘   │
│   sum(rate(...))   │   5xx / total     │  histogram_      │
│                    │                    │  quantile(0.99)  │
├─────────────────────┴────────────────────┴──────────────────┤
│                      Saturation（饱和度）                    │
│   ┌──────────────────────────────────────────────────────┐  │
│   │ 连接池使用率 45%  │  CPU 32%  │  内存 61%             │  │
│   └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

## 告警规则

基于 Prometheus 指标的告警是通过 Prometheus Alertmanager 实现的。告警规则定义在 Prometheus 配置中。

### 告警规则配置

```yaml
# alert_rules.yml
groups:
  # === 基础设施告警 ===
  - name: infrastructure alerts
    rules:
      # 服务可用性告警
      - alert: ServiceDown
        expr: up == 0
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "Service {{ $labels.instance }} is down"
          runbook: "https://wiki.internal/runbook/service-down"

      # 高错误率告警
      - alert: HighErrorRate
        expr: |
          sum by (service) (rate(http_requests_total{status=~"5.."}[5m]))
          /
          sum by (service) (rate(http_requests_total[5m]))
          > 0.05
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "Service {{ $labels.service }} error rate is {{ $value | humanizePercentage }}"
          description: "5xx 错误率超过 5%，持续 5 分钟"

      # P99 延迟告警
      - alert: HighLatencyP99
        expr: |
          histogram_quantile(0.99,
            sum by (le, service) (rate(http_request_duration_seconds_bucket[5m]))
          ) > 1.0
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "Service {{ $labels.service }} P99 latency is {{ $value }}s"
          description: "P99 延迟超过 1 秒，持续 5 分钟"

  # === 数据库告警 ===
  - name: database alerts
    rules:
      # MySQL 连接数告警
      - alert: MySQLTooManyConnections
        expr: mysql_connections_active / mysql_connections_max_used > 0.8
        for: 3m
        labels:
          severity: warning
        annotations:
          summary: "MySQL server {{ $labels.server }} connection usage is {{ $value | humanizePercentage }}"
          description: "连接数使用率超过 80%"

      # MySQL 慢查询激增
      - alert: MySQLSlowQueriesIncreasing
        expr: increase(mysql_slow_queries_total[5m]) > 100
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "MySQL slow queries increased by {{ $value }} in 5 minutes"

  # === 业务告警 ===
  - name: business alerts
    rules:
      # 支付成功率下降
      - alert: PaymentSuccessRateLow
        expr: |
          sum(rate(business_payment_success_total[10m]))
          /
          sum(rate(business_payment_total[10m]))
          < 0.95
        for: 5m
        labels:
          severity: critical
          team: payment
        annotations:
          summary: "Payment success rate dropped to {{ $value | humanizePercentage }}"
          description: "支付成功率低于 95%，请立即排查"

      # 订单处理耗时过长
      - alert: OrderProcessingSlow
        expr: business_order_processing_duration_seconds > 30
        for: 10m
        labels:
          severity: warning
          team: order
        annotations:
          summary: "Order processing takes {{ $value }}s on average"
          description: "订单平均处理耗时超过 30 秒"
```

### 告警设计原则

```
1. 分级告警（Severity）
   - critical：需要立即处理（P0/P1），如服务宕机、支付失败
   - warning：需要关注但不紧急（P2/P3），如延迟升高、磁盘空间不足
   - info：仅记录通知，如配置变更、部署完成

2. 设置合理的 for 持续时间
   - 避免瞬时抖动触发告警
   - 关键指标（如 up）：for: 1m
   - 性能指标（如延迟）：for: 5m
   - 趋势指标（如磁盘空间）：for: 15m

3. 告警内容要有可操作性
   - 包含当前值：{{ $value }}
   - 包含上下文：{{ $labels.service }}
   - 指向 Runbook：提供排查步骤链接

4. 控制告警数量
   - 合理聚合：sum by (service) 而非逐实例告警
   - 抑制规则：P0 告警抑制同服务的 P2 告警
   - 静默窗口：维护期间静默相关告警
```

### Prometheus 配置集成

```yaml
# prometheus.yml
global:
  scrape_interval: 15s
  evaluation_interval: 15s

# 告警规则文件
rule_files:
  - "alert_rules.yml"

# Alertmanager 配置
alerting:
  alertmanagers:
    - static_configs:
        - targets: ["alertmanager:9093"]

# 采集目标
scrape_configs:
  # 应用指标
  - job_name: "order-service"
    metrics_path: /metrics
    static_configs:
      - targets: ["order-service:8080"]
        labels:
          service: order-service
          env: production

  # 自定义 Exporter
  - job_name: "mysql-exporter"
    scrape_interval: 30s
    scrape_timeout: 15s
    static_configs:
      - targets: ["mysql-exporter:9104"]
        labels:
          service: mysql
          env: production
```

## 总结

构建完善的可观测性体系，核心在于**指标设计**而非工具选型。以下是本文的核心要点：

```
1. 指标类型选择
   累加值 → Counter | 瞬时值 → Gauge | 分布 → Histogram

2. 开发模式
   应用内埋点 → 使用 promauto 包（简洁）
   外部系统采集 → 实现 Collector 接口（标准）

3. 命名规范
   namespace_subsystem_name_unit，Counter 以 _total 结尾

4. 标签设计
   低基数标签（≤100 个值），避免 user_id、request_id 等高基数标签

5. 告警设计
   RED 方法（Rate-Error-Duration）+ 分级告警 + 可操作内容
```

当你需要为一个新的服务或系统添加监控时，建议的落地步骤：

1. 确定 SLI（可用性、延迟、吞吐量）
2. 为每个 SLI 设计对应的 Prometheus 指标
3. 使用 Histogram 覆盖延迟分布，Counter 覆盖请求和错误计数
4. 在 Grafana 中创建 RED 面板
5. 配置告警规则，并编写对应的 Runbook

可观测性不是一个项目，而是一个持续演进的过程。从核心指标开始，逐步丰富，让数据驱动你的运维决策。
