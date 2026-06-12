---
title: "Go 操作 Kubernetes：从客户端到 Operator 开发"
icon: docker
date: 2026-06-13
category:
  - 技术
tag:
  - Go
  - Kubernetes
  - Operator
  - SRE
---

# Go 操作 Kubernetes：从客户端到 Operator 开发

作为 SRE 和运维开发工程师，我们经常需要与 Kubernetes 进行程序化交互：自动化巡检、动态扩缩容、自定义控制器。Go 作为 Kubernetes 的原生语言，拥有最完善的客户端库和工具链。本文从 client-go 基础操作出发，逐步深入 Informer 机制，最终完成一个完整的 Operator 开发。

<!-- more -->

## client-go 库介绍

client-go 是 Kubernetes 官方提供的 Go 语言客户端库，它不仅仅是 HTTP 封装，而是包含了一整套与 Kubernetes API Server 交互的工具集：

| 模块 | 作用 |
|------|------|
| **kubernetes** | 类型化客户端（Typed Client），提供 Pod、Deployment 等原生资源的 CRUD 操作 |
| **dynamic** | 动态客户端（Dynamic Client），操作任意 CRD 资源，无需预生成代码 |
| **informers** | 基于 ListWatch 机制的本地缓存和事件通知框架 |
| **listers** | Informer 的本地缓存索引，提供高效的资源查询 |
| **rest** | 底层 REST 配置，处理认证、TLS、重试等 |
| **tools/cache** | Informer 的核心实现，包括 Reflector、DeltaFIFO、Indexer |
| **tools/clientcmd** | 解析 kubeconfig 文件 |

安装：

```bash
go get k8s.io/client-go@latest
# 截至本文编写时，最新版本为 v0.32.x
```

## 连接集群

连接 Kubernetes 集群有两种典型场景：**Pod 内运行**（InClusterConfig）和**本地开发**（kubeconfig）。

### InClusterConfig（Pod 内运行）

当程序以 Pod 形式运行在集群内时，使用 InClusterConfig 自动获取 ServiceAccount 凭证：

```go
package main

import (
    "fmt"
    "log"

    "k8s.io/client-go/kubernetes"
    "k8s.io/client-go/rest"
)

func newInClusterClient() (*kubernetes.Clientset, error) {
    config, err := rest.InClusterConfig()
    if err != nil {
        return nil, fmt.Errorf("failed to get in-cluster config: %w", err)
    }

    clientset, err := kubernetes.NewForConfig(config)
    if err != nil {
        return nil, fmt.Errorf("failed to create clientset: %w", err)
    }

    return clientset, nil
}

func main() {
    client, err := newInClusterClient()
    if err != nil {
        log.Fatal(err)
    }

    version, err := client.Discovery().ServerVersion()
    if err != nil {
        log.Fatal(err)
    }
    fmt.Printf("Connected to Kubernetes %s\n", version.GitVersion)
}
```

对应的 RBAC 配置：

```yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: sre-tool
  namespace: default
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: sre-tool-role
rules:
  - apiGroups: ["", "apps"]
    resources: ["pods", "deployments", "namespaces"]
    verbs: ["get", "list", "watch"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
  name: sre-tool-binding
subjects:
  - kind: ServiceAccount
    name: sre-tool
    namespace: default
roleRef:
  kind: ClusterRole
  name: sre-tool-role
  apiGroup: rbac.authorization.k8s.io
```

### kubeconfig（本地开发）

本地开发时从 `~/.kube/config` 加载配置：

```go
package main

import (
    "fmt"
    "log"
    "path/filepath"

    "k8s.io/client-go/kubernetes"
    "k8s.io/client-go/tools/clientcmd"
    "k8s.io/client-go/util/homedir"
)

func newLocalClient() (*kubernetes.Clientset, error) {
    kubeconfig := filepath.Join(homedir.HomeDir(), ".kube", "config")

    config, err := clientcmd.BuildConfigFromFlags("", kubeconfig)
    if err != nil {
        return nil, fmt.Errorf("failed to build config from kubeconfig: %w", err)
    }

    clientset, err := kubernetes.NewForConfig(config)
    if err != nil {
        return nil, fmt.Errorf("failed to create clientset: %w", err)
    }

    return clientset, nil
}
```

实际项目中建议封装一个统一的连接函数：

```go
func newK8sClient() (*kubernetes.Clientset, error) {
    // 优先使用 InClusterConfig
    config, err := rest.InClusterConfig()
    if err == nil {
        return kubernetes.NewForConfig(config)
    }

    // 回退到 kubeconfig
    kubeconfig := filepath.Join(homedir.HomeDir(), ".kube", "config")
    config, err = clientcmd.BuildConfigFromFlags("", kubeconfig)
    if err != nil {
        return nil, fmt.Errorf("neither in-cluster nor kubeconfig available: %w", err)
    }

    return kubernetes.NewForConfig(config)
}
```

## 基础操作

### 列出 Pod

```go
package main

import (
    "context"
    "fmt"
    "log"
    "time"

    metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
    "k8s.io/client-go/kubernetes"
)

func listPods(client *kubernetes.Clientset, namespace string) error {
    ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
    defer cancel()

    pods, err := client.CoreV1().Pods(namespace).List(ctx, metav1.ListOptions{})
    if err != nil {
        return fmt.Errorf("failed to list pods: %w", err)
    }

    for _, pod := range pods.Items {
        fmt.Printf("[%s] %s  %s  %s\n",
            pod.Namespace,
            pod.Name,
            pod.Status.Phase,
            pod.Status.PodIP,
        )
    }

    fmt.Printf("\nTotal: %d pods in namespace %s\n", len(pods.Items), namespace)
    return nil
}

func main() {
    client, err := newK8sClient()
    if err != nil {
        log.Fatal(err)
    }

    // 列出 default namespace 下的 Pod
    if err := listPods(client, "default"); err != nil {
        log.Fatal(err)
    }
}
```

### 创建 Deployment

```go
func createDeployment(client *kubernetes.Clientset, namespace string) error {
    ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
    defer cancel()

    deploy := &appsv1.Deployment{
        ObjectMeta: metav1.ObjectMeta{
            Name:      "demo-app",
            Namespace: namespace,
            Labels: map[string]string{
                "app": "demo",
            },
        },
        Spec: appsv1.DeploymentSpec{
            Replicas: ptr.To[int32](3),
            Selector: &metav1.LabelSelector{
                MatchLabels: map[string]string{
                    "app": "demo",
                },
            },
            Template: corev1.PodTemplateSpec{
                ObjectMeta: metav1.ObjectMeta{
                    Labels: map[string]string{
                        "app": "demo",
                    },
                },
                Spec: corev1.PodSpec{
                    Containers: []corev1.Container{
                        {
                            Name:  "nginx",
                            Image: "nginx:1.27",
                            Ports: []corev1.ContainerPort{
                                {ContainerPort: 80},
                            },
                            Resources: corev1.ResourceRequirements{
                                Requests: corev1.ResourceList{
                                    corev1.ResourceCPU:    resource.MustParse("100m"),
                                    corev1.ResourceMemory: resource.MustParse("128Mi"),
                                },
                                Limits: corev1.ResourceList{
                                    corev1.ResourceCPU:    resource.MustParse("500m"),
                                    corev1.ResourceMemory: resource.MustParse("256Mi"),
                                },
                            },
                        },
                    },
                },
            },
        },
    }

    created, err := client.AppsV1().Deployments(namespace).Create(ctx, deploy, metav1.CreateOptions{})
    if err != nil {
        return fmt.Errorf("failed to create deployment: %w", err)
    }

    fmt.Printf("Deployment %s created successfully\n", created.Name)
    return nil
}
```

