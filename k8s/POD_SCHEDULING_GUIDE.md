# Kubernetes Pod Scheduling Guide

## How Kubernetes Decides Where to Deploy Pods

Kubernetes uses a **scheduler** component that automatically decides which node should run each pod. The scheduler runs as a system pod and makes decisions based on several factors.

## The Scheduling Process

### 1. **Scheduler Component**

The Kubernetes scheduler is a control plane component that:
- Watches for newly created pods with no assigned node
- Evaluates all nodes to find the best fit
- Binds the pod to the selected node
- The kubelet on that node then starts the container

### 2. **Scheduling Decision Factors**

The scheduler considers these factors (in order):

#### **Required (Must Pass)**
1. **Node Resources**: CPU and memory requests must be available
2. **Node Selectors**: If pod has `nodeSelector`, node must match
3. **Taints & Tolerations**: Pod must tolerate node taints
4. **Affinity Rules**: Pod/node affinity must be satisfied
5. **Volume Availability**: Required volumes (like NFS) must be accessible

#### **Scoring (Best Fit)**
1. **Resource Balance**: Prefers nodes with balanced resource usage
2. **Least Requested**: Prefers nodes with fewer requested resources
3. **Most Requested**: (Optional) Can prefer nodes with more resources
4. **Inter-pod Affinity**: Prefers nodes with related pods
5. **Inter-pod Anti-affinity**: Avoids nodes with conflicting pods

## Current Cluster Status

### Node Resource Usage

**k8s (Control Plane)**:
- CPU: 1800m requested (45% of capacity)
- Memory: 1646Mi requested (16% of capacity)
- Currently running: easy-kanban, nfs-server, redis

**k8s2 (Worker)**:
- CPU: 100m requested (2% of capacity)
- Memory: 50Mi requested (0% of capacity)
- Currently running: System pods only

### Current Pod Distribution

All application pods are currently on `k8s` because:
1. When they were created, k8s2 didn't exist yet
2. The scheduler placed them on the only available node
3. Kubernetes doesn't automatically move running pods

## How to Control Pod Placement

### Method 1: Node Selectors (Simple)

Force pods to run on a specific node:

```yaml
spec:
  nodeSelector:
    kubernetes.io/hostname: k8s2
```

### Method 2: Node Affinity (Flexible)

More flexible than node selectors:

```yaml
spec:
  affinity:
    nodeAffinity:
      requiredDuringSchedulingIgnoredDuringExecution:
        nodeSelectorTerms:
        - matchExpressions:
          - key: kubernetes.io/hostname
            operator: In
            values:
            - k8s2
```

**Prefer** a node (but allow others):

```yaml
spec:
  affinity:
    nodeAffinity:
      preferredDuringSchedulingIgnoredDuringExecution:
      - weight: 100
        preference:
          matchExpressions:
          - key: kubernetes.io/hostname
            operator: In
            values:
            - k8s2
```

### Method 3: Taints and Tolerations

**Prevent** pods from running on a node (unless they tolerate):

```bash
# Taint k8s to prevent new pods (except system pods)
kubectl taint node k8s node-role.kubernetes.io/control-plane:NoSchedule

# Your deployment already has this toleration:
tolerations:
- key: node-role.kubernetes.io/control-plane
  operator: Exists
  effect: NoSchedule
```

### Method 4: Pod Affinity/Anti-Affinity

**Run pods together** (affinity):

```yaml
spec:
  affinity:
    podAffinity:
      requiredDuringSchedulingIgnoredDuringExecution:
      - labelSelector:
          matchExpressions:
          - key: app
            operator: In
            values:
            - easy-kanban
        topologyKey: kubernetes.io/hostname
```

**Spread pods apart** (anti-affinity):

```yaml
spec:
  affinity:
    podAntiAffinity:
      preferredDuringSchedulingIgnoredDuringExecution:
      - weight: 100
        podAffinityTerm:
          labelSelector:
            matchExpressions:
            - key: app
              operator: In
              values:
              - easy-kanban
          topologyKey: kubernetes.io/hostname
```

