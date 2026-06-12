---
title: 国产化中间件与基础设施选型
icon: gear
date: 2026-06-13
category:
  - 技术
tag:
  - 国产化
  - 中间件
  - 信创
  - 中间件迁移
---

# 国产化中间件与基础设施选型

在信创（信息技术应用创新）工程全面推进的背景下，国产化中间件已成为企业 IT 基础设施改造的关键环节。中间件作为连接操作系统、数据库与应用系统的桥梁，直接影响业务系统的稳定性和性能。本文系统梳理国产化中间件的技术选型、迁移策略及实践要点，为正在进行或计划进行信创改造的团队提供参考。

<!-- more -->

## 国产中间件概述

### 信创中间件需求

信创工程要求在 CPU（鲲鹏、飞腾、海光、龙芯等）、操作系统（统信 UOS、银河麒麟等）、数据库（达梦、人大金仓、OceanBase 等）的基础上，实现中间件层的全面国产替代。中间件国产化的核心需求包括：

- **自主可控**：规避供应链风险，确保技术路线不受制于人
- **生态兼容**：兼容主流开发框架（Spring Boot、Jakarta EE 等），降低迁移成本
- **多架构支持**：同时支持 x86 和 ARM（鲲鹏/飞腾）架构
- **性能对标**：在国产 CPU 上达到或接近国外产品的性能水平
- **安全合规**：通过等保测评，满足国密算法等安全要求

### 国产中间件发展现状

经过多年发展，国产中间件已从"可用"走向"好用"的阶段。东方通、宝兰德、金蝶天燕等厂商的应用服务器产品在党政、金融、电信、能源等行业积累了大量落地案例。Apache 基金会中的 RocketMQ、ShardingSphere、APISIX 等国产开源项目已成长为国际顶级项目，技术成熟度不逊于国外同类产品。华为云、阿里云等厂商也提供了完整的云原生中间件产品线。

## Web 服务器与应用服务器

应用服务器是国产化替代中迁移难度较大的中间件类型，主要替代对象为 Oracle WebLogic、IBM WebSphere 等商业产品。

### 东方通 TongWeb

东方通是国内最早的中间件厂商之一，TongWeb 是其旗舰应用服务器产品：

- 兼容 Java EE 7/8 和 Jakarta EE 8/9 规范
- 支持 Spring Boot、Spring Cloud 等主流框架的无缝迁移
- 通过鲲鹏、飞腾、海光、龙芯等多款国产 CPU 认证
- 内置国密算法（SM2/SM3/SM4）安全模块
- 提供可视化管理和监控控制台

```xml
<!-- TongWeb 数据源配置示例 -->
<datasource>
  <name>jdbc/dm</name>
  <connection-pool>
    <url>jdbc:dm://192.168.1.100:5236/APPDB</url>
    <driver>dm.jdbc.driver.DmDriver</driver>
    <username>SYSDBA</username>
    <password>encrypted:xxxxx</password>
    <max-pool-size>50</max-pool-size>
    <min-pool-size>5</min-pool-size>
  </connection-pool>
</datasource>
```

### 宝兰德 BES

宝兰德（BES，Beyond Enterprise Server）专注于中间件领域：

- 通过 Jakarta EE 8/9 全套兼容性认证
- 支持微服务架构，内置服务注册与发现
- 在电信、金融行业有大规模部署案例
- 提供 WebLogic 迁移工具，可自动转换部署描述符

### 金蝶天燕 AAS

金蝶天燕 AAS（Apusic Application Server）定位企业级应用服务器：

- 兼容 Java EE 规范，支持 EJB、JMS、JPA 等组件模型
- 与金蝶中间件产品线（消息队列、ESB 等）深度集成
- 在政务和制造行业有较广泛的用户基础
- 提供从 WebLogic/WebSphere 的一键迁移方案

### 应用服务器对比

| 维度 | 东方通 TongWeb | 宝兰德 BES | 金蝶天燕 AAS |
|------|---------------|-----------|-------------|
| **Jakarta EE 兼容性** | 8/9 | 8/9 | 7/8 |
| **国产 CPU 支持** | 鲲鹏/飞腾/海光/龙芯 | 鲲鹏/飞腾/海光 | 鲲鹏/飞腾/龙芯 |
| **微服务支持** | 支持 | 深度支持 | 基础支持 |
| **行业优势** | 党政/金融/能源 | 电信/金融 | 政务/制造 |
| **迁移工具** | 有 | 完善 | 有 |
| **国密支持** | 内置 | 支持 | 支持 |
| **许可模式** | 按CPU/按节点 | 按CPU授权 | 按节点授权 |

