---
title: Kubernetes 生产环境运维最佳实践
icon: server
date: 2026-06-13
category:
  - 技术
tag:
  - Kubernetes
  - 运维
  - 最佳实践
  - 生产环境
---

# Kubernetes 生产环境运维最佳实践

将 Kubernetes 从开发环境推向生产，需要在资源管理、安全加固、监控告警、灾备恢复等方面做大量工作。本文结合 2026 年业界实践，系统梳理 K8s 生产运维的关键要点。

<!-- more -->

## 集群规划

### 托管 vs 自建

| 方案 | 优点 | 缺点 |
|------|------|------|
| **托管集群**（EKS/GKE/AKE） | 控制平面托管、自动升级、高可用 | 云厂商锁定、费用较高 |
| **自建集群** | 完全控制、灵活定制 | 运维成本高、需要 3-5 人专职团队 |

**核心原则：除非有强合规需求或成本极端敏感，优先选择托管集群。** Reddit 上有团队分享：自建控制平面花了 6 个月维护，切换到 EKS 后节省大量人力。

### 节点规划

```
生产集群推荐架构：

┌─ Control Plane（托管或 3 节点 HA）─────────────┐
│  API Server + etcd + Scheduler + Controller      │
└──────────────────────────────────────────────────┘

┌─ Worker Node Pool ─────────────────────────────┐
│  系统节点池：运行 DaemonSet、监控、日志采集       │
│  ├─ 4C8G × 3（系统组件）                         │
│                                                  │
│  通用节点池：运行业务应用                          │
│  ├─ 8C16G × N（按需扩缩）                        │
│                                                  │
│  专用节点池：GPU / 高内存 / IO 密集               │
│  ├─ GPU 节点池（AI 推理）                         │
│  └─ 高内存节点池（数据库、缓存）                   │
└──────────────────────────────────────────────────┘
```

建议：

- 控制平面至少 3 节点（etcd 仲裁需要奇数）
- 系统组件与业务应用分开节点池
- 使用 `nodeSelector` 或 `nodeAffinity` 固定工作负载

## 资源管理

### 始终设置 requests 和 limits

```yaml
resources:
  requests:
    cpu: "100m"      # 调度依据
    memory: "128Mi"  # 调度依据
  limits:
    cpu: "500m"      # CPU 节流上限
    memory: "512Mi"  # OOM Kill 上限
```

不设置 limits 的后果：

- **CPU**：一个失控的 Pod 可能占满节点 CPU，影响其他 Pod
- **Memory**：超出节点内存触发 OOM Killer，K8s 会优先杀掉内存超限的 Pod

### LimitRange 与 ResourceQuota

在 Namespace 级别设置默认值和上限：

```yaml
apiVersion: v1
kind: LimitRange
metadata:
  name: default-limits
  namespace: production
spec:
  limits:
    - default:           # 默认 limits
        cpu: "500m"
        memory: "512Mi"
      defaultRequest:    # 默认 requests
        cpu: "100m"
        memory: "128Mi"
      max:               # 最大允许值
        cpu: "4"
        memory: "8Gi"
      type: Container
```

```yaml
apiVersion: v1
kind: ResourceQuota
metadata:
  name: team-quota
  namespace: team-a
spec:
  hard:
    requests.cpu: "20"
    requests.memory: "40Gi"
    limits.cpu: "40"
    limits.memory: "80Gi"
    pods: "100"
```

### HPA 自动扩缩容

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: web-app-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: web-app
  minReplicas: 3
  maxReplicas: 20
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 70
    - type: Resource
      resource:
        name: memory
        target:
          type: Utilization
          averageUtilization: 80
```

2026 年推荐：对于事件驱动型工作负载，考虑使用 **KEDA**（Kubernetes Event-driven Autoscaling），它支持基于消息队列长度、Redis 队列、Cron 等多种触发器。

## 安全加固

### 1. RBAC 最小权限

```yaml
# ✅ 好：最小权限
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  namespace: production
  name: pod-reader