辅助函数（Go 1.21+ 可直接使用 `ptr.To`，此处提供兼容写法）：

```go
import "k8s.io/utils/ptr"

// 或者自己定义
func int32Ptr(v int32) *int32 { return &v }
```

### 更新 Deployment

```go
func scaleDeployment(client *kubernetes.Clientset, namespace, name string, replicas int32) error {
    ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
    defer cancel()

    // 使用 Scale 子资源进行扩缩容
    scale, err := client.AppsV1().Deployments(namespace).GetScale(ctx, name, metav1.GetOptions{})
    if err != nil {
        return fmt.Errorf("failed to get scale: %w", err)
    }

    scale.Spec.Replicas = replicas

    _, err = client.AppsV1().Deployments(namespace).UpdateScale(ctx, name, scale, metav1.UpdateOptions{})
    if err != nil {
        return fmt.Errorf("failed to update scale: %w", err)
    }

    fmt.Printf("Deployment %s scaled to %d replicas\n", name, replicas)
    return nil
}
```

### 更新镜像版本（滚动更新）

```go
func updateDeploymentImage(client *kubernetes.Clientset, namespace, name, container, image string) error {
    ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
    defer cancel()

    deploy, err := client.AppsV1().Deployments(namespace).Get(ctx, name, metav1.GetOptions{})
    if err != nil {
        return fmt.Errorf("failed to get deployment: %w", err)
    }

    for i, c := range deploy.Spec.Template.Spec.Containers {
        if c.Name == container {
            deploy.Spec.Template.Spec.Containers[i].Image = image
            break
        }
    }

    _, err = client.AppsV1().Deployments(namespace).Update(ctx, deploy, metav1.UpdateOptions{})
    if err != nil {
        return fmt.Errorf("failed to update deployment: %w", err)
    }

    fmt.Printf("Deployment %s image updated to %s\n", name, image)
    return nil
}
```

### 删除 Deployment

```go
func deleteDeployment(client *kubernetes.Clientset, namespace, name string) error {
    ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
    defer cancel()

    // 使用前台删除，等待 Pod 终止
    propagationPolicy := metav1.DeletePropagationForeground
    err := client.AppsV1().Deployments(namespace).Delete(ctx, name, metav1.DeleteOptions{
        PropagationPolicy: &propagationPolicy,
    })
    if err != nil {
        return fmt.Errorf("failed to delete deployment: %w", err)
    }

    fmt.Printf("Deployment %s deleted\n", name)
    return nil
}
```

### 创建 Service

```go
func createService(client *kubernetes.Clientset, namespace string) error {
    ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
    defer cancel()

    svc := &corev1.Service{
        ObjectMeta: metav1.ObjectMeta{
            Name:      "demo-app-svc",
            Namespace: namespace,
        },
        Spec: corev1.ServiceSpec{
            Selector: map[string]string{
                "app": "demo",
            },
            Ports: []corev1.ServicePort{
                {
                    Protocol:   corev1.ProtocolTCP,
                    Port:       80,
                    TargetPort: intstr.FromInt(80),
                },
            },
            Type: corev1.ServiceTypeClusterIP,
        },
    }

    created, err := client.CoreV1().Services(namespace).Create(ctx, svc, metav1.CreateOptions{})
    if err != nil {
        return fmt.Errorf("failed to create service: %w", err)
    }

    fmt.Printf("Service %s created, ClusterIP: %s\n", created.Name, created.Spec.ClusterIP)
    return nil
}
```

## Informer 机制

直接调用 `List` 接口存在两个问题：(1) 每次查询都请求 API Server，产生不必要的负载；(2) 无法实时感知资源变化。Informer 机制完美解决了这两个问题。

### 核心原理

```
                    Informer 架构

  API Server
      │
      │ List (全量) + Watch (增量)
      ▼
  ┌──────────────┐
  │  Reflector   │  负责从 API Server 拉取数据并推入 DeltaFIFO
  └──────┬───────┘
         │
         ▼
  ┌──────────────┐
  │  DeltaFIFO   │  存储资源的变更事件（Added/Updated/Deleted）
  └──────┬───────┘
         │
         ▼
  ┌──────────────┐     ┌──────────────────┐
  │  Indexer     │     │  Event Handlers   │
  │  (本地缓存)  │────▶│  OnAdd / OnUpdate │
  │  ThreadSafe  │     │  / OnDelete       │
  └──────────────┘     └──────────────────┘
```

Informer 的关键特性：

- **ListWatch**：启动时执行一次 List 获取全量数据，然后通过 Watch 持续接收增量事件
- **本地缓存**：所有资源缓存在内存中的 Indexer 中，查询不再请求 API Server
- **事件驱动**：资源的增删改都会触发回调函数，适合构建控制器
- **Resync**：定期全量同步，确保本地缓存与集群状态一致（默认每 30 分钟）

### 使用 SharedInformerFactory

```go
package main

import (
    "fmt"
    "log"
    "time"

    corev1 "k8s.io/api/core/v1"
    "k8s.io/client-go/informers"
    "k8s.io/client-go/kubernetes"
    "k8s.io/client-go/tools/cache"
)

func watchPods(client *kubernetes.Clientset) {
    // SharedInformerFactory 共享 Informer 实例，避免重复 ListWatch
    factory := informers.NewSharedInformerFactory(client, 30*time.Minute)

    podInformer := factory.Core().V1().Pods().Informer()

    podInformer.AddEventHandler(cache.ResourceEventHandlerFuncs{
        AddFunc: func(obj interface{}) {
            pod := obj.(*corev1.Pod)
            fmt.Printf("[ADD]    %s/%s  phase=%s\n", pod.Namespace, pod.Name, pod.Status.Phase)
        },
        UpdateFunc: func(oldObj, newObj interface{}) {
            oldPod := oldObj.(*corev1.Pod)
            newPod := newObj.(*corev1.Pod)
            if oldPod.Status.Phase != newPod.Status.Phase {
                fmt.Printf("[UPDATE] %s/%s  %s -> %s\n",
                    newPod.Namespace, newPod.Name,
                    oldPod.Status.Phase, newPod.Status.Phase)
            }
        },
        DeleteFunc: func(obj interface{}) {
            pod := obj.(*corev1.Pod)
            fmt.Printf("[DELETE] %s/%s\n", pod.Namespace, pod.Name)
        },
    })

    // 启动所有 Informer
    stopCh := make(chan struct{})
    defer close(stopCh)

    factory.Start(stopCh)

    // 等待初始 List 完成（缓存同步）
    if !cache.WaitForCacheSync(stopCh, podInformer.HasSynced) {
        log.Fatal("failed to sync informer cache")
    }

    fmt.Println("Informer started and cache synced")

    // 阻塞等待
    select {}
}

func main() {
    client, err := newK8sClient()
    if err != nil {
        log.Fatal(err)
    }

    watchPods(client)
}
```

### 使用 Lister 查询缓存

Informer 同步完成后，可以通过 Lister 从本地缓存高效查询，不需要请求 API Server：

