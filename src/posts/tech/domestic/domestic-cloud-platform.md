---
title: 国产云平台与容器生态实践
icon: cloud
date: 2026-06-13
category:
  - 技术
tag:
  - 国产化
  - 云平台
  - Kubernetes
  - 信创
  - 云原生
---

# 国产云平台与容器生态实践

随着信创工程从党政领域向八大关键行业全面铺开，云计算基础设施的国产化替代正在加速推进。从传统的 VMware 虚拟化环境迁移到国产云平台，从 x86 架构扩展到鲲鹏/飞腾 ARM 架构，从开源社区版 Kubernetes 走向国产容器管理平台——每一步都伴随着技术选型的考量与工程实践的积累。本文系统梳理国产云平台、容器生态、ARM 架构适配、DevOps 工具链等关键领域的现状与实践，为正在进行或计划启动信创云建设的团队提供参考。

<!-- more -->

## 国产云平台概览

### 信创云建设背景

信创云是指在信创技术体系下构建的云计算基础设施，其核心目标是实现从底层硬件、操作系统到云平台软件的全栈自主可控。与传统云平台相比，信创云需要同时满足以下几个维度的要求：

- **全栈国产化**：从 CPU（鲲鹏、飞腾、海光、龙芯）到操作系统（openEuler、麒麟），再到云平台软件，每一层都具备国产替代方案
- **多架构混合**：在过渡阶段需要同时支持 x86 和 ARM 架构，实现工作负载的平滑迁移
- **安全合规**：满足等保 2.0 要求，支持国密算法，通过国家相关认证
- **生态兼容**：兼容主流容器编排、微服务框架和 DevOps 工具链，降低应用改造成本

### 私有云与国产公有云

信创云的部署模式主要分为两种：

- **信创私有云**：部署在企业自有的数据中心内，由企业自主管理。适用于安全等级要求高、数据不能出域的政务、金融、军工等行业。典型方案包括华为云 HCS、阿里云 Apsara Stack、腾讯云 TCE 等
- **国产公有云**：由国内云服务商运营，提供 IaaS/PaaS/SaaS 服务。适用于对数据敏感性要求相对较低、需要快速弹性的场景。华为云、阿里云、腾讯云均已通过网信办云服务安全评估

在实际的信创项目中，私有云是主流选择。一方面出于数据安全和合规的考量，另一方面也因为信创行业客户（党政、金融、军工等）通常拥有自建数据中心。

## 主要国产云平台

### 华为云 HCS（Huawei Cloud Stack）

华为云 HCS 是华为面向政企客户提供的全栈私有云解决方案，在信创私有云市场中占据领先地位。HCS 将华为公有云的核心能力以"云服务"的形式部署到客户数据中心，使客户能够在本地环境中获得与公有云一致的体验。

**核心能力：**

- **鲲鹏 + 昇腾全栈**：华为拥有从芯片（鲲鹏 CPU、昇腾 AI 加速器）到操作系统（openEuler/EulerOS）、数据库（GaussDB）、云平台的完整技术栈，是目前唯一具备全栈自研能力的国产云厂商
- **混合云架构**：支持与华为公有云统一架构、统一 API，实现混合云管理
- **多数据中心部署**：支持同城双活、异地灾备等高可用架构

**容器与云原生服务：**

- **CCE（云容器引擎）**：基于 Kubernetes 的高性能、高可用容器编排服务，支持鲲鹏 ARM 节点和 x86 节点混合部署。CCE 增强版提供了 GPU 调度、Volcano 批处理调度等高级功能
- **CCI（云容器实例）**：基于 Virtual Kubelet 技术的 Serverless 容器服务，按需启动容器，无需管理节点，适合事件驱动型工作负载

**数据库服务：**

- **GaussDB**：华为自研的分布式关系型数据库，支持集中式和分布式两种部署模式。GaussDB 基于华为多年数据库研发积累，在金融、运营商等领域有广泛落地。提供 GaussDB（for MySQL）、GaussDB（for PostgreSQL）等兼容版本，降低迁移门槛

**AI 平台：**

- **ModelArts**：面向开发者的一站式 AI 开发平台，支持昇腾 AI 处理器。提供数据标注、模型训练、模型部署的全流程能力，内置大量预训练模型

### 阿里云 Apsara Stack