## 消息队列

消息队列是分布式系统的核心基础设施，国产化替代方案较为成熟。

### Apache RocketMQ

RocketMQ 是阿里巴巴开源的分布式消息中间件，2016 年进入 Apache 孵化器，2017 年成为顶级项目：

- 支持万亿级消息堆积能力，经过阿里双 11 验证
- 提供顺序消息、事务消息、延迟消息等高级特性
- 兼容 JMS 规范，可平滑替代 ActiveMQ
- 原生支持 Java/C++/Go/Python 等多语言客户端
- 支持 ARM 架构，可在鲲鹏服务器上运行

```bash
# RocketMQ 快速部署（单机模式）
wget https://archive.apache.org/dist/rocketmq/5.3.2/rocketmq-5.3.2.zip
unzip rocketmq-5.3.2.zip
cd rocketmq-5.3.2

# 启动 NameServer
nohup sh bin/mqnamesrv &

# 启动 Broker
nohup sh bin/mqbroker -n localhost:9876 &

# 验证服务状态
sh bin/mqadmin clusterList -n localhost:9876
```

### 华为 DMS

华为分布式消息服务（DMS，Distributed Message Service）是华为云提供的托管消息队列服务：

- 支持 Kafka 和 RabbitMQ 协议兼容模式
- 开箱即用，无需运维消息队列集群
- 与华为云 CSE（微服务引擎）深度集成
- 提供消息轨迹追踪和死信队列管理

### ActiveMQ/RabbitMQ 迁移方案

从 ActiveMQ 迁移到 RocketMQ 的关键步骤：

1. **协议适配**：RocketMQ 支持 JMS 协议，ActiveMQ 的 JMS 生产者/消费者代码无需修改
2. **消息模型映射**：ActiveMQ 的 Topic 对应 RocketMQ 的 Topic，Queue 对应同一 Topic 下的不同 Consumer Group
3. **特性替换**：ActiveMQ 的 ScheduledMessage 使用 RocketMQ 的延迟消息替代
4. **部署切换**：采用双写方案，两端同时写入，消费逐步切到 RocketMQ，最后关闭 ActiveMQ

从 RabbitMQ 迁移需要额外注意：

- RabbitMQ 的 Exchange 模型需重新设计为 RocketMQ 的 Topic/Tag 模型
- 消息确认机制不同，RabbitMQ 的 ACK 机制需适配 RocketMQ 的消费进度管理
- 建议使用 RocketMQ 5.x 的 Proxy 模式，简化客户端接入

## 缓存与分布式

### Redis

Redis 作为开源软件，不存在国产替代的强制需求，但需要注意：

- **ARM 架构性能**：Redis 在鲲鹏/飞腾处理器上的性能约为 x86 的 85%-95%，差异主要来自内存带宽和指令集差异
- **编译优化**：建议使用 ARM 架构优化的编译选项，启用 NEON 指令集加速
- **信创环境适配**：确保 Redis 在统信 UOS、银河麒麟上编译通过

```bash
# ARM 架构编译 Redis（启用优化）
make CFLAGS="-march=armv8.2-a+crypto+simd -O3" \
     LDFLAGS="-static"
make test
make install PREFIX=/usr/local/redis
```

### 华为分布式缓存 DCS

华为云 DCS（Distributed Cache Service）提供兼容 Redis 协议的托管缓存服务：

- 支持集群模式、主备模式、读写分离模式
- 兼容 Redis 5.x/6.x/7.x 协议
- 提供 Web 管理控制台和监控告警
- 支持大 Key 分析和热 Key 分析

## API 网关与服务治理

### Apache APISIX

Apache APISIX 是由支流科技（API7）开源的云原生 API 网关：

- 基于 Nginx + etcd 架构，性能优异（单核 QPS 可达 20 万+）
- 支持动态路由、限流限速、认证鉴权、可观测性等插件
- 原生支持多语言插件（Lua/Go/Java/Python/Wasm）
- 提供 Dashboard 管理界面和 Ingress Controller
- 已通过鲲鹏、飞腾认证

