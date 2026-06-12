---
title: ClickHouse 生产运维实战
icon: chart-column
date: 2026-06-13
category:
  - 技术
tag:
  - ClickHouse
  - 列式数据库
  - 数据分析
  - 运维
---

# ClickHouse 生产运维实战

ClickHouse 是由 Yandex 开源的列式分析数据库，专为 OLAP 场景设计，能在 PB 级数据上实现亚秒级查询响应。凭借极致的向量化执行引擎和高效的压缩算法，ClickHouse 已成为实时数仓、日志分析、业务报表等场景的首选方案。然而，其独特的 Part 合并机制、对 ZooKeeper 的强依赖、以及内存敏感等特性，在生产运维中埋下了不少坑。本文从架构选型、建表实践、日常维护、故障排查到 K8s 部署，系统梳理 ClickHouse 生产运维的关键要点。

<!-- more -->

## ClickHouse 简介

ClickHouse 是一个开源的列式关系型数据库管理系统（DBMS），面向在线分析处理（OLAP）场景。与传统行式数据库不同，ClickHouse 按列存储数据，查询时只读取需要的列，大幅减少磁盘 I/O。结合向量化执行、主键索引、数据压缩等技术，ClickHouse 在海量数据聚合查询上表现出色。

核心优势：

- **极致性能**：单机每秒处理数十亿行数据，聚合查询通常在百毫秒内完成
- **高压缩比**：列存 + 专用编解码器（LZ4、ZSTD、Delta 等），典型压缩比 5:1 到 10:1
- **线性扩展**：通过分片（Shard）水平扩展写入和存储能力，通过副本（Replica）保证高可用
- **丰富的表引擎**：MergeTree 家族覆盖日志、去重、预聚合等不同场景
- **SQL 兼容**：支持标准 SQL 语法，学习成本低

适用场景：日志分析、用户行为分析、实时大屏、监控指标存储、广告投放分析。不适用场景：高频事务写入（OLTP）、复杂的 JOIN 操作、需要精确更新/删除的场景。

## 核心概念

| 概念 | 说明 |
|------|------|
| **MergeTree** | 最核心的表引擎家族，数据按排序键存储，后台自动合并数据 Part |
| **Part（数据部分）** | 每次 INSERT 生成一个新的 Part，后台 merge 线程持续合并小 Part 为大 Part |
| **ReplicatedMergeTree** | 副本引擎，通过 ZooKeeper / ClickHouse Keeper 协调多副本间的数据同步 |
| **Distributed** | 分布式表引擎，作为查询入口将请求路由到各分片并聚合结果 |
| **MaterializedView** | 物化视图，数据写入时自动触发聚合计算并存储结果，常用于预计算 |

理解 Part 的生命周期是 ClickHouse 运维的基础。一次 INSERT 操作会生成至少一个 Part。后台 merge 线程不断将小 Part 合并为大 Part，以减少文件数量、提升查询效率。如果 Part 积累过多（单表超过 300 就需要关注），查询性能会急剧下降。

## 架构选择

```
方案一：单机（开发测试 / 小规模）
+---------------------+
|  ClickHouse Server  |
|  MergeTree 表引擎    |
+---------------------+

方案二：集群（生产推荐）
+-- Shard 1 --------------------------------+
|  +-- Replica 1 --+  +-- Replica 2 --+     |
|  | CH Server     |  | CH Server     |     |
|  | Keeper / ZK   |  | Keeper / ZK   |     |
|  +---------------+  +---------------+     |
+-------------------------------------------+
+-- Shard 2 --------------------------------+
|  +-- Replica 1 --+  +-- Replica 2 --+     |
|  +---------------+  +---------------+     |
+-------------------------------------------+

查询入口：
+-------------------+
| Distributed 表    |
| 路由到各 Shard    |
| 聚合结果返回      |
+-------------------+
```

架构选择建议：

| 架构 | 适用场景 | 数据规模 | 高可用 |
|------|----------|----------|--------|
| **单机** | 开发测试、内部工具 | < 1 TB | 无 |
| **单分片双副本** | 中小规模生产 | 1-10 TB | 有 |
| **多分片多副本** | 大规模生产 | 10 TB - PB | 有 |