```go
func listRunningPods(factory informers.SharedInformerFactory, namespace string) {
    // 从缓存中列出 Pod
    podLister := factory.Core().V1().Pods().Lister().Pods(namespace)
    pods, err := podLister.List(labels.Everything())
    if err != nil {
        log.Printf("failed to list pods from cache: %v", err)
        return
    }

    for _, pod := range pods {
        if pod.Status.Phase == corev1.PodRunning {
            fmt.Printf("  Running: %s/%s\n", pod.Namespace, pod.Name)
        }
    }
}
```

### 自定义 Indexer

默认情况下，Informer 按 namespace 和 name 索引。可以添加自定义索引：

```go
// 按节点名称索引 Pod
podInformer.AddIndexers(cache.Indexers{
    "byNode": func(obj interface{}) ([]string, error) {
        pod := obj.(*corev1.Pod)
        return []string{pod.Spec.NodeName}, nil
    },
})

// 使用索引查询
indexer := podInformer.GetIndexer()
podsOnNode, _ := indexer.ByIndex("byNode", "node-01")
```

## 实战 1：资源巡检工具

构建一个集群巡检工具，检测异常 Pod 和不健康的 Deployment。

### 巡检逻辑

```go
package main

import (
    "context"
    "fmt"
    "log"
    "os"
    "strings"
    "time"

    appsv1 "k8s.io/api/apps/v1"
    corev1 "k8s.io/api/core/v1"
    metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
    "k8s.io/client-go/kubernetes"
)

type InspectionReport struct {
    Timestamp       time.Time
    UnhealthyPods   []PodIssue
    DeployIssues    []DeployIssue
    TotalNamespaces int
    TotalPods       int
}

type PodIssue struct {
    Namespace   string
    Name        string
    Reason      string
    RestartCount int32
    Node        string
}

type DeployIssue struct {
    Namespace   string
    Name        string
    Desired     int32
    Ready       int32
    UpToDate    int32
    Available   int32
}

func inspectCluster(client *kubernetes.Clientset) (*InspectionReport, error) {
    ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
    defer cancel()

    report := &InspectionReport{
        Timestamp: time.Now(),
    }

    // 获取所有 namespace
    nsList, err := client.CoreV1().Namespaces().List(ctx, metav1.ListOptions{})
    if err != nil {
        return nil, fmt.Errorf("failed to list namespaces: %w", err)
    }
    report.TotalNamespaces = len(nsList.Items)

    // 检查所有 namespace 下的 Pod
    podList, err := client.CoreV1().Pods("").List(ctx, metav1.ListOptions{})
    if err != nil {
        return nil, fmt.Errorf("failed to list pods: %w", err)
    }
    report.TotalPods = len(podList.Items)

    for _, pod := range podList.Items {
        // 跳过已终止的 Pod
        if pod.Status.Phase == corev1.PodSucceeded || pod.Status.Phase == corev1.PodFailed {
            continue
        }

        // 检查 Container Status
        for _, cs := range pod.Status.ContainerStatuses {
            // CrashLoopBackOff
            if cs.State.Waiting != nil {
                reason := cs.State.Waiting.Reason
                if reason == "CrashLoopBackOff" ||
                    reason == "ImagePullBackOff" ||
                    reason == "ErrImagePull" ||
                    reason == "OOMKilled" {
                    report.UnhealthyPods = append(report.UnhealthyPods, PodIssue{
                        Namespace:    pod.Namespace,
                        Name:         pod.Name,
                        Reason:       reason + ": " + cs.State.Waiting.Message,
                        RestartCount: cs.RestartCount,
                        Node:         pod.Spec.NodeName,
                    })
                }
            }

            // 重启次数过多（超过 5 次）
            if cs.RestartCount > 5 {
                report.UnhealthyPods = append(report.UnhealthyPods, PodIssue{
                    Namespace:    pod.Namespace,
                    Name:         pod.Name,
                    Reason:       fmt.Sprintf("高频重启（%d 次）", cs.RestartCount),
                    RestartCount: cs.RestartCount,
                    Node:         pod.Spec.NodeName,
                })
            }
        }
    }

    // 检查 Deployment 副本数
    deployList, err := client.AppsV1().Deployments("").List(ctx, metav1.ListOptions{})
    if err != nil {
        return nil, fmt.Errorf("failed to list deployments: %w", err)
    }

    for _, deploy := range deployList.Items {
        desired := *deploy.Spec.Replicas
        ready := deploy.Status.ReadyReplicas
        updated := deploy.Status.UpdatedReplicas
        available := deploy.Status.AvailableReplicas

        if ready != desired || available != desired {
            report.DeployIssues = append(report.DeployIssues, DeployIssue{
                Namespace: deploy.Namespace,
                Name:      deploy.Name,
                Desired:   desired,
                Ready:     ready,
                UpToDate:  updated,
                Available: available,
            })
        }
    }

    return report, nil
}
```

### 输出巡检报告

```go
func printReport(report *InspectionReport) {
    var sb strings.Builder

    sb.WriteString("=" + strings.Repeat("=", 59) + "\n")
    sb.WriteString(fmt.Sprintf("  Kubernetes 集群巡检报告\n"))
    sb.WriteString(fmt.Sprintf("  时间: %s\n", report.Timestamp.Format("2006-01-02 15:04:05")))
    sb.WriteString("=" + strings.Repeat("=", 59) + "\n\n")

    sb.WriteString(fmt.Sprintf("集群概况: %d 个 Namespace, %d 个 Pod\n\n", report.TotalNamespaces, report.TotalPods))

    // 异常 Pod
    sb.WriteString("--- 异常 Pod ---\n")
    if len(report.UnhealthyPods) == 0 {
        sb.WriteString("  (无异常)\n")
    }
    for _, issue := range report.UnhealthyPods {
        sb.WriteString(fmt.Sprintf("  [!] %s/%s\n", issue.Namespace, issue.Name))
        sb.WriteString(fmt.Sprintf("      原因: %s\n", issue.Reason))
        sb.WriteString(fmt.Sprintf("      节点: %s  重启: %d 次\n\n", issue.Node, issue.RestartCount))
    }

    // Deployment 异常
    sb.WriteString("\n--- Deployment 副本异常 ---\n")
    if len(report.DeployIssues) == 0 {
        sb.WriteString("  (无异常)\n")
    }
    for _, issue := range report.DeployIssues {
        sb.WriteString(fmt.Sprintf("  [!] %s/%s\n", issue.Namespace, issue.Name))
        sb.WriteString(fmt.Sprintf("      期望=%d  就绪=%d  最新=%d  可用=%d\n\n",
            issue.Desired, issue.Ready, issue.UpToDate, issue.Available))
    }

    // 汇总
    sb.WriteString("\n--- 汇总 ---\n")
    sb.WriteString(fmt.Sprintf("  异常 Pod: %d\n", len(report.UnhealthyPods)))
    sb.WriteString(fmt.Sprintf("  异常 Deployment: %d\n", len(report.DeployIssues)))

    healthy := len(report.UnhealthyPods) == 0 && len(report.DeployIssues) == 0
    if healthy {
        sb.WriteString("  状态: 健康\n")
    } else {
        sb.WriteString("  状态: 存在异常，请关注\n")
    }

    fmt.Println(sb.String())
}

func main() {
    client, err := newK8sClient()
    if err != nil {
        log.Fatal(err)
    }

    report, err := inspectCluster(client)
    if err != nil {
        log.Fatal(err)
    }

    printReport(report)

    // 如果存在异常，以非零退出码退出（便于 CI 集成）
    if len(report.UnhealthyPods) > 0 || len(report.DeployIssues) > 0 {
        os.Exit(1)
    }
}
```