```yaml
# APISIX 路由配置示例
routes:
  - uri: /api/v1/*
    upstream:
      type: roundrobin
      nodes:
        "10.0.1.10:8080": 1
        "10.0.1.11:8080": 1
    plugins:
      limit-count:
        count: 1000
        time_window: 60
        rejected_code: 429
      key-auth:
        header: apikey
```

### Spring Cloud Huawei

Spring Cloud Huawei 是华为开源的 Spring Cloud 增强实现：

- 基于 ServiceComb 微服务框架
- 提供服务注册发现、配置管理、熔断降级等能力
- 与华为云 CSE（微服务引擎）无缝集成
- 支持 Spring Cloud 2021.x 和 Spring Boot 2.x/3.x

### 服务治理选型对比

| 方案 | 协议兼容 | 性能 | 社区活跃度 | 信创适配 |
|------|---------|------|-----------|---------|
| **Apache APISIX** | HTTP/gRPC/WebSocket | 极高 | 活跃 | 已认证 |
| **Kong** | HTTP/gRPC | 高 | 活跃 | 需自行适配 |
| **华为 APIC** | HTTP/gRPC | 高 | 商业产品 | 原生支持 |
| **Spring Cloud Huawei** | HTTP | 中 | 中等 | 原生支持 |

## 容器与云原生

容器平台是信创改造中云原生转型的核心基础设施。

### 国内云厂商容器服务

| 产品 | 厂商 | 特点 |
|------|------|------|
| **CCE** | 华为云 | 鲲鹏架构深度优化，混部支持 |
| **ACK** | 阿里云 | 弹性调度能力强，阿里生态集成 |
| **TKE** | 腾讯云 | 轻量级集群管理，腾讯生态集成 |

### 开源 K8s 发行版

对于需要私有化部署的场景，可选择以下发行版：

- **KubeSphere**（青云）：提供全栈云原生平台，支持多集群管理，中文社区活跃
- **Rancher 中文版**：提供 K8s 集群统一管理平台，2.x 版本对国内环境优化
- **华为 Kubernetes 发行版**：基于开源 K8s 增强，在 ARM 架构上有性能优化

### ARM 架构容器适配

在鲲鹏/飞腾环境下运行容器的关键注意事项：

```dockerfile
# 多架构镜像构建示例
FROM --platform=$BUILDPLATFORM golang:1.22 AS builder
ARG TARGETPLATFORM
ARG BUILDPLATFORM
WORKDIR /app
COPY . .
RUN CGO_ENABLED=0 GOOS=linux GOARCH=$(echo $TARGETPLATFORM | cut -d'/' -f2) \
    go build -o /app/server .

FROM --platform=$TARGETPLATFORM alpine:3.19
COPY --from=builder /app/server /usr/local/bin/server
ENTRYPOINT ["server"]
```

构建多架构镜像并推送：

```bash
# 使用 buildx 构建多架构镜像
docker buildx create --use --name multiarch
docker buildx build --platform linux/amd64,linux/arm64 \
    -t registry.example.com/app:v1.0 \
    --push .
```

## 数据库中间件

### Apache ShardingSphere

ShardingSphere 是国产开源的分布式数据库中间件，已成长为 Apache 顶级项目：

- 提供 ShardingSphere-JDBC（轻量级 Java 框架）和 ShardingSphere-Proxy（独立代理服务）两种形态
- 支持数据分片、读写分离、数据加密、影子库压测等特性
- 兼容 MySQL、PostgreSQL、Oracle、达梦、人大金仓等多种数据库
- 支持 ARM 架构部署

```yaml
# ShardingSphere-Proxy 配置示例
database:
  name: logic_db
  dataSources:
    ds_0:
      url: jdbc:dm://10.0.1.10:5236/db0
      username: SYSDBA
      password: xxxxxx
      connectionTimeoutMilliseconds: 30000
      maxPoolSize: 50
    ds_1:
      url: jdbc:dm://10.0.1.11:5236/db1
      username: SYSDBA
      password: xxxxxx
      connectionTimeoutMilliseconds: 30000
      maxPoolSize: 50

rules:
  - !SHARDING
    tables:
      t_order:
        actualDataNodes: ds_${0..1}.t_order_${0..15}
        tableStrategy:
          standard:
            shardingColumn: order_id
            shardingAlgorithmName: t_order_inline
        keyGenerateStrategy:
          column: order_id
          keyGeneratorName: snowflake
    shardingAlgorithms:
      t_order_inline:
        type: INLINE
        props:
          algorithm-expression: t_order_${order_id % 16}
    keyGenerators:
      snowflake:
        type: SNOWFLAKE
```