### ClickHouse Keeper 替代 ZooKeeper

传统方案依赖 Apache ZooKeeper 管理副本元数据和分布式协调。ClickHouse Keeper 是官方提供的替代方案，使用 Rust 编写，内置在 ClickHouse 中，无需单独部署。

Keeper 相比 ZooKeeper 的优势：

- **部署简单**：内嵌于 ClickHouse，无需独立集群
- **性能更好**：Rust 实现，内存占用更低，吞吐更高
- **兼容协议**：支持 ZooKeeper 客户端协议，迁移成本几乎为零
- **运维统一**：与 ClickHouse 共用监控和日志体系

新部署建议直接使用 ClickHouse Keeper。已有 ZooKeeper 的环境可以通过配置 `zookeeper` 节点无缝迁移。

## 版本与表引擎

### 版本演进

| 版本 | 发布时间 | 定位 | 关键特性 |
|------|----------|------|----------|
| **24.8 LTS** | 2024-08 | 长期支持版 | 推荐生产使用，稳定可靠 |
| **24.3 LTS** | 2024-03 | 上一 LTS | 仍在维护期 |
| **25.x** | 2025 | 最新功能版 | 实验特性、新引擎，开发测试用 |

生产环境务必选择 LTS 版本。ClickHouse 的 fast release 节奏很快（每月一个 minor 版本），但只有标记为 LTS 的版本才提供长期安全修复。

### 表引擎选择指南

| 引擎 | 场景 | 特点 | 注意事项 |
|------|------|------|----------|
| **MergeTree** | 时序、日志、事件流 | 默认引擎，按主键排序存储 | 最通用，大多数场景首选 |
| **ReplacingMergeTree** | 需要去重的维度表 | 后台合并时按排序键去重，保留最新版本 | 去重发生在 merge 时，查询前可能有重复数据 |
| **SummingMergeTree** | 数值预聚合 | 自动对数值列求和合并 | 适合指标汇总，不需要明细 |
| **AggregatingMergeTree** | 复杂聚合状态 | 存储聚合函数的中间状态 | 配合 MaterializedView 使用 |
| **CollapsingMergeTree** | 正负行抵消 | 通过 sign 列标记插入和删除 | 适合频繁更新场景 |

选型原则：能用 MergeTree 就用 MergeTree。只有当数据有明确的去重、聚合需求时才考虑其他引擎。ReplacingMergeTree 的去重是最终一致性的，不能保证实时去重。

## 生产建表

### 日志分析表完整 DDL

```sql
-- 本地表（每个节点都要创建）
CREATE TABLE access_logs
(
    timestamp       DateTime64(3),
    level           LowCardinality(String),       -- 低基数优化：日志级别只有几种
    service         LowCardinality(String),       -- 低基数优化：服务名有限
    host            LowCardinality(String),
    message         String,
    trace_id        String,
    duration_ms     UInt32,
    status_code     UInt16,
    request_path    String,
    user_id         Nullable(String),
    request_body    String DEFAULT '',
    response_code   UInt16 DEFAULT 0,
    tags            Map(String, String) DEFAULT Map()  -- 动态标签
)
ENGINE = MergeTree()
PARTITION BY toYYYYMM(timestamp)          -- 按月分区，便于按月删除
ORDER BY (service, timestamp)             -- 排序键决定查询性能
TTL timestamp + INTERVAL 90 DAY           -- 90 天自动过期清理
SETTINGS
    index_granularity = 8192,             -- 索引粒度（默认值，一般不调整）
    min_bytes_for_wide_part = '10M',      -- 小于 10MB 用紧凑格式，大于用宽格式
    min_rows_for_wide_part = 100000;      -- 行数阈值

-- 分布式表（集群查询入口）
CREATE TABLE access_logs_all ON CLUSTER '{cluster}'
AS access_logs
ENGINE = Distributed(
    '{cluster}',
    currentDatabase(),
    'access_logs',
    rand()                                -- 随机分片写入
);
```

### 分区策略

分区粒度直接影响查询性能和运维效率：