巡检报告输出示例：

```
============================================================
  Kubernetes 集群巡检报告
  时间: 2026-06-13 14:30:00
============================================================

集群概况: 12 个 Namespace, 187 个 Pod

--- 异常 Pod ---
  [!] production/payment-service-7d9f8c6b4-xk2lm
      原因: CrashLoopBackOff: back-off 5m0s restarting failed container
      节点: worker-node-03  重启: 23 次

  [!] staging/api-gateway-5b8d7f9c2-pq4rs
      原因: ImagePullBackOff: Back-off pulling image "registry.example.com/app:v2.3.1"
      节点: worker-node-01  重启: 0 次

--- Deployment 副本异常 ---
  [!] production/order-service
      期望=5  就绪=3  最新=5  可用=3

--- 汇总 ---
  异常 Pod: 2
  异常 Deployment: 1
  状态: 存在异常，请关注
```

### 使用 Informer 版本的巡检工具

对于大规模集群，基于 Informer 的巡检更高效：

```go
func inspectWithInformer(client *kubernetes.Clientset) {
    factory := informers.NewSharedInformerFactory(client, 10*time.Minute)

    // 注册 Pod 事件处理器，实时收集异常
    unhealthyPods := make(map[string]PodIssue)
    var mu sync.Mutex

    factory.Core().V1().Pods().Informer().AddEventHandler(cache.ResourceEventHandlerFuncs{
        AddFunc: func(obj interface{}) {
            checkPodHealth(obj.(*corev1.Pod, &mu, unhealthyPods)
        },
        UpdateFunc: func(_, newObj interface{}) {
            checkPodHealth(newObj.(*corev1.Pod, &mu, unhealthyPods)
        },
        DeleteFunc: func(obj interface{}) {
            pod := obj.(*corev1.Pod)
            mu.Lock()
            delete(unhealthyPods, fmt.Sprintf("%s/%s", pod.Namespace, pod.Name))
            mu.Unlock()
        },
    })

    stopCh := make(chan struct{})
    factory.Start(stopCh)
    factory.WaitForCacheSync(stopCh)

    fmt.Println("Informer 巡检已启动，持续监控中...")

    // 定期输出报告
    ticker := time.NewTicker(5 * time.Minute)
    defer ticker.Stop()

    for {
        select {
        case <-ticker.C:
            mu.Lock()
            fmt.Printf("\n[%s] 异常 Pod 数量: %d\n",
                time.Now().Format("15:04:05"), len(unhealthyPods))
            for key, issue := range unhealthyPods {
                fmt.Printf("  [!] %s: %s\n", key, issue.Reason)
            }
            mu.Unlock()
        case <-stopCh:
            return
        }
    }
}
```

## 实战 2：自动扩缩容工具

基于外部指标（如消息队列长度）动态调整 Deployment 副本数。这需要使用 Dynamic Client 操作 CRD 或 HPA 资源。

### 基于队列长度扩缩容

```go
package main

import (
    "context"
    "fmt"
    "log"
    "math"
    "time"

    metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
    "k8s.io/client-go/kubernetes"
)

// QueueMetrics 接口模拟消息队列指标获取
type QueueMetrics interface {
    GetMessageCount(ctx context.Context, queueName string) (int64, error)
}

// ScalerConfig 扩缩容配置
type ScalerConfig struct {
    Namespace       string
    DeploymentName  string
    QueueName       string
    MinReplicas     int32
    MaxReplicas     int32
    MessagesPerPod  int64 // 每个 Pod 处理的消息数
    CheckInterval   time.Duration
}

type QueueScaler struct {
    client  *kubernetes.Clientset
    metrics QueueMetrics
    config  ScalerConfig
}

func NewQueueScaler(client *kubernetes.Clientset, metrics QueueMetrics, config ScalerConfig) *QueueScaler {
    return &QueueScaler{
        client:  client,
        metrics: metrics,
        config:  config,
    }
}

func (s *QueueScaler) calculateDesiredReplicas(messageCount int64, currentReplicas int32) int32 {
    desired := int32(math.Ceil(float64(messageCount) / float64(s.config.MessagesPerPod)))

    if desired < s.config.MinReplicas {
        desired = s.config.MinReplicas
    }
    if desired > s.config.MaxReplicas {
        desired = s.config.MaxReplicas
    }

    // 冷却机制：避免频繁扩缩容
    // 扩容时可以激进，缩容时保守
    if desired < currentReplicas {
        // 缩容最多一次减少当前副本数的 25%
        maxScaleDown := currentReplicas - int32(math.Ceil(float64(currentReplicas)*0.75))
        if currentReplicas-desired > maxScaleDown {
            desired = currentReplicas - maxScaleDown
        }
    }

    return desired
}

func (s *QueueScaler) Run(ctx context.Context) error {
    ticker := time.NewTicker(s.config.CheckInterval)
    defer ticker.Stop()

    for {
        select {
        case <-ctx.Done():
            return ctx.Err()
        case <-ticker.C:
            if err := s.reconcile(ctx); err != nil {
                log.Printf("reconcile error: %v", err)
            }
        }
    }
}

func (s *QueueScaler) reconcile(ctx context.Context) error {
    // 获取队列消息数
    msgCount, err := s.metrics.GetMessageCount(ctx, s.config.QueueName)
    if err != nil {
        return fmt.Errorf("failed to get queue metrics: %w", err)
    }

    // 获取当前 Deployment
    deploy, err := s.client.AppsV1().Deployments(s.config.Namespace).Get(ctx, s.config.DeploymentName, metav1.GetOptions{})
    if err != nil {
        return fmt.Errorf("failed to get deployment: %w", err)
    }

    currentReplicas := *deploy.Spec.Replicas
    desiredReplicas := s.calculateDesiredReplicas(msgCount, currentReplicas)

    if desiredReplicas == currentReplicas {
        return nil
    }

    log.Printf("队列 %s: %d 条消息, %s/%s: %d -> %d 副本",
        s.config.QueueName, msgCount,
        s.config.Namespace, s.config.DeploymentName,
        currentReplicas, desiredReplicas,
    )

    // 执行扩缩容
    scale, err := s.client.AppsV1().Deployments(s.config.Namespace).GetScale(ctx, s.config.DeploymentName, metav1.GetOptions{})
    if err != nil {
        return fmt.Errorf("failed to get scale: %w", err)
    }

    scale.Spec.Replicas = desiredReplicas

    _, err = s.client.AppsV1().Deployments(s.config.Namespace).UpdateScale(
        ctx, s.config.DeploymentName, scale, metav1.UpdateOptions{},
    )
    if err != nil {
        return fmt.Errorf("failed to scale: %w", err)
    }

    return nil
}
```

### 使用 Dynamic Client 操作自定义资源

当需要读写 CRD（Custom Resource Definition）时，Dynamic Client 不需要预生成类型代码：

