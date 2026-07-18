#!/bin/bash
# Verify that traffic for <instance>.ezkan.cloud is wired to easy-kanban-pg in-cluster.
# Usage: ./k8s/verify-tenant-routing-pg.sh <instance_name>
# Example: ./k8s/verify-tenant-routing-pg.sh drenlia-pg
#
# Checks: per-tenant HTTP ingress, WebSocket ingress host, Service endpoints,
# duplicate host claims cluster-wide, optional public DNS (dig), optional in-cluster curl.

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

usage() {
  echo "Usage: $0 <instance_name>"
  echo "  instance_name — subdomain label (e.g. drenlia-pg → drenlia-pg.ezkan.cloud)"
  exit 1
}

[[ $# -eq 1 ]] || usage
INSTANCE_NAME="$1"
NAMESPACE="easy-kanban-pg"
DOMAIN="${TENANT_DOMAIN:-ezkan.cloud}"
FULL_HOSTNAME="${INSTANCE_NAME}.${DOMAIN}"
HTTP_INGRESS="easy-kanban-ingress-${INSTANCE_NAME}"
WS_INGRESS="easy-kanban-websocket-ingress-pg"
SERVICE="easy-kanban-service"

if [[ ! "$INSTANCE_NAME" =~ ^[a-z0-9]([a-z0-9-]*[a-z0-9])?$ ]]; then
  echo -e "${RED}❌ Invalid instance name${NC}"
  exit 1
fi

if ! command -v kubectl &>/dev/null; then
  echo -e "${RED}❌ kubectl not found${NC}"
  exit 1
fi

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}Verify tenant routing (PG)${NC}"
echo -e "${BLUE}  Host: ${FULL_HOSTNAME}${NC}"
echo -e "${BLUE}  Namespace: ${NAMESPACE}${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

FAIL=0

# --- HTTP Ingress for this tenant (must be in easy-kanban-pg: Ingress backends are namespace-local) ---
HTTP_NS=""
while read -r ns name; do
  [[ -z "$ns" ]] && continue
  if [[ "$name" == "${HTTP_INGRESS}" ]]; then
    HTTP_NS="$ns"
    break
  fi
done < <(kubectl get ingress -A -o jsonpath='{range .items[*]}{.metadata.namespace}{" "}{.metadata.name}{"\n"}{end}' 2>/dev/null || true)

if [[ -z "$HTTP_NS" ]]; then
  echo -e "${RED}❌ Ingress ${HTTP_INGRESS} not found in any namespace${NC}"
  echo -e "${YELLOW}   Fix: ./k8s/deploy-pg.sh ${INSTANCE_NAME} basic   (or pro)${NC}"
  FAIL=1
elif [[ "$HTTP_NS" != "$NAMESPACE" ]]; then
  echo -e "${RED}❌ HTTP Ingress is in the wrong namespace${NC}"
  echo "    Found: ${HTTP_NS}/${HTTP_INGRESS}"
  echo "    Need:  ${NAMESPACE}/${HTTP_INGRESS}"
  echo ""
  echo -e "${YELLOW}   Ingress backends only reach Services in the same namespace.${NC}"
  echo -e "${YELLOW}   ${HTTP_NS}/${HTTP_INGRESS} sends ${FULL_HOSTNAME} traffic to the ${HTTP_NS} stack (often SQLite), not ${NAMESPACE} (PostgreSQL).${NC}"
  echo ""
  echo "   Fix (after confirming no one relies on the old route):"
  echo "     kubectl delete ingress ${HTTP_INGRESS} -n ${HTTP_NS}"
  echo "     ./k8s/deploy-pg.sh ${INSTANCE_NAME} basic"
  FAIL=1
else
  RULE_HOSTS=$(kubectl get ingress "${HTTP_INGRESS}" -n "${NAMESPACE}" -o jsonpath='{.spec.rules[*].host}' 2>/dev/null || true)
  BACKEND_SVC=$(kubectl get ingress "${HTTP_INGRESS}" -n "${NAMESPACE}" -o jsonpath='{.spec.rules[0].http.paths[0].backend.service.name}' 2>/dev/null || true)
  BACKEND_PORT=$(kubectl get ingress "${HTTP_INGRESS}" -n "${NAMESPACE}" -o jsonpath='{.spec.rules[0].http.paths[0].backend.service.port.number}' 2>/dev/null || true)
  INGRESS_CLASS=$(kubectl get ingress "${HTTP_INGRESS}" -n "${NAMESPACE}" -o jsonpath='{.spec.ingressClassName}' 2>/dev/null || true)

  echo -e "${GREEN}✓${NC} Found ingress ${NAMESPACE}/${HTTP_INGRESS}"
  echo "    rules host(s): ${RULE_HOSTS:-<none>}"
  echo "    backend:       ${BACKEND_SVC}:${BACKEND_PORT}"
  echo "    ingressClass:  ${INGRESS_CLASS:-<unset>}"

  if [[ " ${RULE_HOSTS} " != *" ${FULL_HOSTNAME} "* ]]; then
    echo -e "${RED}❌ Ingress rules do not include ${FULL_HOSTNAME}${NC}"
    FAIL=1
  else
    echo -e "${GREEN}✓${NC} Rule includes ${FULL_HOSTNAME}"
  fi

  if [[ "${BACKEND_SVC}" != "${SERVICE}" ]] || [[ "${BACKEND_PORT}" != "80" ]]; then
    echo -e "${YELLOW}⚠${NC} Expected backend ${SERVICE}:80 (Vite on 3010 via Service port 80); got ${BACKEND_SVC}:${BACKEND_PORT}"
    FAIL=1
  fi
fi

echo ""

# --- WebSocket ingress (shared) ---
if kubectl get ingress "${WS_INGRESS}" -n "${NAMESPACE}" &>/dev/null; then
  WS_HOSTS=$(kubectl get ingress "${WS_INGRESS}" -n "${NAMESPACE}" -o jsonpath='{.spec.rules[*].host}' 2>/dev/null || true)
  if [[ " ${WS_HOSTS} " == *" ${FULL_HOSTNAME} "* ]]; then
    echo -e "${GREEN}✓${NC} WebSocket ingress includes ${FULL_HOSTNAME}"
  else
    echo -e "${YELLOW}⚠${NC} WebSocket ingress missing host ${FULL_HOSTNAME}"
    echo "    rules host(s): ${WS_HOSTS:-<none>}"
    echo "    Re-run deploy-pg for this instance or add the host to ${WS_INGRESS} manually."
    FAIL=1
  fi
else
  echo -e "${YELLOW}⚠${NC} No ${WS_INGRESS} (Socket.IO may fail for this host until deploy adds it)"
fi

echo ""

# --- Service endpoints (traffic must have pod targets) ---
if ! kubectl get svc "${SERVICE}" -n "${NAMESPACE}" &>/dev/null; then
  echo -e "${RED}❌ Service ${NAMESPACE}/${SERVICE} not found${NC}"
  FAIL=1
else
  EP=$(kubectl get endpoints "${SERVICE}" -n "${NAMESPACE}" -o jsonpath='{.subsets[*].addresses[*].ip}' 2>/dev/null || true)
  if [[ -z "${EP// /}" ]]; then
    echo -e "${RED}❌ Endpoints for ${SERVICE} have no ready addresses (no pods or not Ready)${NC}"
    kubectl get endpoints "${SERVICE}" -n "${NAMESPACE}" -o wide || true
    FAIL=1
  else
    echo -e "${GREEN}✓${NC} ${SERVICE} endpoints: ${EP}"
  fi
fi

echo ""

# --- Same host on multiple Ingress objects (normal: HTTP + WebSocket are split) ---
echo "Scanning all namespaces for Ingress rules using ${FULL_HOSTNAME}..."
DUP=""
DUP_COUNT=0
HTTP_LIKE=0
WS_LIKE=0
while read -r ns name; do
  [[ -z "$ns" ]] && continue
  HOSTS=$(kubectl get ingress "$name" -n "$ns" -o jsonpath='{.spec.rules[*].host}' 2>/dev/null || true)
  case " $HOSTS " in
    *" ${FULL_HOSTNAME} "*)
      DUP+="${ns}/${name}"$'\n'
      DUP_COUNT=$((DUP_COUNT + 1))
      # deploy-pg.sh uses a dedicated WebSocket ingress (name contains "websocket"); HTTP is per-tenant.
      lname=$(echo "$name" | tr '[:upper:]' '[:lower:]')
      if [[ "$lname" == *websocket* ]]; then
        WS_LIKE=$((WS_LIKE + 1))
      else
        HTTP_LIKE=$((HTTP_LIKE + 1))
      fi
      ;;
  esac
