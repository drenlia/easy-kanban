# Socket.IO Sticky Sessions Configuration

## Overview

Sticky sessions for Socket.IO are configured in the **easy-kanban namespace** using **NGINX Ingress Controller annotations** on the `easy-kanban-websocket-ingress` Ingress resource. This ensures all Socket.IO requests from the same client are routed to the same pod, which is critical for Socket.IO's session management.

## Configuration Location

### Primary Configuration File
- **File**: `k8s/ingress-websocket.yaml`
- **Resource**: `Ingress` named `easy-kanban-websocket-ingress`
- **Namespace**: `easy-kanban`

### Dynamic Configuration
- **Script**: `k8s/deploy.sh` (lines 714-820)
- Creates/updates the WebSocket ingress when deploying new tenant instances

## Sticky Session Annotations

The sticky sessions are configured using the following NGINX Ingress Controller annotations:

```yaml
annotations:
  # Enable cookie-based sticky sessions
  nginx.ingress.kubernetes.io/affinity: "cookie"
  
  # Use persistent affinity mode (cookie persists across browser sessions)
  nginx.ingress.kubernetes.io/affinity-mode: "persistent"
  
  # Custom cookie name for Socket.IO routing
  nginx.ingress.kubernetes.io/session-cookie-name: "socket-io-route"
  
  # Cookie expiration (2 days = 172800 seconds)
  nginx.ingress.kubernetes.io/session-cookie-expires: "172800"
  
  # Cookie max age (2 days = 172800 seconds)
  nginx.ingress.kubernetes.io/session-cookie-max-age: "172800"
  
  # Cookie path (applies to all paths)
  nginx.ingress.kubernetes.io/session-cookie-path: "/"
  
  # Cookie SameSite attribute (Lax = allows cross-site requests with GET)
  nginx.ingress.kubernetes.io/session-cookie-samesite: "Lax"
```

## How It Works

### 1. **Initial Request**
When a client first connects to `/socket.io/`:
- NGINX Ingress Controller receives the request
- No cookie exists yet, so NGINX selects a pod using round-robin
- NGINX sets a cookie: `socket-io-route=<pod-identifier>`
- Cookie is sent to the client in the response

### 2. **Subsequent Requests**
When the same client makes subsequent Socket.IO requests:
- Client sends the `socket-io-route` cookie with the request
- NGINX reads the cookie and routes the request to the same pod
- This ensures all Socket.IO polling requests and WebSocket upgrades go to the same pod

### 3. **Cookie Persistence**
- **Expires**: 2 days (172800 seconds)
- **Max-Age**: 2 days (172800 seconds)
- **Path**: `/` (applies to all paths)
- **SameSite**: `Lax` (allows cross-site GET requests, blocks cross-site POST)

## Why Sticky Sessions Are Needed

### Socket.IO Session Management
Socket.IO uses a session-based connection model:
1. **Initial handshake**: Client sends polling request, server creates session
2. **Session storage**: Session stored in pod's memory (or Redis adapter)
3. **Subsequent requests**: Must go to the same pod to access the session
4. **WebSocket upgrade**: Must happen on the same pod that created the session

### Multi-Pod Deployment
With multiple pods (e.g., 5 replicas):
- **Without sticky sessions**: Requests could be load-balanced to different pods
- **Problem**: Session not found → Connection fails
- **With sticky sessions**: All requests go to the same pod → Session found → Connection works

## Additional WebSocket Configuration

The ingress also includes WebSocket-specific timeouts:

```yaml
annotations:
  # Long timeout for WebSocket connections (1 hour)
  nginx.ingress.kubernetes.io/proxy-read-timeout: "3600"
  nginx.ingress.kubernetes.io/proxy-send-timeout: "3600"
  
  # Preserve Host header for tenant routing
  nginx.ingress.kubernetes.io/use-forwarded-headers: "true"
```

## Verification

### Check Current Configuration
```bash
kubectl get ingress easy-kanban-websocket-ingress -n easy-kanban -o yaml
```

### Verify Cookie in Browser
1. Open browser DevTools → Application → Cookies
2. Look for cookie: `socket-io-route`
3. Value should be a pod identifier (e.g., `POD1` or similar)

### Test Sticky Sessions
1. Connect to Socket.IO from a tenant (e.g., `test1.ezkan.cloud`)
2. Check which pod is handling the connection:
   ```bash
   kubectl logs -n easy-kanban -l app=easy-kanban --tail=100 | grep "Client connected"
   ```
3. Make multiple Socket.IO requests
4. Verify all requests are logged by the same pod

## Service Configuration

The sticky sessions work with the `easy-kanban-service` Service:

```yaml
apiVersion: v1
kind: Service
metadata:
  name: easy-kanban-service
  namespace: easy-kanban
spec:
  selector:
    app: easy-kanban
    component: frontend
  ports:
  - name: frontend
    port: 80
    targetPort: 3010
  type: ClusterIP
```

**Note**: The Service itself does NOT configure sticky sessions. Sticky sessions are configured at the **Ingress level**, not the Service level.

## Redis Adapter (Additional Session Sharing)

While sticky sessions ensure requests go to the same pod, the **Redis adapter** provides additional session sharing:

- **Purpose**: Share Socket.IO sessions across pods (for multi-pod deployments)
- **Configuration**: `server/services/websocketService.js` (lines 59-93)
- **Why both?**: 
  - Sticky sessions: Ensure client requests go to the same pod (better performance)
  - Redis adapter: Fallback if pod fails or for cross-pod broadcasts

## Configuration Summary

| Component | Configuration | Purpose |
|-----------|--------------|---------|
| **Ingress** | `nginx.ingress.kubernetes.io/affinity: "cookie"` | Enable sticky sessions |
| **Ingress** | `nginx.ingress.kubernetes.io/affinity-mode: "persistent"` | Cookie persists across sessions |
| **Ingress** | `nginx.ingress.kubernetes.io/session-cookie-name: "socket-io-route"` | Custom cookie name |
| **Ingress** | Cookie expires/max-age: 2 days | Cookie lifetime |
| **Service** | `easy-kanban-service` (ClusterIP) | Routes to pods |
| **Application** | Redis adapter (optional) | Cross-pod session sharing |

## Troubleshooting

### Issue: Socket.IO connections fail intermittently
**Possible cause**: Sticky sessions not working
**Solution**: 
1. Verify ingress annotations are applied
2. Check cookie is being set in browser
3. Verify cookie is being sent with requests

### Issue: Cookie not persisting
**Possible cause**: Cookie SameSite or expiration settings
**Solution**: 
1. Check `session-cookie-samesite` is set to `Lax` or `None`
2. Verify `session-cookie-expires` and `session-cookie-max-age` are set

### Issue: Requests going to different pods
**Possible cause**: Cookie not being sent or invalid
**Solution**:
1. Check browser DevTools → Network → Request Headers for `Cookie: socket-io-route=...`
2. Verify ingress is reading the cookie correctly

## References

- **NGINX Ingress Controller**: [Session Affinity Documentation](https://kubernetes.github.io/ingress-nginx/examples/affinity/cookie/)
- **Socket.IO**: [Scaling to Multiple Nodes](https://socket.io/docs/v4/using-multiple-nodes/)
- **Configuration File**: `k8s/ingress-websocket.yaml`
- **Deployment Script**: `k8s/deploy.sh` (lines 714-820)