```go
package main

import (
    "context"
    "fmt"
    "log"
    "time"

    metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
    "k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
    "k8s.io/apimachinery/pkg/runtime/schema"
    "k8s.io/client-go/dynamic"
    "k8s.io/client-go/kubernetes/scheme"
    "k8s.io/client-go/rest"
)

func newDynamicClient() (dynamic.Interface, error) {
    config, err := rest.InClusterConfig()
    if err != nil {
        kubeconfig := filepath.Join(homedir.HomeDir(), ".kube", "config")
        config, err = clientcmd.BuildConfigFromFlags("", kubeconfig)
        if err != nil {
            return nil, err
        }
    }

    return dynamic.NewForConfig(config)
}

func listCustomResources() error {
    client, err := newDynamicClient()
    if err != nil {
        return err
    }

    // 定义 GVR（Group/Version/Resource）
    gvr := schema.GroupVersionResource{
        Group:    "sre.example.com",
        Version:  "v1alpha1",
        Resource: "inspections",
    }

    // 列出自定义资源
    list, err := client.Resource(gvr).Namespace("default").List(
        context.Background(), metav1.ListOptions{},
    )
    if err != nil {
        return fmt.Errorf("failed to list custom resources: %w", err)
    }

    for _, item := range list.Items {
        name := item.GetName()
        status, _, _ := unstructured.NestedString(item.Object, "status", "phase")
        fmt.Printf("Custom Resource: %s, Phase: %s\n", name, status)
    }

    return nil
}

// 创建自定义资源
func createCustomResource(name, namespace string, spec map[string]interface{}) error {
    client, err := newDynamicClient()
    if err != nil {
        return err
    }

    gvr := schema.GroupVersionResource{
        Group:    "sre.example.com",
        Version:  "v1alpha1",
        Resource: "inspections",
    }

    obj := &unstructured.Unstructured{
        Object: map[string]interface{}{
            "apiVersion": "sre.example.com/v1alpha1",
            "kind":       "Inspection",
            "metadata": map[string]interface{}{
                "name":      name,
                "namespace": namespace,
            },
            "spec": spec,
        },
    }

    created, err := client.Resource(gvr).Namespace(namespace).Create(
        context.Background(), obj, metav1.CreateOptions{},
    )
    if err != nil {
        return fmt.Errorf("failed to create custom resource: %w", err)
    }

    fmt.Printf("Created custom resource: %s\n", created.GetName())
    return nil
}

// 更新自定义资源状态
func updateCustomResourceStatus(name, namespace, phase, message string) error {
    client, err := newDynamicClient()
    if err != nil {
        return err
    }

    gvr := schema.GroupVersionResource{
        Group:    "sre.example.com",
        Version:  "v1alpha1",
        Resource: "inspections",
    }

    // 获取当前对象
    obj, err := client.Resource(gvr).Namespace(namespace).Get(
        context.Background(), name, metav1.GetOptions{},
    )
    if err != nil {
        return fmt.Errorf("failed to get custom resource: %w", err)
    }

    // 更新 status 字段
    if err := unstructured.SetNestedField(obj.Object, map[string]interface{}{
        "phase":   phase,
        "message": message,
    }, "status"); err != nil {
        return fmt.Errorf("failed to set status: %w", err)
    }

    // 使用 status 子资源更新
    _, err = client.Resource(gvr).Namespace(namespace).UpdateStatus(
        context.Background(), obj, metav1.UpdateOptions{},
    )
    if err != nil {
        return fmt.Errorf("failed to update status: %w", err)
    }

    return nil
}
```

## Operator 开发入门

### 什么是 Operator

Operator 是 Kubernetes 的**扩展模式**，它将运维人员的知识编码为软件。核心思想：

```
Operator = CRD（自定义资源定义）+ Controller（自定义控制器）
```

- **CRD（Custom Resource Definition）**：向 Kubernetes 注册新的资源类型，就像 Pod、Service 一样可以 `kubectl get`
- **Controller（控制器）**：持续监控 CRD 资源的变化，驱动实际状态向期望状态收敛

```
         用户创建 WebSite CR
                │
                ▼
  ┌─────────────────────┐
  │   API Server 存储    │  WebSite{spec: {image: "nginx", replicas: 3}}
  │   CRD 资源           │
  └──────────┬──────────┘
             │ Watch 事件
             ▼
  ┌─────────────────────┐
  │   Controller        │  Reconcile 循环
  │                     │  1. 读取 WebSite 资源
  │                     │  2. 检查是否存在对应 Deployment
  │                     │  3. 不存在 -> 创建 Deployment + Service
  │                     │  4. 已存在 -> 比对 spec 是否一致
  │                     │  5. 不一致 -> 更新 Deployment
  └──────────┬──────────┘
             │ 创建/更新
             ▼
  ┌─────────────────────┐
  │   Deployment + Svc  │  实际创建的 Kubernetes 原生资源
  └─────────────────────┘
```

### controller-runtime 框架

controller-runtime 是 Kubernetes SIG 团队维护的 Operator 开发框架，提供：

- **Manager**：管理所有 Controller 的生命周期，共享 Informer 和缓存
- **Controller**：Reconcile 循环的实现
- **Builder**：简化 Controller 的构建和注册
- **Scheme**：类型注册表，将 Go 类型映射到 API 资源

安装：

```bash
go get sigs.k8s.io/controller-runtime@latest
# 截至本文编写时，最新版本为 v0.20.x
```

### 项目初始化

推荐使用 kubebuilder 脚手架初始化项目：

```bash
# 安装 kubebuilder
curl -L -o kubebuilder https://go.kubebuilder.io/dl/latest/linux/amd64
chmod +x kubebuilder && mv kubebuilder /usr/local/bin/

# 初始化项目
mkdir website-operator && cd website-operator
kubebuilder init --domain sre.example.com --repo sre.example.com/website-operator

# 创建 API（CRD + Controller）
kubebuilder create api --group sre --version v1alpha1 --kind WebSite --resource --controller
```

生成的项目结构：

```
website-operator/
├── api/v1alpha1/
│   ├── website_types.go      # CRD 类型定义
│   ├── groupversion_info.go  # GroupVersion 信息
│   └── zz_generated.deepcopy.go
├── internal/controller/
│   └── website_controller.go # Controller 逻辑
├── cmd/main.go               # 入口
├── config/
│   ├── crd/                  # CRD YAML
│   ├── rbac/                 # RBAC 配置
│   ├── manager/              # Controller Manager 部署配置
│   └── samples/              # 示例资源
├── Dockerfile
├── Makefile
└── go.mod
```

### 定义 CRD：WebSite

编辑 `api/v1alpha1/website_types.go`：

