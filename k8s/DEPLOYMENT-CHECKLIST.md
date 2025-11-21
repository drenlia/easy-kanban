# Easy Kanban Multi-Tenant Deployment Checklist

## Prerequisites for New System

### 1. Kubernetes Cluster Setup
- [ ] Kubernetes cluster running (k3s, minikube, or full k8s)
- [ ] `kubectl` configured and working
- [ ] Ingress controller installed (nginx recommended)
- [ ] **Configure ingress controller for file uploads** (REQUIRED):
  ```bash
  ./k8s/setup-ingress-controller.sh
  ```
  This sets `client-max-body-size: 100m` in the ingress controller ConfigMap to allow file uploads up to 100MB.

### 2. Storage Setup (Automated)
- [ ] Run storage setup:
  ```bash
  ./setup-storage.sh
  ```
- [ ] Create storage class:
  ```bash
  kubectl apply -f storage-class.yaml
  ```

### 3. Docker Image
- [ ] Build the Docker image:
  ```bash
  docker build -f Dockerfile.prod -t easy-kanban:latest .
  ```
- [ ] Import image to Kubernetes:
  ```bash
  docker save easy-kanban:latest | sudo ctr -n k8s.io images import -
  ```

### 4. Required Template Files
- [ ] `namespace.yaml`
- [ ] `redis-deployment.yaml`
- [ ] `configmap.yaml`
- [ ] `app-deployment.yaml`
- [ ] `service.yaml`
- [ ] `ingress.yaml`
- [ ] `persistent-volume-template.yaml`
- [ ] `persistent-volume-attachments-template.yaml`
- [ ] `persistent-volume-avatars-template.yaml`
- [ ] `persistent-volume-claim.yaml`
- [ ] `persistent-volume-claim-attachments.yaml`
- [ ] `persistent-volume-claim-avatars.yaml`
- [ ] `storage-class.yaml`
- [ ] `deploy.sh`
- [ ] `deploy-instance.sh`

### 5. Optional Files
- [ ] `resource-quota.yaml` (for resource limits)
- [ ] `manage-instances.sh` (for instance management)

## Deployment Command
```bash
./deploy-instance.sh <instance_name> <instance_token> <plan>
```

## Example
```bash
./deploy-instance.sh my-company kanban-token-12345 basic
```

## What Happens Automatically
- ✅ Creates storage directories: `/data/easy-kanban-pv/easy-kanban-{instance}-{data|attachments|avatars}`
- ✅ Creates PersistentVolumes with correct paths
- ✅ Creates PersistentVolumeClaims
- ✅ Deploys application with persistent storage
- ✅ Returns JSON with storage paths

## Post-Deployment
- [ ] Verify pod is running: `kubectl get pods -n easy-kanban-<instance_name>`
- [ ] Check PVCs are bound: `kubectl get pvc -n easy-kanban-<instance_name>`
- [ ] Check storage directories: `ls -la /data/easy-kanban-pv/easy-kanban-<instance>-*`
- [ ] Test access: `https://<instance_name>.ezkan.cloud`