Apsara Stack（飞天敏捷版）是阿里云面向大中型企业和政府客户的专有云解决方案。它将阿里云飞天操作系统的核心能力输出到客户自建的数据中心中。

**核心能力：**

- **ACK（容器服务）**：阿里云的 Kubernetes 托管服务，支持边缘容器、Serverless 容器、GPU 容器等多种形态。ACK 在阿里内部支撑了双 11 等超大规模场景，稳定性经过充分验证
- **PolarDB**：阿里云自研的云原生数据库，采用存储计算分离架构，支持 MySQL、PostgreSQL、Oracle 兼容模式。PolarDB 在性能和成本方面具有明显优势，尤其适合传统 Oracle 数据库的国产替代
- **龙蜥 Anolis OS**：阿里主导的 Linux 发行版，是 CentOS 的国产替代方案。Anolis OS 提供与 CentOS 的二进制兼容，已通过鲲鹏、飞腾等国产 CPU 认证

### 腾讯云 TCE（Tencent Cloud Enterprise）

腾讯云 TCE 是腾讯面向企业客户提供的私有云平台。TCE 起源于腾讯内部大规模的云实践，在社交、游戏、金融等行业有深厚积累。

**核心特点：**

- **TKE（腾讯云容器服务）**：基于 Kubernetes 的容器管理平台，支持多集群管理和联邦调度
- 微服务治理能力突出，集成了腾讯自研的服务网格 TSF
- 在金融行业有较多落地案例，与微众银行等金融机构有深度合作

### 易捷行云 EasyStack

易捷行云是一家中立私有云厂商，不依赖特定硬件厂商，在中小企业信创市场中有一定份额。

**核心特点：**

- 基于 OpenStack 和 Kubernetes 构建的私有云平台
- 支持鲲鹏、飞腾、海光等多种国产 CPU
- 提供从 IaaS 到 PaaS 的完整私有云能力
- 部署灵活，支持一体化交付和分离式部署

### 青云 QingCloud

青云 QingCloud 是国内较早的公有云服务商之一，近年来在私有云市场发力。

**核心特点：**

- 光格网络 SDN 和 Sanrack 物理机的自研能力
- KubeSphere 容器平台是其核心开源产品（详见下文）
- 支持多 Region、多可用区架构

## 国产容器生态

容器和 Kubernetes 的开源特性使其天然适配信创场景——国产厂商可以基于上游社区版本进行适配和增强，而不需要从零开始构建。

### KubeSphere

KubeSphere 是青云开源的 Kubernetes 管理平台，是目前国产容器生态中最具影响力的开源项目之一。

**核心特性：**

- **中文友好**：提供完整的中文界面和文档，降低使用门槛
- **全栈能力**：集成 DevOps（Jenkins 流水线）、微服务治理、日志/监控/告警、应用商店等功能
- **多集群管理**：支持统一管理多个 Kubernetes 集群，适合多数据中心场景
- **可插拔架构**：各功能组件可按需启用，不会造成资源浪费

```yaml
# KubeSphere 部署示例（基于 kubectl）
apiVersion: installer.kubesphere.io/v1alpha1
kind: ClusterConfiguration
metadata:
  name: ks-installer
  namespace: kubesphere-system
spec:
  persistence:
    storageClass: ""
  authentication:
    jwtSecret: ""
  local_registry: ""
  etcd:
    monitoring: true
    endpointIps: localhost
    port: 2379
    tlsEnable: true
  common:
    mysqlVolumeSize: 20Gi
    minioVolumeSize: 20Gi
    openldapVolumeSize: 2Gi
    redisVolumSize: 2Gi
  console:
    enableMultiLogin: true
    port: 30880
  devops:
    enabled: true
  monitoring:
    endpoint: http://prometheus-operated.kubesphere-monitoring-system.svc:9090
  logging:
    enabled: true
  events:
    enabled: true
  auditing:
    enabled: true
```

### Rainbond

Rainbond 是一款国产云原生应用管理平台，以"不需要懂 Kubernetes"为核心理念，降低了企业使用容器的门槛。

**核心特性：**