```go
package v1alpha1

import (
    metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
)

// WebSiteSpec 定义期望状态
type WebSiteSpec struct {
    // 镜像地址
    Image string `json:"image"`

    // 副本数
    // +kubebuilder:default=2
    Replicas *int32 `json:"replicas"`

    // 端口号
    // +kubebuilder:default=80
    Port *int32 `json:"port"`

    // Service 类型：ClusterIP 或 NodePort 或 LoadBalancer
    // +kubebuilder:default=ClusterIP
    ServiceType string `json:"serviceType,omitempty"`
}

// WebSiteStatus 定义观测状态
type WebSiteStatus struct {
    // 就绪副本数
    ReadyReplicas int32 `json:"readyReplicas,omitempty"`

    // Service URL
    URL string `json:"url,omitempty"`

    // 条件
    Conditions []metav1.Condition `json:"conditions,omitempty"`
}

//+kubebuilder:object:root=true
//+kubebuilder:subresource:status
//+kubebuilder:subresource:scale:specpath=.spec.replicas,statuspath=.status.readyReplicas
//+kubebuilder:printcolumn:name="Image",type=string,JSONPath=`.spec.image`
//+kubebuilder:printcolumn:name="Replicas",type=integer,JSONPath=`.spec.replicas`
//+kubebuilder:printcolumn:name="Ready",type=integer,JSONPath=`.status.readyReplicas`
//+kubebuilder:printcolumn:name="Age",type=date,JSONPath=`.metadata.creationTimestamp`

// WebSite 是自定义资源
type WebSite struct {
    metav1.TypeMeta   `json:",inline"`
    metav1.ObjectMeta `json:"metadata,omitempty"`

    Spec   WebSiteSpec   `json:"spec,omitempty"`
    Status WebSiteStatus `json:"status,omitempty"`
}

//+kubebuilder:object:root=true

// WebSiteList 包含 WebSite 列表
type WebSiteList struct {
    metav1.TypeMeta `json:",inline"`
    metav1.ListMeta `json:"metadata,omitempty"`
    Items           []WebSite `json:"items"`
}

func init() {
    SchemeBuilder.Register(&WebSite{}, &WebSiteList{})
}
```

生成 CRD 清单：

```bash
make manifests
```

### 实现 Controller

编辑 `internal/controller/website_controller.go`：

```go
package controller

import (
    "context"
    "fmt"

    appsv1 "k8s.io/api/apps/v1"
    corev1 "k8s.io/api/core/v1"
    apierrors "k8s.io/apimachinery/pkg/api/errors"
    "k8s.io/apimachinery/pkg/api/resource"
    metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
    "k8s.io/apimachinery/pkg/runtime"
    "k8s.io/apimachinery/pkg/types"
    "k8s.io/utils/ptr"
    ctrl "sigs.k8s.io/controller-runtime"
    "sigs.k8s.io/controller-runtime/pkg/client"
    "sigs.k8s.io/controller-runtime/pkg/log"

    srev1alpha1 "sre.example.com/website-operator/api/v1alpha1"
)

// WebSiteReconciler 协调 WebSite 资源
type WebSiteReconciler struct {
    client.Client
    Scheme *runtime.Scheme
}

//+kubebuilder:rbac:groups=sre.example.com,resources=websites,verbs=get;list;watch;create;update;patch;delete
//+kubebuilder:rbac:groups=sre.example.com,resources=websites/status,verbs=get;update;patch
//+kubebuilder:rbac:groups=sre.example.com,resources=websites/finalizers,verbs=update
//+kubebuilder:rbac:groups=apps,resources=deployments,verbs=get;list;watch;create;update;patch;delete
//+kubebuilder:rbac:groups=core,resources=services,verbs=get;list;watch;create;update;patch;delete

// Reconcile 是核心协调循环
func (r *WebSiteReconciler) Reconcile(ctx context.Context, req ctrl.Request) (ctrl.Result, error) {
    logger := log.FromContext(ctx)

    // 1. 获取 WebSite 资源
    var website srev1alpha1.WebSite
    if err := r.Get(ctx, req.NamespacedName, &website); err != nil {
        if apierrors.IsNotFound(err) {
            logger.Info("WebSite resource not found, ignoring")
            return ctrl.Result{}, nil
        }
        return ctrl.Result{}, err
    }

    logger.Info("Reconciling WebSite", "name", website.Name, "namespace", website.Namespace)

    // 2. 确保 Deployment 存在
    deployment, err := r.reconcileDeployment(ctx, &website)
    if err != nil {
        return ctrl.Result{}, err
    }

    // 3. 确保 Service 存在
    service, err := r.reconcileService(ctx, &website)
    if err != nil {
        return ctrl.Result{}, err
    }

    // 4. 更新 WebSite 状态
    if err := r.updateStatus(ctx, &website, deployment, service); err != nil {
        return ctrl.Result{}, err
    }

    return ctrl.Result{}, nil
}

func (r *WebSiteReconciler) reconcileDeployment(ctx context.Context, website *srev1alpha1.WebSite) (*appsv1.Deployment, error) {
    logger := log.FromContext(ctx)

    desired := r.buildDeployment(website)

    var existing appsv1.Deployment
    err := r.Get(ctx, types.NamespacedName{
        Name:      desired.Name,
        Namespace: desired.Namespace,
    }, &existing)

    if apierrors.IsNotFound(err) {
        logger.Info("Creating Deployment", "name", desired.Name)
        if err := r.Create(ctx, desired); err != nil {
            return nil, fmt.Errorf("failed to create deployment: %w", err)
        }
        return desired, nil
    }

    if err != nil {
        return nil, fmt.Errorf("failed to get deployment: %w", err)
    }

    // 检查是否需要更新（比较镜像和副本数）
    needUpdate := false
    if *existing.Spec.Replicas != *desired.Spec.Replicas {
        existing.Spec.Replicas = desired.Spec.Replicas
        needUpdate = true
    }
    if existing.Spec.Template.Spec.Containers[0].Image != desired.Spec.Template.Spec.Containers[0].Image {
        existing.Spec.Template.Spec.Containers[0].Image = desired.Spec.Template.Spec.Containers[0].Image
        needUpdate = true
    }

    if needUpdate {
        logger.Info("Updating Deployment", "name", existing.Name)
        if err := r.Update(ctx, &existing); err != nil {
            return nil, fmt.Errorf("failed to update deployment: %w", err)
        }
    }

    return &existing, nil
}

func (r *WebSiteReconciler) reconcileService(ctx context.Context, website *srev1alpha1.WebSite) (*corev1.Service, error) {
    logger := log.FromContext(ctx)

    desired := r.buildService(website)

    var existing corev1.Service
    err := r.Get(ctx, types.NamespacedName{
        Name:      desired.Name,
        Namespace: desired.Namespace,
    }, &existing)

    if apierrors.IsNotFound(err) {
        logger.Info("Creating Service", "name", desired.Name)
        if err := r.Create(ctx, desired); err != nil {
            return nil, fmt.Errorf("failed to create service: %w", err)
        }
        return desired, nil
    }

    if err != nil {
        return nil, fmt.Errorf("failed to get service: %w", err)
    }

    return &existing, nil
}

func (r *WebSiteReconciler) buildDeployment(website *srev1alpha1.WebSite) *appsv1.Deployment {
    labels := map[string]string{
        "app.kubernetes.io/name":     "website",
        "app.kubernetes.io/instance": website.Name,
        "app.kubernetes.io/managed-by": "website-operator",
    }

    return &appsv1.Deployment{
        ObjectMeta: metav1.ObjectMeta{
            Name:      fmt.Sprintf("%s-web", website.Name),
            Namespace: website.Namespace,
            Labels:    labels,
            OwnerReferences: []metav1.OwnerReference{
                {
                    APIVersion: website.APIVersion,
                    Kind:       website.Kind,
                    Name:       website.Name,
                    UID:        website.UID,
                    Controller: ptr.To(true),
                },
            },
        },
        Spec: appsv1.DeploymentSpec{
            Replicas: website.Spec.Replicas,
            Selector: &metav1.LabelSelector{
                MatchLabels: labels,
            },
            Template: corev1.PodTemplateSpec{
                ObjectMeta: metav1.ObjectMeta{
                    Labels: labels,
                },
                Spec: corev1.PodSpec{
                    Containers: []corev1.Container{
                        {
                            Name:  "web",
                            Image: website.Spec.Image,
                            Ports: []corev1.ContainerPort{
                                {
                                    ContainerPort: *website.Spec.Port,
                                },
                            },
                            Resources: corev1.ResourceRequirements{
                                Requests: corev1.ResourceList{
                                    corev1.ResourceCPU:    resource.MustParse("100m"),
                                    corev1.ResourceMemory: resource.MustParse("128Mi"),
                                },
                                Limits: corev1.ResourceList{
                                    corev1.ResourceCPU:    resource.MustParse("500m"),
                                    corev1.ResourceMemory: resource.MustParse("256Mi"),
                                },
                            },
                        },
                    },
                },
            },
        },
    }
}

func (r *WebSiteReconciler) buildService(website *srev1alpha1.WebSite) *corev1.Service {
    labels := map[string]string{
        "app.kubernetes.io/name":     "website",
        "app.kubernetes.io/instance": website.Name,
        "app.kubernetes.io/managed-by": "website-operator",
    }

    return &corev1.Service{
        ObjectMeta: metav1.ObjectMeta{
            Name:      fmt.Sprintf("%s-web", website.Name),
            Namespace: website.Namespace,
            Labels:    labels,
            OwnerReferences: []metav1.OwnerReference{
                {
                    APIVersion: website.APIVersion,
                    Kind:       website.Kind,
                    Name:       website.Name,
                    UID:        website.UID,
                    Controller: ptr.To(true),
                },
            },
        },
        Spec: corev1.ServiceSpec{
            Selector: labels,
            Ports: []corev1.ServicePort{
                {
                    Port:       *website.Spec.Port,
                    TargetPort: intstr.FromInt(int(*website.Spec.Port)),
                },
            },
            Type: corev1.ServiceType(website.Spec.ServiceType),
        },
    }
}

func (r *WebSiteReconciler) updateStatus(ctx context.Context, website *srev1alpha1.WebSite, deploy *appsv1.Deployment, svc *corev1.Service) error {
    readyReplicas := deploy.Status.ReadyReplicas

    url := ""
    if svc.Spec.Type == corev1.ServiceTypeLoadBalancer && len(svc.Status.LoadBalancer.Ingress) > 0 {
        url = fmt.Sprintf("http://%s", svc.Status.LoadBalancer.Ingress[0].IP)
    } else {
        url = fmt.Sprintf("http://%s.%s.svc.cluster.local:%d",
            svc.Name, svc.Namespace, svc.Spec.Ports[0].Port)
    }

    // 只在状态变化时更新，减少 API Server 写入
    if website.Status.ReadyReplicas != readyReplicas || website.Status.URL != url {
        website.Status.ReadyReplicas = readyReplicas
        website.Status.URL = url

        if err := r.Status().Update(ctx, website); err != nil {
            return fmt.Errorf("failed to update status: %w", err)
        }
    }

    return nil
}

// SetupWithManager 注册 Controller
func (r *WebSiteReconciler) SetupWithManager(mgr ctrl.Manager) error {
    return ctrl.NewControllerManagedBy(mgr).
        For(&srev1alpha1.WebSite{}).
        Owns(&appsv1.Deployment{}).   // 监听 owned Deployment 的变化
        Owns(&corev1.Service{}).       // 监听 owned Service 的变化
        Complete(r)
}
```