done < <(kubectl get ingress -A -o jsonpath='{range .items[*]}{.metadata.namespace}{" "}{.metadata.name}{"\n"}{end}' 2>/dev/null || true)

if [[ "$DUP_COUNT" -eq 0 ]]; then
  echo -e "${YELLOW}⚠${NC} No ingress found cluster-wide with host=${FULL_HOSTNAME}"
  echo "    (If HTTP ingress exists only in ${NAMESPACE}, kubectl -A listing may be restricted.)"
elif [[ "$HTTP_LIKE" -gt 1 ]]; then
  echo -e "${RED}❌ Multiple HTTP-style Ingress resources claim host ${FULL_HOSTNAME}${NC}"
  echo "    (nginx-ingress merges rules, but two Ingresses both serving / is usually a mistake.)"
  echo "$DUP" | sed '/^$/d' | sed 's/^/    /'
  FAIL=1
elif [[ "$DUP_COUNT" -ge 2 ]] && [[ "$HTTP_LIKE" -eq 1 ]] && [[ "$WS_LIKE" -ge 1 ]]; then
  echo -e "${GREEN}✓${NC} Host appears on ${DUP_COUNT} Ingress object(s) (expected: one HTTP + WebSocket companion):"
  echo "$DUP" | sed '/^$/d' | sed 's/^/    /'