### MyCat

MyCat 是国内较早的数据库中间件开源项目：

- 基于 Cobar 演进而来，提供数据库代理服务
- 支持分库分表、读写分离
- 社区活跃度较低，建议新项目优先选择 ShardingSphere
- 已有 MyCat 部署可逐步迁移到 ShardingSphere

## 国产中间件选型总览

| 中间件类型 | 国外方案 | 国产替代 | 兼容性 | 成熟度 |
|-----------|---------|---------|--------|--------|
| 应用服务器 | WebLogic/WebSphere | 东方通 TongWeb / 宝兰德 BES / 金蝶天燕 AAS | 高 | 中 |
| 消息队列 | Kafka / RabbitMQ / ActiveMQ | Apache RocketMQ / 华为 DMS | 高 | 高 |
| 缓存 | Redis | Redis（开源，华为 DCS 托管） | 高 | 高 |
| API 网关 | Kong / Nginx | Apache APISIX | 高 | 高 |
| 分库分表 | Sharding-JDBC | Apache ShardingSphere | 高 | 高 |
| 微服务框架 | Spring Cloud Netflix | Spring Cloud Huawei / Spring Cloud Alibaba | 中 | 中 |
| 容器平台 | K8s (Vanilla) | KubeSphere / 华为 CCE / 阿里 ACK | 高 | 高 |
| 数据库中间件 | MyCat（早期） | Apache ShardingSphere | 高 | 高 |

## 迁移策略

国产化中间件迁移应遵循"评估先行、分步实施、风险可控"的原则。

### 分阶段迁移路径

```
阶段一：评估与准备
  ├─ 梳理现有中间件清单和使用方式
  ├─ 识别强绑定点（厂商专有 API、特殊配置）
  ├─ 确定优先级（按业务影响和迁移难度排序）
  └─ 搭建信创测试环境

阶段二：开源替代优先
  ├─ WebLogic/Tomcat -> TongWeb/BES（商业替代）
  ├─ ActiveMQ/RabbitMQ -> RocketMQ（开源替代）
  ├─ Kong/Nginx -> APISIX（开源替代）
  └─ Sharding-JDBC -> ShardingSphere（同产品升级）

阶段三：云原生改造
  ├─ 传统部署 -> 容器化（K8s + KubeSphere/CCE）
  ├─ 微服务框架 -> Spring Cloud Huawei/Alibaba
  └─ 配置中心 -> Nacos（替代 Spring Cloud Config）

阶段四：验证与优化
  ├─ 功能回归测试
  ├─ 性能基准测试（与原环境对比）
  ├─ 安全合规测试（等保、国密）
  └─ 全链路压测
```

### 迁移注意事项

1. **优先迁移开源兼容的中间件**：RocketMQ、APISIX、ShardingSphere 等开源产品技术成熟、社区活跃，迁移风险最低
2. **商业产品先试用再采购**：东方通、宝兰德等商业产品需在真实业务场景下验证性能和稳定性
3. **ARM 架构性能基线**：在鲲鹏/飞腾服务器上建立性能基线，与 x86 环境对比，识别性能瓶颈
4. **保留回退方案**：每个中间件迁移阶段都应保留回退能力，通过灰度发布控制风险
5. **关注版本兼容矩阵**：国产中间件与国产数据库、操作系统的兼容性需提前确认

## 总结

国产化中间件已具备支撑企业级应用的能力。Apache RocketMQ、ShardingSphere、APISIX 等开源项目技术成熟度高，可优先用于替代国外同类产品。东方通 TongWeb、宝兰德 BES 等商业应用服务器在特定行业有成熟的解决方案，适合替代 WebLogic/WebSphere 等重量级商业产品。

迁移过程中，建议遵循"开源优先、分步迁移、持续验证"的策略，先迁移技术风险低的中间件，积累经验后再处理复杂的商业中间件替代。同时关注 ARM 架构下的性能优化和云原生架构的同步演进，将信创改造与架构升级结合起来，实现技术栈的全面升级。

国产化不是简单的"换牌子"，而是借机提升整体 IT 基础设施的自主可控能力和技术架构水平。选型时应以业务需求为驱动，以技术成熟度为准绳，走出一条适合自身企业的信创之路。