- **应用为中心**：以应用为单位进行管理，屏蔽底层 Kubernetes 的复杂性
- **组件市场**：内置丰富的应用组件，支持一键安装常用中间件（MySQL、Redis、Nginx 等）
- **多语言支持**：通过 BuildPacks 实现 Java、Python、Node.js、Go 等语言的自动构建
- **微服务架构支持**：内置服务网格能力，支持 Spring Cloud、Dubbo 等微服务框架

### DaoCloud

DaoCloud 是国内知名的容器平台服务商，其旗舰产品 DCE（DaoCloud Enterprise）提供企业级容器管理能力。

**核心能力：**

- 多集群统一管理平台
- 云原生应用商店
- 容器安全扫描与合规
- 与国产 CPU 和操作系统的适配认证

### 华为 CCE + 鲲鹏

华为在 ARM 架构上的 Kubernetes 优化是目前国产容器生态中最成熟的技术路线。鲲鹏 920 处理器基于 ARM v8.2 架构，在多核并发场景下性能表现出色。

**关键优化：**

- 鲲鹏节点上 Kubernetes 组件（kubelet、kube-proxy 等）的 ARM 原生编译和性能调优
- 容器运行时（containerd）对 ARM 架构的适配优化
- 网络插件（CNI）和存储插件（CSI）的 ARM 版本适配
- 华为 Volcano 批处理调度器在鲲鹏节点上的优化调度

### 多架构镜像构建

在鲲鹏（ARM）和 x86 混合部署的场景下，需要构建多架构容器镜像。主流方案如下：

```bash
# 使用 docker buildx 构建多架构镜像
docker buildx create --name multiarch --use
docker buildx build --platform linux/amd64,linux/arm64 \
  -t registry.example.com/app:v1.0 \
  --push .
```

```yaml
# Harbor 镜像仓库配置多架构镜像支持
# Harbor 原生支持 Docker Manifest List，可直接存储和分发多架构镜像
# 客户端拉取时自动选择匹配当前架构的镜像
```

## ARM 架构上的 Kubernetes

鲲鹏 ARM 节点加入 Kubernetes 集群是信创云原生架构中的关键步骤。以下从集群管理、镜像构建、性能表现和常见问题四个维度展开。

### 鲲鹏 ARM 节点加入 K8s 集群

将鲲鹏节点加入现有 Kubernetes 集群时，需要关注以下几点：

```bash
# 1. 在鲲鹏节点上安装 kubelet（ARM64 版本）
# 以 kubeadm 为例
KUBELET_VERSION="1.28.2"
ARCH="arm64"
apt-get install -y kubelet=${KUBELET_VERSION}-00 kubeadm=${KUBELET_VERSION}-00

# 2. 为鲲鹏节点打标签，便于调度区分
kubectl label node <node-name> kubernetes.io/arch=arm64
kubectl label node <node-name> node.kubernetes.io/instance-type=kunpeng

# 3. 使用 nodeAffinity 将工作负载调度到指定架构的节点
```

```yaml
# Pod 调度示例：指定 ARM 节点
apiVersion: v1
kind: Pod
metadata:
  name: app-on-arm
spec:
  affinity:
    nodeAffinity:
      requiredDuringSchedulingIgnoredDuringExecution:
        nodeSelectorTerms:
          - matchExpressions:
              - key: kubernetes.io/arch
                operator: In
                values:
                  - arm64
  containers:
    - name: app
      image: registry.example.com/app:v1.0-arm64
```

### 多架构镜像（Multi-arch Image）构建

多架构镜像是混合架构集群的基础。除了前面提到的 `docker buildx`，还可以使用以下方案：

```yaml
# GitHub Actions / Gitee Go 构建多架构镜像
name: Build Multi-arch Image
on:
  push:
    branches: [main]
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Set up QEMU
        uses: docker/setup-qemu-action@v3
      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3
      - name: Build and push
        uses: docker/build-push-action@v5
        with:
          context: .
          platforms: linux/amd64,linux/arm64
          push: true
          tags: registry.example.com/app:${{ github.sha }}
```

### Java/Python/Go 在 ARM 上的性能表现

不同语言运行时在 ARM 架构上的性能表现存在差异：