### 入口文件

编辑 `cmd/main.go`：

```go
package main

import (
    "flag"
    "fmt"
    "os"

    "k8s.io/apimachinery/pkg/runtime"
    utilruntime "k8s.io/apimachinery/pkg/util/runtime"
    clientgoscheme "k8s.io/client-go/kubernetes/scheme"
    _ "k8s.io/client-go/plugin/pkg/client/auth/gcp"
    ctrl "sigs.k8s.io/controller-runtime"
    "sigs.k8s.io/controller-runtime/pkg/healthz"
    "sigs.k8s.io/controller-runtime/pkg/log/zap"
    metricsserver "sigs.k8s.io/controller-runtime/pkg/metrics/server"

    srev1alpha1 "sre.example.com/website-operator/api/v1alpha1"
    "sre.example.com/website-operator/internal/controller"
)

var (
    scheme = runtime.NewScheme()
    setupLog = ctrl.Log.WithName("setup")
)

func init() {
    utilruntime.Must(clientgoscheme.AddToScheme(scheme))
    utilruntime.Must(srev1alpha1.AddToScheme(scheme))
}

func main() {
    var metricsAddr string
    var enableLeaderElection bool
    var probeAddr string

    flag.StringVar(&metricsAddr, "metrics-bind-address", ":8080", "metrics server address")
    flag.StringVar(&probeAddr, "health-probe-bind-address", ":8081", "health probe address")
    flag.BoolVar(&enableLeaderElection, "leader-elect", false, "enable leader election")
    flag.Parse()

    opts := zap.Options{
        Development: true,
    }
    ctrl.SetLogger(zap.New(zap.UseFlagOptions(&opts)))

    mgr, err := ctrl.NewManager(ctrl.GetConfigOrDie(), ctrl.Options{
        Scheme:                 scheme,
        Metrics:                metricsserver.Options{BindAddress: metricsAddr},
        HealthProbeBindAddress: probeAddr,
        LeaderElection:         enableLeaderElection,
        LeaderElectionID:       "website-operator.sre.example.com",
    })
    if err != nil {
        setupLog.Error(err, "unable to start manager")
        os.Exit(1)
    }

    if err = (&controller.WebSiteReconciler{
        Client: mgr.GetClient(),
        Scheme: mgr.GetScheme(),
    }).SetupWithManager(mgr); err != nil {
        setupLog.Error(err, "unable to create controller", "controller", "WebSite")
        os.Exit(1)
    }

    // 健康检查
    if err := mgr.AddHealthzCheck("healthz", healthz.Ping); err != nil {
        setupLog.Error(err, "unable to set up health check")
        os.Exit(1)
    }
    if err := mgr.AddReadyzCheck("readyz", healthz.Ping); err != nil {
        setupLog.Error(err, "unable to set up ready check")
        os.Exit(1)
    }

    setupLog.Info("starting manager")
    if err := mgr.Start(ctrl.SetupSignalHandler()); err != nil {
        setupLog.Error(err, "problem running manager")
        os.Exit(1)
    }
}
```

### 使用 Operator

安装 CRD 后，创建一个 WebSite 资源：

```yaml
# config/samples/sre_v1alpha1_website.yaml
apiVersion: sre.example.com/v1alpha1
kind: WebSite
metadata:
  name: my-blog
  namespace: default
spec:
  image: "nginx:1.27"
  replicas: 3
  port: 80
  serviceType: ClusterIP
```

```bash
# 安装 CRD
make install

# 本地运行 Controller（开发模式）
make run

# 另一个终端，创建资源
kubectl apply -f config/samples/sre_v1alpha1_website.yaml

# 查看创建的资源
kubectl get website
# NAME       IMAGE        REPLICAS   READY   AGE
# my-blog    nginx:1.27   3          3       30s

kubectl get deployment
# NAME             READY   UP-TO-DATE   AVAILABLE   AGE
# my-blog-web      3/3     3            3           30s

kubectl get svc
# NAME             TYPE        CLUSTER-IP       EXTERNAL-IP   PORT(S)   AGE
# my-blog-web      ClusterIP   10.96.142.28     <none>        80/TCP    30s

# 查看 WebSite 状态
kubectl describe website my-blog
# Status:
#   Ready Replicas:  3
#   URL:             http://my-blog-web.default.svc.cluster.local:80
```

