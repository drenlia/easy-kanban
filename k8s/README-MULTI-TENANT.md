# Easy Kanban Multi-Tenant Kubernetes Deployment

This directory contains the multi-tenant deployment scripts for Easy Kanban, allowing you to deploy multiple customer instances on the same Kubernetes cluster.

## Overview

The multi-tenant deployment system creates isolated instances for each customer with:
- **Unique namespaces**: Each instance gets its own namespace (`easy-kanban-{instance_name}`)
- **Dynamic hostnames**: Instances are accessible at `{instance_name}.ezkan.cloud`
- **Instance-specific configuration**: Each instance has its own token for admin portal access
- **Isolated resources**: Redis, application, and services are isolated per instance

## Scripts

### `deploy.sh` - Main Deployment Script
The core deployment script that handles the Kubernetes resource creation.

**Usage:**
```bash
./deploy.sh <instance_name> <instance_token>
```

**Parameters:**
- `instance_name`: The instance hostname (e.g., `my-company`)
- `instance_token`: Token for admin portal database access

**Example:**
```bash
./deploy.sh my-company kanban-token-12345
```

This creates an instance accessible at: `https://my-company.ezkan.cloud`

### `deploy-instance.sh` - Wrapper Script with JSON Output
A wrapper script that provides structured JSON output for programmatic use.

**Usage:**
```bash
./deploy-instance.sh <instance_name> <instance_token>
```

**Output:**
```json
{
  "status": "success",
  "instance_name": "my-company",
  "namespace": "easy-kanban-my-company",
  "hostname": "my-company.ezkan.cloud",
  "external_ip": "192.168.1.100:30001",
  "instance_token": "kanban-token-12345",
  "access_url": "https://my-company.ezkan.cloud",
  "management_commands": {
    "view_logs": "kubectl logs -f deployment/easy-kanban -n easy-kanban-my-company",
    "delete_instance": "kubectl delete namespace easy-kanban-my-company",
    "scale_replicas": "kubectl scale deployment easy-kanban --replicas=3 -n easy-kanban-my-company"
  }
}
```

## Instance Name Validation

Instance names must follow these rules:
- Only lowercase letters, numbers, and hyphens
- Must start and end with alphanumeric characters
- Examples: `my-company`, `acme-corp`, `test123`

## Generated Resources

For each instance, the following Kubernetes resources are created:

### Namespace
- Name: `easy-kanban-{instance_name}`
- Isolates all resources for the instance

### Redis Deployment & Service
- Deployment: `redis` in namespace `easy-kanban-{instance_name}`
- Service: `redis` (ClusterIP) for internal communication

### Application Deployment
- Deployment: `easy-kanban` in namespace `easy-kanban-{instance_name}`
- ConfigMap: `easy-kanban-config` with instance-specific settings
- Includes the `INSTANCE_TOKEN` environment variable

### Services
- `easy-kanban-service` (ClusterIP) - Internal service
- `easy-kanban-nodeport` (NodePort) - External access fallback

### Ingress
- `easy-kanban-ingress` with hostname `{instance_name}.ezkan.cloud`
- Routes traffic to the application service

## Environment Variables

Each instance gets these environment variables via ConfigMap:
- `NODE_ENV`: "production"
- `DOCKER_ENV`: "true"
- `PORT`: "3222"
- `VITE_API_URL`: "http://localhost:3222"
- `REDIS_URL`: "redis://redis:6379"
- `DEMO_ENABLED`: "false"
- `INSTANCE_TOKEN`: The provided instance token

## Access Methods

### Primary Access (Recommended)
- **URL**: `https://{instance_name}.ezkan.cloud`
- **Method**: Ingress with TLS (requires ingress controller and DNS setup)

### Direct Access (Fallback)
- **URL**: `http://{node_ip}:{nodeport}`
- **Method**: NodePort service (exposed on all cluster nodes)

## Management Commands

### View Logs
```bash
kubectl logs -f deployment/easy-kanban -n easy-kanban-{instance_name}
```

### Scale Replicas
```bash
kubectl scale deployment easy-kanban --replicas=3 -n easy-kanban-{instance_name}
```

### Delete Instance
```bash
kubectl delete namespace easy-kanban-{instance_name}
```

### List All Instances
```bash
kubectl get namespaces | grep easy-kanban-
```

## Prerequisites

1. **Kubernetes Cluster**: Accessible via `kubectl`
2. **Ingress Controller**: NGINX Ingress Controller recommended
3. **DNS Configuration**: Wildcard DNS for `*.ezkan.cloud` pointing to your cluster
4. **TLS Certificates**: For HTTPS access (can be managed by cert-manager)

## Security Considerations

- Each instance is isolated in its own namespace
- Instance tokens are stored as environment variables (consider using Kubernetes secrets for production)
- Redis data is stored in emptyDir volumes (consider persistent volumes for production)
- TLS termination at the ingress level

## Troubleshooting

### Check Instance Status
```bash
kubectl get all -n easy-kanban-{instance_name}
```

### Check Ingress Status
```bash
kubectl get ingress -n easy-kanban-{instance_name}
```

### Check Pod Logs
```bash
kubectl logs -f deployment/easy-kanban -n easy-kanban-{instance_name}
```

### Check Service Endpoints
```bash
kubectl get endpoints -n easy-kanban-{instance_name}
```

## Production Considerations

1. **Persistent Storage**: Replace emptyDir volumes with persistent volumes for data persistence
2. **Resource Limits**: Adjust CPU and memory limits based on your requirements
3. **Monitoring**: Add monitoring and logging for each instance
4. **Backup Strategy**: Implement backup procedures for instance data
5. **Security**: Use Kubernetes secrets for sensitive data instead of ConfigMaps
6. **High Availability**: Consider multiple replicas and pod anti-affinity rules