| 语言/运行时 | ARM 适配程度 | 性能对比（ARM vs x86） | 注意事项 |
|-------------|-------------|----------------------|----------|
| Java (OpenJDK) | 优秀 | 单核持平，多核占优 | 使用鲲鹏 JDK 可获得额外优化 |
| Go | 优秀 | 基本持平 | 原生支持 ARM64 编译，无需额外适配 |
| Python (CPython) | 良好 | 略低（约 90%-95%） | 科学计算库（NumPy/SciPy）需确认 ARM 版本 |
| Node.js | 良好 | 基本持平 | 原生模块（node-gyp）需重新编译 |
| C/C++ | 取决于代码 | 视优化程度而定 | 需注意字节序、数据对齐等问题 |

华为提供的鲲鹏 JDK（基于 OpenJDK）针对鲲鹏处理器做了 JIT 编译优化、GC 调优等增强，在 SPECjbb 等基准测试中相比标准 OpenJDK 有 10%-15% 的性能提升。

### 常见兼容性问题及解决

在将应用迁移到 ARM 架构时，常见的兼容性问题包括：

**1. 本地编译的 JNI 库**

Java 应用中通过 JNI 调用的本地库（如加密库、压缩库）需要重新编译 ARM 版本。解决方案是使用多架构镜像，分别包含对应架构的本地库。

**2. C/C++ 代码的字节序假设**

虽然鲲鹏（ARM v8）和 x86 都是小端序，但部分遗留代码中可能硬编码了对字节序的假设。需要逐一排查并修正。

**3. Docker 镜像中硬编码的架构**

部分 Dockerfile 中可能硬编码了 x86 架构的二进制下载地址。应使用多阶段构建，通过 `TARGETARCH` 变量动态选择：

```dockerfile
# 多阶段构建示例
FROM --platform=$BUILDPLATFORM golang:1.21 AS builder
ARG TARGETARCH
WORKDIR /app
COPY . .
RUN GOARCH=${TARGETARCH} go build -o /app/server

FROM --platform=$TARGETPLATFORM alpine:3.18
COPY --from=builder /app/server /usr/local/bin/server
ENTRYPOINT ["server"]
```

**4. 第三方依赖缺少 ARM 版本**

部分闭源的第三方库或驱动可能没有提供 ARM 版本。需要联系供应商获取 ARM 版本，或寻找开源替代方案。

## 国产 DevOps 工具链

DevOps 工具链的国产化是信创改造的重要组成部分。以下是主要的国产替代方案。

### Gitee（码云）

Gitee 是目前国内最大的 Git 代码托管平台，由开源中国运营。在信创场景中，Gitee 提供了企业版（私有化部署），支持以下能力：

- Git 代码仓库管理，兼容 Git 协议
- 代码审查（Pull Request/MR）和工作流
- Gitee Go CI/CD 流水线
- 企业级权限管理和安全审计
- 支持鲲鹏/飞腾架构私有化部署

### 华为 CodeArts

华为 CodeArts（原名华为云 DevCloud）是华为提供的一站式 DevOps 平台。CodeArts 覆盖了从需求管理、代码托管、代码检查、编译构建、测试到部署的完整研发流程。

**核心能力：**

- 需求管理与项目跟踪（类似 Jira）
- 代码托管（类似 GitHub/GitLab）
- 代码检查（静态分析，支持主流语言）
- 编译构建（支持鲲鹏 ARM 架构的构建环境）
- 部署管理（支持 CCE 容器部署和主机部署）

### 阿里云效

阿里云效（原名 RDC）是阿里巴巴的研发效能平台，在阿里内部支撑了数万名开发者的日常研发工作。

**核心能力：**

- 项目协作（类似 Jira + Confluence）
- 代码管理（支持 Git）
- 流水线（Flow）— CI/CD 自动化
- 制品管理（Packages）
- 测试管理（支持自动化测试）
- 与 ACK、EDAS 等阿里云服务深度集成

### 替代 GitHub/GitLab CI 的方案

对于原来使用 GitHub Actions 或 GitLab CI 的团队，迁移到国产 DevOps 工具链时有以下方案：

```yaml
# Gitee Go 流水线示例
name: Build and Deploy
displayName: 构建与部署
triggers:
  push:
    - main
stages:
  - name: build
    displayName: 构建
    tasks:
      - task: build@1
        inputs:
          image: openjdk:17
          commands: |
            ./mvnw clean package -DskipTests
            docker build -t registry.example.com/app:${GITEE_COMMIT} .
  - name: deploy
    displayName: 部署
    tasks:
      - task: deploy@1
        inputs:
          type: kubernetes
          manifest: k8s/deployment.yaml
          imageTag: ${GITEE_COMMIT}
```