rules:
  - apiGroups: [""]
    resources: ["pods"]
    verbs: ["get", "list"]

# ❌ 差：过度授权
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: admin-all
rules:
  - apiGroups: ["*"]
    resources: ["*"]
    verbs: ["*"]
```

### 2. 网络策略

默认拒绝所有流量，仅放行必要通信：

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: default-deny
  namespace: production
spec:
  podSelector: {}
  policyTypes:
    - Ingress
    - Egress
```

然后按需放行：

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-frontend-to-backend
  namespace: production
spec:
  podSelector:
    matchLabels:
      app: backend
  ingress:
    - from:
        - podSelector:
            matchLabels:
              app: frontend
      ports:
        - port: 8080
```

### 3. Pod 安全标准

```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: production
  labels:
    pod-security.kubernetes.io/enforce: restricted
    pod-security.kubernetes.io/audit: restricted
    pod-security.kubernetes.io/warn: restricted
```

### 4. 镜像安全

- 使用 **Trivy** 扫描镜像漏洞
- 固定镜像版本标签（避免 `:latest`）
- 使用私有镜像仓库（Harbor、云厂商 ACR/ECR）
- 启用镜像签名验证（Notary / Cosign）

```bash
# Trivy 扫描示例
trivy image nginx:1.27
trivy image --severity HIGH,CRITICAL myapp:v2.0
```

### 5. Secret 管理

- 不要将 Secret 提交到 Git
- 使用 **Sealed Secrets** 或 **External Secrets Operator** 从外部管理系统（Vault、AWS Secrets Manager）同步
- 启用 etcd 加密存储

```yaml
apiVersion: apiserver.config.k8s.io/v1
kind: EncryptionConfiguration
resources:
  - resources:
      - secrets
    providers:
      - aescbc:
          keys:
            - name: key1
              secret: <BASE64_ENCODED_SECRET>
      - identity: {}
```

## 监控与告警

### 四个黄金信号

| 信号 | 说明 | Prometheus 示例 |
|------|------|-----------------|
| **延迟** | 请求处理时间 | `histogram_quantile(0.99, rate(http_request_duration_seconds_bucket[5m]))` |
| **流量** | 请求速率 | `rate(http_requests_total[5m])` |
| **错误** | 错误率 | `rate(http_requests_total{status=~"5.."}[5m])` |
| **饱和度** | 资源使用率 | `container_cpu_usage_seconds_total / container_cpu_limit` |

### 关键告警规则

```yaml
groups:
  - name: k8s-alerts
    rules:
      # Pod 频繁重启
      - alert: PodCrashLooping
        expr: rate(kube_pod_container_status_restarts_total[15m]) > 0
        for: 5m
        labels:
          severity: warning

      # 节点 NotReady
      - alert: NodeNotReady
        expr: kube_node_status_condition{condition="Ready",status="true"} == 0
        for: 5m
        labels:
          severity: critical

      # 内存使用率超 90%
      - alert: HighMemoryUsage
        expr: (container_memory_working_set_bytes / container_spec_memory_limit_bytes) > 0.9
        for: 10m
        labels:
          severity: warning

      # PVC 使用率超 85%
      - alert: PVCAlmostFull
        expr: kubelet_volume_stats_used_bytes / kubelet_volume_stats_capacity_bytes > 0.85
        for: 5m
        labels:
          severity: warning
```

### 日志方案

推荐 **Fluentd/Fluent Bit + Loki + Grafana** 组合：

```
Pod 容器日志
    ↓ (Fluent Bit DaemonSet 采集)
Loki (日志存储)
    ↓ (LogQL 查询)