## Example: Distribute Pods Across Nodes

### Option A: Scale Deployment (Automatic Distribution)

When you scale a deployment, new pods will be scheduled based on available resources:

```bash
kubectl scale deployment easy-kanban -n easy-kanban --replicas=2
```

The scheduler will likely place the new pod on k8s2 because:
- k8s2 has more available resources (98% CPU, 100% memory free)
- k8s is more loaded (55% CPU, 84% memory used)

### Option B: Add Pod Anti-Affinity (Spread Pods)

Update your deployment to spread pods across nodes:

```yaml
spec:
  template:
    spec:
      affinity:
        podAntiAffinity:
          preferredDuringSchedulingIgnoredDuringExecution:
          - weight: 100
            podAffinityTerm:
              labelSelector:
                matchExpressions:
                - key: app
                  operator: In
                  values:
                  - easy-kanban
              topologyKey: kubernetes.io/hostname
```

This tells Kubernetes: "Prefer to run pods on different nodes if possible"

### Option C: Force Pods to Worker Node

If you want all new pods on k8s2:

```yaml
spec:
  template:
    spec:
      nodeSelector:
        node-role.kubernetes.io/worker: worker
```

## Testing Scheduling

### 1. Check Current Pod Distribution

```bash
kubectl get pods -n easy-kanban -o wide
```

### 2. Scale Deployment to See Scheduling

```bash
# Scale up
kubectl scale deployment easy-kanban -n easy-kanban --replicas=2

# Watch where new pod is scheduled
kubectl get pods -n easy-kanban -o wide -w
```

### 3. Check Scheduler Decisions

```bash
# View events to see why a pod was scheduled on a node
kubectl describe pod <pod-name> -n easy-kanban | grep Events -A 10
```

### 4. Test Node Selector

```bash
# Create a test pod on k8s2
kubectl run test-pod --image=nginx --restart=Never \
  --overrides='{"spec": {"nodeSelector": {"kubernetes.io/hostname": "k8s2"}}}'

# Verify it's on k8s2
kubectl get pod test-pod -o wide

# Cleanup
kubectl delete pod test-pod
```

## Current Deployment Behavior

Your current `app-deployment.yaml` has:

```yaml
tolerations:
- key: node-role.kubernetes.io/control-plane
  operator: Exists
  effect: NoSchedule
```

This means:
- ✅ Pods **CAN** run on the control plane (k8s)
- ✅ Pods **CAN** also run on worker nodes (k8s2)
- The scheduler will choose based on resource availability

## Recommendations

### For Your Setup

1. **Let scheduler decide automatically** (current approach):
   - Works well for most cases
   - Scheduler balances load
   - New pods will go to k8s2 (more resources available)

2. **Add pod anti-affinity** (recommended for high availability):
   - Spreads pods across nodes
   - Better fault tolerance
   - Example: If k8s goes down, pods on k8s2 keep running

3. **Use node selectors** (if you want control):
   - Force pods to specific nodes
   - Useful for dedicated workloads
   - Example: Database pods always on k8s2

## Quick Commands

```bash
# See all nodes and their resources
kubectl top nodes

# See pod distribution
kubectl get pods --all-namespaces -o wide | grep -v kube-system

# Check why a pod is on a specific node
kubectl describe pod <pod-name> -n easy-kanban | grep -A 5 "Node:"

# View scheduler events
kubectl get events -n easy-kanban --sort-by='.lastTimestamp' | grep -i schedule
```

## Summary

- **Kubernetes scheduler automatically decides** where pods go
- **Considers**: Resources, selectors, taints, affinity rules
- **Prefers**: Nodes with available resources and balanced load
- **You can influence** with node selectors, affinity, taints
- **Current state**: All pods on k8s, but k8s2 is ready and will get new pods