| 分区策略 | DDL | 适用场景 | 注意事项 |
|----------|-----|----------|----------|
| 按月 | `toYYYYMM(ts)` | 日志、事件（保留数月） | 推荐，每月一个分区 |
| 按天 | `toYYYYMMDD(ts)` | 高吞吐、按天查询 | 分区数增长快，需及时清理 |
| 按小时 | `toStartOfHour(ts)` | 短期热数据 | 仅适合短期保留 |
| 不分区 | 无 PARTITION BY | 小表、维度表 | 数据量小时可以不分 |

分区设计要点：ClickHouse 的分区是物理隔离的目录，查询时通过分区裁剪跳过不相关分区。但分区过多会增加 Part 总数，加重 merge 压力。一般保持单表活跃分区数不超过 100 个。

### 排序键设计

排序键（ORDER BY）是 ClickHouse 性能的命脉。数据按排序键物理有序存储，查询时可以利用排序快速定位数据范围。

设计原则：

- **高频过滤条件放前面**：最常用的 WHERE 条件列排在最左边
- **基数由低到高**：低基数列在前，高基数列在后
- **不要放太多列**：一般 2-4 列，过多会增加排序开销
- **避免高频更新的列**：排序键决定物理顺序，更新代价高

```sql
-- 好的设计：按服务名 + 时间排序
-- 查询 WHERE service = 'order-api' AND timestamp > now() - INTERVAL 1 HOUR
-- 可以直接定位到 service 范围内的 timestamp 区间
ORDER BY (service, timestamp)

-- 不好的设计：把高基数列放前面
-- user_id 基数极高，按它排序会使得同一 service 的数据分散
ORDER BY (user_id, timestamp)
```

### LowCardinality 优化

`LowCardinality` 类型对基数小于 10 万的字符串列使用字典编码，能减少 5-10 倍存储空间并加速查询。适用于枚举值、状态码、服务名等列。

但 LowCardinality 不适合高基数列（如 UUID、随机字符串），字典过大会适得其反。对于不确定基数的列，可以先用 String，观察一段时间后再决定是否加 LowCardinality。

## 核心维护操作

### Part 管理

```sql
-- 查看各表 Part 概况（关键运维指标）
SELECT
    table,
    count() AS part_count,
    sum(rows) AS total_rows,
    formatReadableSize(sum(bytes_on_disk)) AS total_size
FROM system.parts
WHERE active
GROUP BY table
ORDER BY part_count DESC;

-- 查看 Part 大小分布
SELECT
    table,
    count() AS parts,
    formatReadableSize(min(bytes_on_disk)) AS min_part,
    formatReadableSize(avg(bytes_on_disk)) AS avg_part,
    formatReadableSize(max(bytes_on_disk)) AS max_part
FROM system.parts
WHERE active
GROUP BY table;

-- 检查 Part 合并异常
SELECT database, table, part, reason
FROM system.part_log
WHERE event_type = 'MergeAttempt' AND success = 0
ORDER BY event_date DESC
LIMIT 20;

-- 手动触发合并（谨慎使用，会消耗大量 I/O）
OPTIMIZE TABLE access_logs FINAL;
```

**真实踩坑案例：** 某服务以每秒 100 次的频率写入 ClickHouse，每次仅 10 条记录。一周后单表 Part 数量突破 10 万，查询延迟从毫秒级暴涨到分钟级，CPU 持续 100%。根因是高频小批量 INSERT 产生 Part 的速度远超后台 merge 的合并速度。

**解决方案 -- Buffer 表缓冲写入：**

```sql
-- 创建 Buffer 表，自动攒批后写入目标表
CREATE TABLE access_logs_buffer AS access_logs
ENGINE = Buffer(
    currentDatabase(), access_logs,
    16,           -- 层数（缓冲区层数，一般用 16）
    10,           -- 最小刷新间隔（秒）
    100,          -- 最大刷新间隔（秒）
    10000,        -- 最小行数阈值
    1000000,      -- 最大行数阈值
    100000000,    -- 最小字节阈值（100MB）
    1000000000    -- 最大字节阈值（1GB）
);

-- 应用层写入 buffer 表，ClickHouse 自动刷新到目标表
INSERT INTO access_logs_buffer VALUES (...);
```