Grafana (可视化)
```

## 版本升级策略

Kubernetes 每年发布 3 个小版本（约每 4 个月一次），每个版本维护约 14 个月。

| 版本 | 代号 | 发布时间 | 增强数量 |
|------|------|----------|----------|
| v1.33 | Octarine | 2025-04 | 64 |
| v1.34 | Of Wind & Will | 2025-08 | 58 |
| v1.35 | Timbernetes | 2025-12 | 60 |

升级原则：

1. **跟随 N-1 或 N-2 策略**：生产集群保持在最新版或次新版本
2. **先升级测试环境**：完整回归测试通过后再升级生产
3. **一次升一个小版本**：不要跨版本升级（如 1.32 → 1.34）
4. **先升级控制平面，再升级节点**
5. **托管集群利用维护窗口**：EKS/GKE 提供自动升级选项

```bash
# 查看集群版本
kubectl version -o yaml

# 查看各节点 kubelet 版本
kubectl get nodes -o wide

# 升级前检查 API 变更
kubectl get --raw /metrics | grep apiserver_request_total
```

## 备份与灾难恢复

### etcd 备份

```bash
# 手动备份
ETCDCTL_API=3 etcdctl snapshot save /backup/etcd-snapshot-$(date +%Y%m%d).db \
  --endpoints=https://127.0.0.1:2379 \
  --cacert=/etc/kubernetes/pki/etcd/ca.crt \
  --cert=/etc/kubernetes/pki/etcd/server.crt \
  --key=/etc/kubernetes/pki/etcd/server.key

# 验证备份
ETCDCTL_API=3 etcdctl snapshot status /backup/etcd-snapshot.db --write-table
```

建议通过 CronJob 自动化备份，保留 7-30 天。

### Velero 集群备份

[Velero](https://velero.io/) 是 K8s 集群备份和迁移的标准工具：

```bash
# 安装 Velero
velero install --provider aws --bucket my-backup-bucket

# 备份整个命名空间
velero backup create production-backup --include-namespaces production

# 定时备份
velero schedule create daily-backup --schedule="0 2 * * *" --include-namespaces production

# 恢复
velero restore create --from-backup production-backup
```

## 故障排查清单

### Pod 无法启动

```bash
# 查看 Pod 状态
kubectl describe pod <pod-name>

# 常见原因：
# - ImagePullBackOff → 镜像不存在或无权限
# - CrashLoopBackOff → 应用启动失败，查看日志
# - Pending → 资源不足或调度约束无法满足

# 查看容器日志
kubectl logs <pod-name> -c <container> --previous  # 前一次崩溃日志
```

### 服务不可达

```bash
# 检查 Service Endpoints
kubectl get endpoints <service-name>

# 检查 Pod 标签是否匹配 Service selector
kubectl get pods --show-labels

# 检查网络策略
kubectl get networkpolicy -n <namespace>
```

### 节点异常

```bash
# 节点状态
kubectl describe node <node-name>

# 查看节点事件
kubectl get events --field-selector involvedObject.name=<node-name>

# 常见原因：
# - DiskPressure → 磁盘满
# - MemoryPressure → 内存不足
# - PIDPressure → 进程数过多
# - NetworkUnavailable → 网络插件未就绪
```

## 总结

Kubernetes 生产运维的核心在于 **预防优于修复**：

1. **规划先行**：托管集群 + 分层节点池
2. **资源明确**：requests/limits 必设，HPA/KEDA 自动扩缩容
3. **纵深防御**：RBAC + NetworkPolicy + Pod Security + 镜像扫描
4. **可观测性**：Prometheus + Grafana + 日志 + 追踪
5. **灾备就绪**：etcd 备份 + Velero + 定期演练

**参考资源：**

- [Kubernetes 生产最佳实践 — Qovery](https://www.qovery.com/guides/kubernetes-best-practices)
- [Kubernetes 官方配置最佳实践](https://kubernetes.io/blog/2025/11/25/configuration-good-practices/)
- [Velero 官方文档](https://velero.io/docs/)