elif [[ "$DUP_COUNT" -eq 1 ]]; then
  echo -e "${GREEN}✓${NC} Single Ingress claims this host:"
  echo "    ${DUP//$'\n'/}"
else
  echo -e "${YELLOW}⚠${NC} Unusual: ${DUP_COUNT} Ingress object(s) for this host (HTTP_like=${HTTP_LIKE}, websocket_like=${WS_LIKE}):"
  echo "$DUP" | sed '/^$/d' | sed 's/^/    /'
  if [[ "$HTTP_LIKE" -gt 1 ]] || [[ "$DUP_COUNT" -gt 3 ]]; then
    FAIL=1
  fi
fi

echo ""

# --- Optional: public DNS ---
if command -v dig &>/dev/null; then
  RES=$(dig +short "${FULL_HOSTNAME}" 2>/dev/null | head -8 || true)
  if [[ -n "${RES}" ]]; then
    echo -e "${GREEN}✓${NC} DNS ${FULL_HOSTNAME} resolves to:"
    echo "$RES" | sed 's/^/    /'
  else
    echo -e "${YELLOW}⚠${NC} dig returned no records for ${FULL_HOSTNAME} (fix DNS at registrar / external LB)"
  fi
else
  echo -e "${YELLOW}ℹ${NC} dig not installed; skip public DNS check"
fi

echo ""

# --- Optional: in-cluster HTTP check (Host header = tenant hostname) ---
if [[ "${SKIP_CLUSTER_CURL:-}" != "1" ]] && kubectl get pods -n "${NAMESPACE}" -l app=easy-kanban -o name &>/dev/null; then
  echo "In-cluster request: GET /api/settings with Host: ${FULL_HOSTNAME}"
  POD=$(kubectl get pods -n "${NAMESPACE}" -l app=easy-kanban -o jsonpath='{.items[0].metadata.name}' 2>/dev/null || true)
  if [[ -n "$POD" ]]; then
    OUT=$(kubectl exec -n "${NAMESPACE}" "${POD}" -- \
      curl -sS -m 10 \
      -H "Host: ${FULL_HOSTNAME}" \
      -H "X-Forwarded-Host: ${FULL_HOSTNAME}" \
      "http://${SERVICE}.${NAMESPACE}.svc.cluster.local/api/settings" 2>/dev/null || true)
    if echo "$OUT" | grep -q '"GOOGLE_CLIENT_ID"'; then
      GID=$(echo "$OUT" | sed -n 's/.*"GOOGLE_CLIENT_ID"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -1)
      echo -e "${GREEN}✓${NC} /api/settings OK; GOOGLE_CLIENT_ID length (chars): ${#GID}"
    else
      echo -e "${YELLOW}⚠${NC} /api/settings missing GOOGLE_CLIENT_ID in JSON (empty tenant DB, wrong schema, or app bug)"
      echo "    First 160 chars: ${OUT:0:160}..."
    fi
  fi
else
  echo -e "${YELLOW}ℹ${NC} No easy-kanban pod found; skip in-cluster curl"
fi

echo ""
if [[ "$FAIL" -eq 0 ]]; then
  echo -e "${GREEN}✅ Routing checks passed for ${FULL_HOSTNAME}${NC}"
  exit 0
fi

echo -e "${RED}❌ Routing checks failed — fix items above${NC}"
exit 1