写入最佳实践：

- 批量写入，单次 INSERT 至少 10000 行或 1MB 数据
- 控制写入频率，单个实例不超过 1-2 次/秒
- 无法控制写入频率时使用 Buffer 表
- 避免分布式表直接写入，写本地表更高效

### 查询优化

```sql
-- 查看当前正在运行的查询
SELECT
    query_id,
    query,
    elapsed,
    formatReadableSize(memory_usage) AS memory,
    read_rows,
    formatReadableSize(read_bytes) AS read_size
FROM system.processes
ORDER BY elapsed DESC;

-- 杀掉问题查询
KILL QUERY WHERE query_id = 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx';

-- 批量杀掉慢查询（超过 60 秒的）
KILL QUERY WHERE elapsed > 60;

-- 慢查询日志分析
SELECT
    query,
    query_duration_ms / 1000 AS duration_sec,
    formatReadableSize(memory_usage) AS memory,
    read_rows,
    formatReadableSize(read_bytes) AS read_size,
    tables
FROM system.query_log
WHERE type = 'QueryFinish'
  AND query_duration_ms > 10000       -- 超过 10 秒
ORDER BY event_date DESC, query_duration_ms DESC
LIMIT 20;

-- 查询 Profile（分析 CPU 与磁盘瓶颈）
SELECT
    query,
    query_duration_ms / 1000 AS duration_sec,
    ProfileEvents['OSCPUVirtualTimeMicroseconds'] / 1000000 AS cpu_sec,
    ProfileEvents['DiskReadElapsedMicroseconds'] / 1000000 AS disk_read_sec,
    ProfileEvents['NetworkReceiveBytes'] AS net_recv
FROM system.query_log
WHERE type = 'QueryFinish'
ORDER BY query_duration_ms DESC
LIMIT 10;
```

### 磁盘空间管理

```sql
-- 各表占用空间总览
SELECT
    database,
    table,
    formatReadableSize(sum(bytes_on_disk)) AS size,
    sum(rows) AS rows,
    count() AS parts
FROM system.parts
WHERE active
GROUP BY database, table
ORDER BY sum(bytes_on_disk) DESC;

-- 查看单表分区大小
SELECT
    partition,
    count() AS parts,
    sum(rows) AS rows,
    formatReadableSize(sum(bytes_on_disk)) AS size
FROM system.parts
WHERE table = 'access_logs' AND active
GROUP BY partition
ORDER BY partition;

-- 删除旧分区（比 DELETE 快得多，直接删除目录）
ALTER TABLE access_logs DROP PARTITION '202501';

-- 查看 TTL 过期进度
SELECT
    database, table,
    name, part,
    rows,
    formatReadableSize(bytes_on_disk) AS size
FROM system.parts
WHERE table = 'access_logs'
  AND active
  AND min_time < now() - INTERVAL 90 DAY;
```

分区删除与 DELETE 的区别：`DROP PARTITION` 直接删除整个分区目录，操作瞬间完成。`DELETE` 是 mutation 操作，需要重写受影响的 Part，消耗大量 I/O 和时间。生产中应优先使用 `DROP PARTITION` 或 TTL 自动清理。

### 冷热分离

ClickHouse 支持将冷数据自动迁移到 S3 兼容存储（如 MinIO），大幅降低存储成本。

```xml
<!-- config.xml 存储策略配置 -->
<storage_configuration>
    <disks>
        <hot_disk>
            <type>local</type>
            <path>/data/clickhouse/hot/</path>
        </hot_disk>
        <cold_disk>
            <type>s3</type>
            <endpoint>http://minio:9000/clickhouse-cold/</endpoint>
            <access_key_id>minioadmin</access_key_id>
            <secret_access_key>minioadmin</secret_access_key>
        </cold_disk>
    </disks>
    <policies>
        <hot_cold>
            <volumes>
                <hot>
                    <disk>hot_disk</disk>
                    <max_data_part_size_bytes>107374182400</max_data_part_size_bytes>  <!-- 100GB -->
                </hot>
                <cold>
                    <disk>cold_disk</disk>
                </cold>
            </volumes>
            <move_factor>0.2</move_factor>  <!-- 热盘空间低于 20% 时触发迁移 -->
        </hot_cold>
    </policies>
</storage_configuration>
```