如果希望继续使用 Jenkins 等开源工具，可以结合 KubeSphere 的 DevOps 模块实现。KubeSphere 内置的 Jenkins 提供了图形化的流水线编辑器，同时支持 Jenkinsfile 的直接编写。

## 信创云原生架构

信创云原生架构是一个从硬件到应用的全栈技术体系。以下是一个典型的分层架构：

```
应用层：国产化应用（WPS/金山办公等）
  |
服务网格：Istio / 华为服务网格
  |
容器平台：KubeSphere / 华为 CCE
  |
镜像仓库：Harbor（ARM + x86 多架构）
  |
运行时：containerd / Kata Containers
  |
OS：openEuler / 麒麟
  |
硬件：鲲鹏 / 飞腾 / 海光
```

### 各层关键组件说明

**应用层**：WPS Office、金山文档、致远 OA、泛微 OA 等国产办公和应用软件。对于 Web 类应用，前端框架（Vue/React）和后端框架（Spring Boot/Django/Gin）均可在 ARM 架构上正常运行。

**服务网格**：Istio 社区版已适配 ARM64 架构，可直接使用。华为提供了基于 Istio 增强的服务网格产品，增加了对鲲鹏处理器的性能优化和国密算法的支持。

**容器平台**：KubeSphere 适合需要中文友好界面和一站式管理的场景；华为 CCE 适合已有华为云生态的客户；自建 Kubernetes 集群也是可行的，但需要投入更多的运维精力。

**镜像仓库**：Harbor 是 CNCF 毕业项目，原生支持多架构镜像的存储和分发。Harbor 本身可在 ARM 架构上运行，已有华为在社区中贡献了 ARM 适配代码。

**运行时**：containerd 是当前推荐的容器运行时（Docker 已在 Kubernetes 中被弃用）。对于安全要求更高的场景，可使用 Kata Containers 提供硬件级隔离的容器运行时。

**操作系统**：openEuler 和银河麒麟是信创服务器操作系统的两大主流选择。openEuler 社区活跃度高，内核优化积极；麒麟在政企市场有广泛的资质认证。

**硬件**：鲲鹏（华为）、飞腾（中国长城）、海光（中科曙光）是信创服务器的三大主流 CPU 平台。其中鲲鹏在云原生场景中的生态最为完善。

## 迁移实践

### 从公有云迁移到信创私有云

从 AWS、阿里云公有云迁移到信创私有云是一个系统工程，建议分阶段推进：

**阶段一：评估与规划**

- 梳理现有工作负载清单，标记每个服务的架构依赖
- 评估各服务的 ARM 兼容性（是否有 x86 专有依赖）
- 制定迁移优先级：无状态服务优先，数据库等有状态服务靠后
- 规划网络拓扑和安全策略

**阶段二：基础设施搭建**

- 部署信创私有云平台（如华为 HCS、KubeSphere）
- 搭建 Harbor 镜像仓库，配置多架构镜像支持
- 部署监控体系（Prometheus + Grafana）
- 搭建 CI/CD 流水线

**阶段三：应用迁移**

```bash
# 典型的应用迁移步骤

# 1. 修改 Dockerfile，支持多架构构建
# （参见前文多架构镜像构建部分）

# 2. 在鲲鹏节点上构建并推送 ARM 镜像
docker build -t registry.example.com/app:v1.0-arm64 .
docker push registry.example.com/app:v1.0-arm64

# 3. 创建多架构 manifest
docker manifest create registry.example.com/app:v1.0 \
  registry.example.com/app:v1.0-amd64 \
  registry.example.com/app:v1.0-arm64
docker manifest push registry.example.com/app:v1.0

# 4. 在目标集群中部署应用
kubectl apply -f k8s/deployment.yaml
```

**阶段四：验证与切换**

- 在信创环境中进行功能验证和性能测试
- 逐步将流量从源环境切换到目标环境
- 保留源环境作为回滚备份

### 容器化应用迁移的注意事项

