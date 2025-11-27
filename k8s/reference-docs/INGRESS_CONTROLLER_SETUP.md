# Ingress Controller Setup for File Uploads

## Problem

The ingress-nginx controller has a default `client_max_body_size` of **1MB**, which blocks file uploads larger than 1MB with a `413 (Content Too Large)` error, even if the ingress annotation `nginx.ingress.kubernetes.io/proxy-body-size: "100m"` is set.

## Solution

The ingress controller's global ConfigMap must be patched to increase the body size limit. This is a **one-time setup** that needs to be done after installing the ingress controller.

## Quick Setup

Run the setup script:

```bash
./k8s/setup-ingress-controller.sh
```

This script will:
1. Check if the ingress-nginx namespace and ConfigMap exist
2. Patch the ConfigMap to set `client-max-body-size: 100m` and `proxy-body-size: 100m`
3. Restart the ingress controller pod to apply changes
4. Verify the configuration

## Manual Setup

If you prefer to do it manually:

```bash
# Patch the ConfigMap
kubectl patch configmap ingress-nginx-controller -n ingress-nginx --type merge -p '{"data":{"client-max-body-size":"100m","proxy-body-size":"100m"}}'

# Restart the ingress controller pod
kubectl delete pod -n ingress-nginx -l app.kubernetes.io/component=controller
```

## Verification

Check that the configuration is applied:

```bash
# Check ConfigMap
kubectl get configmap ingress-nginx-controller -n ingress-nginx -o yaml | grep -E "client-max-body-size|proxy-body-size"

# Verify in nginx.conf (inside the pod)
kubectl exec -n ingress-nginx -l app.kubernetes.io/component=controller -- cat /etc/nginx/nginx.conf | grep client_max_body_size
```

You should see `client_max_body_size 100m;` in the nginx configuration.

## When to Run This

- **After installing ingress-nginx** for the first time
- **After rebuilding the Kubernetes cluster**
- **After reinstalling ingress-nginx**

## Why This Is Needed

The ingress controller's ConfigMap is managed separately from individual ingress resources. Even though `k8s/ingress.yaml` has the annotation `nginx.ingress.kubernetes.io/proxy-body-size: "100m"`, the global ConfigMap setting takes precedence and defaults to 1MB.

## Notes

- This setting is persistent in the ConfigMap and will survive pod restarts
- The setting applies globally to all ingresses using this controller
- If you need a different limit, modify the values in `setup-ingress-controller.sh`