```sql
-- 使用冷热分离存储策略建表
CREATE TABLE access_logs_tiered
(
    timestamp       DateTime64(3),
    level           LowCardinality(String),
    service         LowCardinality(String),
    message         String,
    trace_id        String,
    duration_ms     UInt32,
    status_code     UInt16,
    request_path    String
)
ENGINE = MergeTree()
PARTITION BY toYYYYMM(timestamp)
ORDER BY (service, timestamp)
TTL
    timestamp + INTERVAL 30 DAY TO VOLUME 'cold',    -- 30 天后迁移到冷存储
    timestamp + INTERVAL 180 DAY TO DELETE             -- 180 天后删除
SETTINGS
    storage_policy = 'hot_cold';
```

冷热分离效果：热数据（近 30 天）在本地 SSD 上毫秒级响应，冷数据在对象存储上查询延迟增加但存储成本降低 70-80%。

## 常见问题排查

### OOM 被杀

**现象：** ClickHouse 进程突然消失，dmesg 或 K8s 事件显示 `Out of memory: Killed process`。

**根因分析：** ClickHouse 默认 `max_memory_usage` 为 10GB。当某个大查询（如全表 GROUP BY）消耗过多内存，且未配置溢出到磁盘，就会触发 OOM。

```sql
-- 查看当前内存配置
SELECT name, value FROM system.settings
WHERE name IN ('max_memory_usage', 'max_memory_usage_for_all_queries',
               'max_bytes_before_external_group_by', 'max_bytes_before_external_sort');
```

**解决方案：**

```xml
<!-- config.xml 内存控制配置 -->
<max_memory_usage>10000000000</max_memory_usage>                          <!-- 单查询上限 10GB -->
<max_memory_usage_for_all_queries>20000000000</max_memory_usage_for_all_queries>  <!-- 全局上限 20GB -->
<max_bytes_before_external_group_by>5000000000</max_bytes_before_external_group_by>  <!-- GROUP BY 超过 5GB 溢出到磁盘 -->
<max_bytes_before_external_sort>5000000000</max_bytes_before_external_sort>  <!-- ORDER BY 溢出到磁盘 -->
```

关键配置说明：

- `max_memory_usage`：单个查询最大内存使用量，超过则报错而非 OOM
- `max_memory_usage_for_all_queries`：所有并发查询的总内存上限
- `max_bytes_before_external_group_by`：GROUP BY 操作超过此阈值自动溢出到磁盘，避免内存爆炸
- 建议将溢出阈值设为 `max_memory_usage` 的一半

### 副本同步延迟

**现象：** ReplicatedMergeTree 不同副本间数据不一致，查询结果随机不同。

```sql
-- 检查副本状态
SELECT
    database,
    table,
    is_leader,
    is_readonly,
    absolute_delay,       -- 与源副本的延迟秒数
    queue_size,           -- 待同步 Part 数量
    logs_to_push
FROM system.replicas
WHERE absolute_delay > 0
ORDER BY absolute_delay DESC;

-- 检查 Keeper / ZooKeeper 连接状态
SELECT *
FROM system.zookeeper
WHERE path = '/clickhouse';

-- 查看副本同步队列详情
SELECT
    database, table,
    is_currently_executing,
    num_tries,
    last_exception,
    last_attempt_time
FROM system.replication_queue
WHERE num_tries > 3;
```

**常见原因及处理：**

| 原因 | 排查方法 | 解决方案 |
|------|----------|----------|
| ZooKeeper/Keeper 不可用 | `system.zookeeper` 查询超时 | 检查 Keeper 进程、网络连通性 |
| ZooKeeper/Keeper 延迟高 | `system.replicas` 中 `absolute_delay` 持续增长 | 扩容 Keeper 集群、检查磁盘 I/O |
| 网络分区 | 节点间 ping 异常 | 修复网络，必要时重启副本节点 |
| 磁盘 I/O 不足 | `iostat -x 1` 查看磁盘利用率 | 升级到 SSD、减少写入频率 |