修改副本数，观察 Operator 自动更新 Deployment：

```bash
kubectl patch website my-blog --type merge -p '{"spec":{"replicas":5}}'
# deployment.apps/my-blog-web scaled
```

删除 WebSite 资源，关联的 Deployment 和 Service 会被自动清理（因为设置了 OwnerReferences）：

```bash
kubectl delete website my-blog
```

## Operator 最佳实践

### 最终一致性

Operator 的核心设计原则是**最终一致性**：不保证任何时刻状态一致，但保证系统最终会收敛到期望状态。Reconcile 循环应该是**幂等的**——同一个输入执行多次结果相同。

```go
// 错误示范：非幂等操作
func (r *Reconciler) Reconcile(ctx context.Context, req ctrl.Request) (ctrl.Result, error) {
    // 每次都创建，导致重复资源
    r.Create(ctx, buildResource())
    return ctrl.Result{}, nil
}

// 正确做法：先检查再创建
func (r *Reconciler) Reconcile(ctx context.Context, req ctrl.Request) (ctrl.Result, error) {
    var obj appsv1.Deployment
    err := r.Get(ctx, namespacedName, &obj)
    if apierrors.IsNotFound(err) {
        return r.handleCreate(ctx, resource) // 不存在则创建
    }
    if err != nil {
        return ctrl.Result{}, err
    }
    return r.handleUpdate(ctx, &obj, desired) // 已存在则比对更新
}
```

### Reconcile 循环设计要点

**1. 读取期望状态 -> 观测实际状态 -> 计算差异 -> 执行动作**

```go
func (r *Reconciler) Reconcile(ctx context.Context, req ctrl.Request) (ctrl.Result, error) {
    // Step 1: 获取期望状态（CRD Spec）
    website, err := r.getDesiredState(ctx, req)
    if err != nil {
        return ctrl.Result{}, client.IgnoreNotFound(err)
    }

    // Step 2: 观测实际状态
    actualState, err := r.observeActualState(ctx, website)
    if err != nil {
        return ctrl.Result{}, err
    }

    // Step 3: 计算差异并执行动作
    if err := r.reconcile(ctx, website, actualState); err != nil {
        return ctrl.Result{}, err
    }

    // Step 4: 更新状态
    if err := r.updateStatus(ctx, website, actualState); err != nil {
        return ctrl.Result{}, err
    }

    // Step 5: 如果未就绪，安排重新排队
    if !isReady(website) {
        return ctrl.Result{RequeueAfter: 10 * time.Second}, nil
    }

    return ctrl.Result{}, nil
}
```

**2. 合理使用 RequeueAfter**

- 资源正在创建中（Pod 未就绪）：`RequeueAfter: 5 * time.Second`
- 等待外部操作完成（DNS 注册、证书签发）：`RequeueAfter: 30 * time.Second`
- 一切正常：不重新排队，等待 Watch 事件触发

**3. 错误处理策略**

```go
func (r *Reconciler) Reconcile(ctx context.Context, req ctrl.Request) (ctrl.Result, error) {
    err := r.doReconcile(ctx, req)

    if err == nil {
        return ctrl.Result{}, nil
    }

    // 可重试的错误：网络超时、API Server 不可达
    if isTransientError(err) {
        // 指数退避重试
        return ctrl.Result{RequeueAfter: computeBackoff(req)}, nil
    }

    // 不可重试的错误：配置错误、资源不存在
    // 记录事件并停止重试
    log.FromContext(ctx).Error(err, "permanent error")
    return ctrl.Result{}, nil
}
```

### 状态管理

**1. 只在状态变化时更新**

```go
func (r *Reconciler) updateStatusIfNeeded(ctx context.Context, website *srev1alpha1.WebSite, newStatus srev1alpha1.WebSiteStatus) error {
    if equality.Semantic.DeepEqual(website.Status, newStatus) {
        return nil // 状态未变化，跳过更新
    }

    website.Status = newStatus
    return r.Status().Update(ctx, website)
}
```

**2. 使用 Conditions 表达详细状态**

```go
func setCondition(website *srev1alpha1.WebSite, conditionType string, status metav1.ConditionStatus, reason, message string) {
    condition := metav1.Condition{
        Type:    conditionType,
        Status:  status,
        Reason:  reason,
        Message: message,
    }

    meta.SetStatusCondition(&website.Status.Conditions, condition)
}

// 使用
setCondition(website, "Available", metav1.ConditionTrue, "DeploymentReady", "Deployment has minimum availability")
setCondition(website, "Progressing", metav1.ConditionTrue, "NewReplicaSetAvailable", "ReplicaSet is progressing")
```

**3. 使用 OwnerReferences 管理资源生命周期**

```go
// 设置 OwnerReference，确保 CR 删除时级联删除关联资源
metav1.SetOwnerReferences(
    &obj.ObjectMeta,
    []metav1.OwnerReference{{
        APIVersion: website.APIVersion,
        Kind:       website.Kind,
        Name:       website.Name,
        UID:        website.UID,
        Controller: ptr.To(true),
    }},
)
```

### 其他实践

| 实践 | 说明 |
|------|------|
| **Leader Election** | 多副本部署时，只有一个实例执行 Reconcile |
| **限流保护** | 使用 `rate.NewLimiter` 限制 API 调用频率 |
| **事件记录** | 使用 `record.Eventf` 记录操作事件，方便 `kubectl describe` 查看 |
| **Finalizer** | 删除前执行清理操作（如释放外部资源） |
| **Webhook** | 对 CRD 做 Validate 和 Default 注入 |
| **可观测性** | 暴露 Prometheus 指标（Reconcile 次数、耗时、错误率） |

### 完整项目构建与部署

```bash
# 生成代码和清单
make generate
make manifests

# 构建镜像
make docker-build IMG=registry.example.com/website-operator:v1.0.0

# 推送镜像
make docker-push IMG=registry.example.com/website-operator:v1.0.0

# 部署到集群
make deploy IMG=registry.example.com/website-operator:v1.0.0

# 查看运行状态
kubectl get pods -n website-operator-system
kubectl logs -n website-operator-system deployment/website-operator-controller-manager
```

## 总结

本文从 client-go 基础操作出发，逐步构建了完整的 Kubernetes Go 开发能力体系：

| 层级 | 工具 | 场景 |
|------|------|------|
| **基础操作** | client-go Typed Client | CRUD 原生资源（Pod/Deployment/Service） |
| **实时感知** | Informer + Lister | 事件驱动、本地缓存、高性能查询 |
| **动态资源** | Dynamic Client | 操作 CRD，无需预生成代码 |
| **平台扩展** | controller-runtime + CRD | 构建自定义控制器和 Operator |

核心要点：

- client-go 是所有 Go 语言 Kubernetes 工具的基石，掌握 Typed Client 和 Informer 是基本功
- Operator 的本质是声明式 API + 控制器模式：用户声明期望状态，控制器驱动实际状态收敛
- Reconcile 循环必须是幂等的、无副作用的，依赖 Watch + Requeue 机制驱动
- 生产环境必须关注 Leader Election、Finalizer、RBAC 和可观测性

下一步可以深入的方向：Kubernetes Webhook（Validating/Admission）、自定义 Metrics Adapter、以及使用 Helm/ArgoCD 管理 Operator 的生命周期。