- **环境变量和配置**：检查应用是否硬编码了云厂商特有的环境变量（如 AWS 的实例元数据地址 `169.254.169.254`），需要替换为信创环境的对应配置
- **存储挂载**：公有云的存储类（StorageClass）需要替换为信创私有云对应的存储后端（如 Ceph、OpenEBS 等）
- **服务发现**：如果使用了公有云特有的服务发现机制（如 AWS CloudMap），需要替换为 Kubernetes 原生的 Service/Ingress 或 CoreDNS
- **密钥管理**：从公有云 KMS（如 AWS KMS、阿里云 KMS）迁移到信创环境的密钥管理方案（如 Vault、华为 KMS）

### 监控体系迁移

Prometheus 生态在信创环境中完全兼容，是监控体系迁移的首选方案：

```yaml
# Prometheus 监控部署示例
apiVersion: monitoring.coreos.com/v1
kind: Prometheus
metadata:
  name: prometheus
  namespace: monitoring
spec:
  replicas: 2
  serviceAccountName: prometheus
  serviceMonitorSelector:
    matchLabels:
      team: frontend
  resources:
    requests:
      memory: 400Mi
  storage:
    volumeClaimTemplate:
      spec:
        storageClassName: csi-disk
        resources:
          requests:
            storage: 50Gi
  # 长期存储可对接 Thanos 或 VictoriaMetrics
```

需要注意的几点：

- Prometheus 及其 Exporter 均已适配 ARM64，可在鲲鹏节点上直接部署
- 告警规则和 Grafana Dashboard 可直接复用，无需修改
- 对于长期存储，建议对接 Thanos 或 VictoriaMetrics，并使用国产对象存储（如华为 OBS）作为后端

## 国产云平台对比

| 维度 | 华为云 HCS | 阿里 Apsara Stack | 腾讯 TCE | 易捷行云 |
|------|-----------|-------------------|---------|---------|
| 技术栈 | 全栈自研 | 自研 + 开源 | 自研 + 开源 | 开源 + 二次开发 |
| ARM 支持 | 鲲鹏原生 | 平头哥 | 有限支持 | 鲲鹏 / 飞腾 |
| K8s 方案 | CCE | ACK | TKE | KubeSphere |
| 数据库 | GaussDB | PolarDB | TDSQL | 对接第三方 |
| 微服务 | ServiceStage | SAE/EDAS | TSF | 对接第三方 |
| AI 平台 | ModelArts | PAI | TI | 无 |
| 混合云 | 支持（与华为云互通） | 支持（与阿里云互通） | 支持（与腾讯云互通） | 有限支持 |
| 部署规模 | 大型（数千节点） | 中大型（数百节点） | 中型 | 中小型 |
| 适用场景 | 大型企业、政务 | 中大型企业 | 中型企业 | 中小企业 |
| 许可模式 | 按容量许可 | 按容量许可 | 按容量许可 | 按节点许可 |

**选型建议：**

- **大型企业/政务/军工**：优先考虑华为云 HCS，全栈自研能力在安全合规方面优势明显
- **互联网/电商背景企业**：阿里 Apsara Stack 的弹性调度和数据库能力更强
- **游戏/社交背景企业**：腾讯 TCE 在高并发场景下有实战经验
- **中小型企业和预算有限的团队**：易捷行云 + KubeSphere 的开源方案成本更低

## 总结与展望

国产云平台与容器生态在过去几年取得了长足进步。华为、阿里等头部厂商已经构建起从芯片到应用的全栈能力，KubeSphere、Rainbond 等开源项目在社区中积累了大量用户。ARM 架构上的 Kubernetes 已经在金融、政务、运营商等行业的大规模生产环境中得到验证。

但也需要看到，国产云生态仍面临一些挑战：

- **生态成熟度**：部分领域的国产产品与国外领先产品仍有差距，如分布式存储的性能优化、AI 基础设施的完善度等
- **人才缺口**：同时精通 Kubernetes 和鲲鹏/飞腾架构的工程师相对稀缺
- **迁移成本**：从 x86 到 ARM 的迁移虽然在技术上可行，但涉及测试、验证、性能调优等大量工作

展望未来，随着信创工程的深入推进和国产 CPU 性能的持续提升，国产云平台和容器生态将加速成熟。开源社区（openEuler、KubeSphere 等）的蓬勃发展正在为国产云生态注入持续的创新活力。对于技术团队而言，提前掌握 ARM 架构上的容器化实践和国产云平台的运维能力，将成为未来几年的重要竞争优势。