### Merge 速度跟不上写入

**现象：** Part 数量持续增长不回落，查询越来越慢，CPU 飙高。

```sql
-- 查看今日 Merge 任务统计
SELECT
    table,
    count() AS merge_tasks,
    sum(result_part_rows) AS rows_merged,
    formatReadableSize(sum(bytes_read)) AS data_read,
    avg(duration_ms) AS avg_duration_ms
FROM system.part_log
WHERE event_type = 'MergeParts'
  AND event_date = today()
GROUP BY table;

-- 查看后台 Merge 配置
SELECT name, value FROM system.settings
WHERE name LIKE '%merge%' OR name LIKE '%part%';

-- 查看待处理的 Mutation（ALTER UPDATE / DELETE）
SELECT
    table,
    mutation_id,
    command,
    is_done,
    parts_to_do
FROM system.mutations
WHERE is_done = 0;
```

**优化手段：**

- 增大 merge 线程数：`background_pool_size`（默认 16）可调至 CPU 核数
- 减少写入频率，加大每次写入的批量大小
- 检查磁盘 I/O 是否是瓶颈，考虑升级到 NVMe SSD
- 评估是否可以减少分区数量（过细的分区会增加 Part 数）

## ClickHouse on K8s

### StatefulSet 部署要点

```yaml
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: clickhouse
  labels:
    app: clickhouse
spec:
  serviceName: clickhouse-headless
  replicas: 2                    # 每个 Shard 2 副本
  selector:
    matchLabels:
      app: clickhouse
  template:
    spec:
      containers:
        - name: clickhouse
          image: clickhouse/clickhouse-server:24.8
          ports:
            - containerPort: 8123   # HTTP 接口
            - containerPort: 9000   # Native 接口
          resources:
            requests:
              cpu: "4"
              memory: "16Gi"
            limits:
              cpu: "8"
              memory: "32Gi"        # ClickHouse 需要大内存
          volumeMounts:
            - name: data
              mountPath: /var/lib/clickhouse
            - name: config
              mountPath: /etc/clickhouse-server/config.xml
              subPath: config.xml
          livenessProbe:
            httpGet:
              path: /ping
              port: 8123
            initialDelaySeconds: 30
            periodSeconds: 10
          readinessProbe:
            httpGet:
              path: /ping
              port: 8123
            initialDelaySeconds: 10
            periodSeconds: 5
      volumes:
        - name: config
          configMap:
            name: clickhouse-config
  volumeClaimTemplates:
    - metadata:
        name: data
      spec:
        accessModes: ["ReadWriteOnce"]
        storageClassName: local-ssd   # 必须使用 SSD StorageClass
        resources:
          requests:
            storage: 500Gi
```

部署关键点：

- **必须使用 StatefulSet**：ClickHouse 数据本地持久化，不能随意调度
- **大内存配置**：ClickHouse 依赖内存缓存加速查询，生产至少 16GB
- **SSD 存储**：merge 操作是磁盘密集型的，HDD 会严重拖慢性能
- **分离读写节点**：写入节点和查询节点独立扩缩容，避免相互影响
- **健康检查**：使用 `/ping` 端点，比 TCP 端口检查更准确

### Altinity Operator

对于多分片多副本的集群，推荐使用 [Altinity ClickHouse Operator](https://github.com/Altinity/clickhouse-operator) 管理。Operator 提供了 `ClickHouseInstallation` CRD，可以用声明式方式管理整个集群。

```yaml
apiVersion: clickhouse.altinity.com/v1
kind: ClickHouseInstallation
metadata:
  name: clickhouse-cluster
spec:
  defaults:
    templates:
      podTemplate: default
      dataVolumeClaimTemplate: data-volume
  configuration:
    clusters:
      - name: production
        layout:
          shardsCount: 2
          replicasCount: 2
  templates:
    podTemplates:
      - name: default
        spec:
          containers:
            - name: clickhouse
              image: clickhouse/clickhouse-server:24.8
              resources:
                requests:
                  cpu: "4"
                  memory: "16Gi"
    volumeClaimTemplates:
      - name: data-volume
        spec:
          accessModes: ["ReadWriteOnce"]
          storageClassName: local-ssd
          resources:
            requests:
              storage: 500Gi
```

Operator 的优势：自动管理 ZooKeeper/Keeper 配置、自动创建 Distributed 表、支持滚动升级、统一的配置管理。

## 监控指标

### 关键指标与告警阈值

| 指标 | 采集方式 | 说明 | 告警阈值 |
|------|----------|------|----------|
| **活跃 Part 数** | `system.parts WHERE active` | 单表 Part 数量 | 单表 > 10000（P0），> 3000（P1） |
| **慢查询** | `system.query_log` | 查询执行时间 | > 30 秒（P1），> 120 秒（P0） |
| **副本延迟** | `system.replicas.absolute_delay` | 副本间同步延迟 | > 300 秒（P1），> 1800 秒（P0） |
| **内存使用率** | `system.asynchronous_metrics` | 服务器内存占用 | > 85%（P1），> 95%（P0） |
| **ZK/Keeper 连接** | `system.replicas is_readonly` | 连接状态 | 断开立即告警（P0） |
| **磁盘使用率** | `system.disks` | 存储空间 | > 80%（P1），> 90%（P0） |
| **Merge 速度** | `system.part_log` | Part 合并速率 | Part 持续增长超过 1 小时 |
| **写入延迟** | `system.metrics` | INSERT 响应时间 | > 5 秒（P1） |
| **连接数** | `system.metrics` | 当前连接数 | 接近 `max_connections` 的 80% |

### 监控集成

ClickHouse 内置 Prometheus 指标暴露端点，配置简单：

```xml
<!-- config.xml -->
<prometheus>
    <endpoint>/metrics</endpoint>
    <port>9363</port>
    <metrics>true</metrics>
    <events>true</events>
    <asynchronous_metrics>true</asynchronous_metrics>
    <status_info>true</status_info>
</prometheus>
```

配合 Grafana 官方 [ClickHouse Dashboard](https://grafana.com/grafana/dashboards/?search=clickhouse) 可以实现完整的可视化监控。

## 总结

ClickHouse 的运维核心在于三件事：

1. **控制 Part 数量**：批量写入、Buffer 表、合理分区策略，确保 Part 数量在健康范围内
2. **管理内存使用**：配置 `max_memory_usage`、开启溢出到磁盘、及时杀掉异常查询
3. **保障 Keeper/ZK 稳定**：副本同步、DDL 操作都依赖 Keeper，Keeper 故障会导致集群不可用

| 维度 | 要点 |
|------|------|
| **建表** | 合理分区粒度、精心设计排序键、善用 LowCardinality、配置 TTL |
| **写入** | 批量写入、控制频率、Buffer 表兜底 |
| **查询** | 慢查询检测、KILL 机制、Profile 分析 |
| **存储** | 冷热分离、分区清理、磁盘空间监控 |
| **高可用** | ReplicatedMergeTree + Keeper、多分片多副本 |
| **K8s** | StatefulSet + SSD + 大内存，或使用 Altinity Operator |
| **监控** | Part 数量、内存、副本延迟、Keeper 连接为核心告警指标 |

ClickHouse 的性能上限很高，但对运维的要求也不低。理解 Part 合并机制和内存模型是排查问题的基础，提前做好监控和告警能避免大部分生产事故。

**参考资源：**

- [ClickHouse 官方文档](https://clickhouse.com/docs)
- [ClickHouse 表引擎选择](https://clickhouse.com/docs/en/engines/table-engines/mergetree-family/)
- [ClickHouse 生产监控与优化](https://bigdataboutique.com/blog/clickhouse-production-monitoring-and-optimization-tips-9b26bc)
- [ClickHouse Keeper 文档](https://clickhouse.com/docs/en/operations/clickhouse-keeper/)
- [Altinity ClickHouse Operator](https://github.com/Altinity/clickhouse-operator)
- [ClickHouse K8s Crash Loop 排查](https://altinity.com/blog/fixing-the-dreaded-clickhouse-crash-loop-on-kubernetes)
