#!/bin/bash
#
# Easy Kanban multi-tenant backup for Kubernetes (PostgreSQL)
#
# - Discovers tenants from Postgres schemas (tenant_*)
# - Dumps each tenant schema to backups/{tenant}/kanban-{tenant}-backup-*.sql.gz
# - Writes a full-database dump to backups/postgres/kanban-easykanban-full-*.sql.gz
# - Backs up NFS attachments/avatars per tenant when available
# - Retains files for RETENTION_DAYS (default 14)
# - Removes legacy SQLite *-latest.db symlinks after a successful PG dump
#
# Crontab (user: daniel) — recommended:
#   0 4 * * * /bin/bash -c 'export HOME=/home/daniel PATH=/usr/local/bin:/usr/bin:/bin KUBECONFIG=/home/daniel/.kube/config && cd /home/daniel/easy-kanban && ./scripts/backup-k8s-tenants.sh >>/home/daniel/easy-kanban/backup.log 2>&1'
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "$PROJECT_ROOT"

# Cron-safe environment
export HOME="${HOME:-/home/daniel}"
export PATH="/usr/local/bin:/usr/bin:/bin:${PATH:-}"

# --- Configuration (override via env) ---
BASE_BACKUP_DIR="${BASE_BACKUP_DIR:-./backups}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
TIMESTAMP="${TIMESTAMP:-$(date +%Y%m%d_%H%M%S)}"

PG_NAMESPACE="${PG_NAMESPACE:-easy-kanban-pg}"
PG_DEPLOYMENT="${PG_DEPLOYMENT:-postgres}"
POSTGRES_USER="${POSTGRES_USER:-kanban}"
POSTGRES_DB="${POSTGRES_DB:-easykanban}"

NFS_NAMESPACE="${NFS_NAMESPACE:-easy-kanban}"
NFS_SERVER_LABEL="${NFS_SERVER_LABEL:-app=nfs-server}"
SKIP_NFS="${SKIP_NFS:-false}"
SKIP_FULL_DUMP="${SKIP_FULL_DUMP:-false}"

if [ -z "${KUBECONFIG:-}" ]; then
  if [ -f "${HOME}/.kube/config" ]; then
    export KUBECONFIG="${HOME}/.kube/config"
  elif [ -r /etc/kubernetes/admin.conf ]; then
    export KUBECONFIG=/etc/kubernetes/admin.conf
  fi
fi

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_status()  { echo -e "${BLUE}[INFO]${NC} $1"; }
print_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
print_warning() { echo -e "${YELLOW}[WARNING]${NC} $1" >&2; }
print_error()   { echo -e "${RED}[ERROR]${NC} $1" >&2; }

# Run kubectl|gzip and check both sides of the pipe (cron-safe)
pg_dump_to_gzip() {
  local dest="$1"
  shift
  local dump_rc gzip_rc
  local -a pipe_copy
  # Temporarily allow non-zero so we can inspect PIPESTATUS
  set +e
  "$@" | gzip -c > "$dest"
  # Copy PIPESTATUS in one assignment before any other command
  pipe_copy=("${PIPESTATUS[@]}")
  set -e
  dump_rc=${pipe_copy[0]:-1}
  gzip_rc=${pipe_copy[1]:-1}
  if [ "$dump_rc" -ne 0 ]; then
    print_error "pg_dump failed (exit ${dump_rc})"
    return 1
  fi
  if [ "$gzip_rc" -ne 0 ]; then
    print_error "gzip failed (exit ${gzip_rc})"
    return 1
  fi
  if [ ! -s "$dest" ]; then
    print_error "Dump file is empty: ${dest}"
    return 1
  fi
  return 0
}

require_kubectl() {
  if ! command -v kubectl >/dev/null 2>&1; then
    print_error "kubectl not found in PATH=${PATH}"
    exit 1
  fi
  if [ -z "${KUBECONFIG:-}" ] || [ ! -r "${KUBECONFIG}" ]; then
    print_error "KUBECONFIG missing or unreadable (KUBECONFIG='${KUBECONFIG:-}')"
    exit 1
  fi
  if ! kubectl get namespace "$PG_NAMESPACE" >/dev/null 2>&1; then
    print_error "Cannot access namespace '${PG_NAMESPACE}' with KUBECONFIG=${KUBECONFIG}"
    exit 1
  fi
  if ! kubectl get deploy -n "$PG_NAMESPACE" "$PG_DEPLOYMENT" >/dev/null 2>&1; then
    print_error "Deployment ${PG_NAMESPACE}/${PG_DEPLOYMENT} not found"
    exit 1
  fi
}

# schema tenant_drenlia → drenlia; tenant_amanda-pg → amanda-pg
tenant_id_from_schema() {
  local schema="$1"
  echo "${schema#tenant_}"
}

create_tenant_backup_dir() {
  local tenant=$1
  local dir="${BASE_BACKUP_DIR}/${tenant}"
  mkdir -p "$dir"
  echo "$dir"
}

update_latest_symlink() {
  local link_path="$1"
  local relative_target="$2"
  ln -sfn "$relative_target" "$link_path"
}

# Quote schema for pg_dump -n so _ and - are literal (not pattern wildcards)
pg_dump_schema_arg() {
  local schema="$1"
  printf '"%s"' "$schema"
}

remove_legacy_sqlite_latest() {
  local tenant=$1
  local legacy="${BASE_BACKUP_DIR}/kanban-${tenant}-latest.db"
  if [ -L "$legacy" ] || [ -e "$legacy" ]; then
    rm -f "$legacy"
    print_status "Removed legacy SQLite link: ${legacy}"
  fi
}

backup_tenant_schema() {
  local schema="$1"
  local tenant
  tenant="$(tenant_id_from_schema "$schema")"
  local tenant_backup_dir
  tenant_backup_dir="$(create_tenant_backup_dir "$tenant")"

  local backup_filename="kanban-${tenant}-backup-${TIMESTAMP}.sql.gz"
  local backup_path="${tenant_backup_dir}/${backup_filename}"
  local schema_arg
  schema_arg="$(pg_dump_schema_arg "$schema")"

  print_status "Dumping PostgreSQL schema ${schema} (tenant '${tenant}')..."

  if ! pg_dump_to_gzip "$backup_path" \
      kubectl exec -n "$PG_NAMESPACE" "deploy/${PG_DEPLOYMENT}" -- \
        pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
          --clean --if-exists --no-owner --no-acl \
          -n "$schema_arg"; then
    rm -f "$backup_path"
    return 1
  fi

  update_latest_symlink \
    "${BASE_BACKUP_DIR}/kanban-${tenant}-latest.sql.gz" \
    "${tenant}/${backup_filename}"

  remove_legacy_sqlite_latest "$tenant"

  print_success "PostgreSQL dump: ${backup_path} ($(du -h "$backup_path" | cut -f1))"
  return 0
}

backup_full_database() {
  local full_dir="${BASE_BACKUP_DIR}/postgres"
  mkdir -p "$full_dir"
  local backup_filename="kanban-easykanban-full-${TIMESTAMP}.sql.gz"
  local backup_path="${full_dir}/${backup_filename}"

  print_status "Dumping full PostgreSQL database ${POSTGRES_DB}..."

  if ! pg_dump_to_gzip "$backup_path" \
      kubectl exec -n "$PG_NAMESPACE" "deploy/${PG_DEPLOYMENT}" -- \
        pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
          --clean --if-exists --no-owner --no-acl; then
    rm -f "$backup_path"
    return 1
  fi

  update_latest_symlink \
    "${BASE_BACKUP_DIR}/kanban-easykanban-full-latest.sql.gz" \
    "postgres/${backup_filename}"

  print_success "Full PostgreSQL dump: ${backup_path} ($(du -h "$backup_path" | cut -f1))"
  return 0
}

list_tenant_schemas() {
  kubectl exec -n "$PG_NAMESPACE" "deploy/${PG_DEPLOYMENT}" -- \
    psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAc \
    "SELECT nspname FROM pg_namespace WHERE nspname LIKE 'tenant\_%' ESCAPE '\' ORDER BY 1;"
}

get_nfs_pod_name() {
  local pod_name
  pod_name=$(kubectl get pods -n "$NFS_NAMESPACE" -l "$NFS_SERVER_LABEL" \
    -o jsonpath='{.items[0].metadata.name}' 2>/dev/null || true)

  if [ -z "$pod_name" ]; then
    print_warning "No NFS server pod in namespace '${NFS_NAMESPACE}'"
    return 1
  fi

  local pod_status
  pod_status=$(kubectl get pod "$pod_name" -n "$NFS_NAMESPACE" -o jsonpath='{.status.phase}')
  if [ "$pod_status" != "Running" ]; then
    print_warning "NFS pod '${pod_name}' is not Running (${pod_status})"
    return 1
  fi

  echo "$pod_name"
}

backup_nfs_tree() {
  local tenant=$1
  local kind=$2   # attachments | avatars
  local pod_name=$3
  local tenant_backup_dir
  tenant_backup_dir="$(create_tenant_backup_dir "$tenant")"

  local src_root="/exports/${kind}/tenants"
  local src_path="${src_root}/${tenant}"
  local backup_filename="kanban-${tenant}-${kind}-${TIMESTAMP}.tar.gz"
  local backup_path="${tenant_backup_dir}/${backup_filename}"
  local tmp_in_pod="/tmp/easy-kanban-${kind}-${tenant}-backup.tar.gz"
  local kind_label
  kind_label="$(printf '%s' "$kind" | awk '{print toupper(substr($0,1,1)) substr($0,2)}')"

  print_status "Backing up ${kind} for '${tenant}' from NFS..."

  if ! kubectl exec -n "$NFS_NAMESPACE" "$pod_name" -- \
      sh -c "test -d '${src_path}'" 2>/dev/null; then
    print_warning "${kind_label} directory missing for tenant '${tenant}' — skipping"
    return 0
  fi

  if ! kubectl exec -n "$NFS_NAMESPACE" "$pod_name" -- \
      sh -c "tar czf '${tmp_in_pod}' -C '${src_root}' '${tenant}'" 2>/dev/null; then
    print_warning "Failed to archive ${kind} for '${tenant}'"
    return 0
  fi

  kubectl cp "${NFS_NAMESPACE}/${pod_name}:${tmp_in_pod}" "$backup_path" >/dev/null 2>&1 || true
  kubectl exec -n "$NFS_NAMESPACE" "$pod_name" -- rm -f "$tmp_in_pod" >/dev/null 2>&1 || true

  if [ ! -f "$backup_path" ]; then
    print_warning "Failed to copy ${kind} archive for '${tenant}'"
    return 0
  fi

  update_latest_symlink \
    "${BASE_BACKUP_DIR}/kanban-${tenant}-${kind}-latest.tar.gz" \
    "${tenant}/${backup_filename}"

  print_success "${kind_label} dump: ${backup_path} ($(du -h "$backup_path" | cut -f1))"
  return 0
}

cleanup_old_backups() {
  local dir=$1
  shift
  local patterns=("$@")

  if [ ! -d "$dir" ]; then
    return 0
  fi

  local deleted=0
  local pattern
  for pattern in "${patterns[@]}"; do
    while IFS= read -r -d '' file; do
      rm -f "$file"
      deleted=$((deleted + 1))
      print_status "Deleted old backup: $(basename "$file")"
    done < <(find "$dir" -maxdepth 1 -type f -name "$pattern" -mtime +"${RETENTION_DAYS}" -print0 2>/dev/null)
  done

  if [ "$deleted" -gt 0 ]; then
    print_success "Cleaned up ${deleted} old file(s) in ${dir}"
  fi
}

backup_all() {
  print_status "=============================================="
  print_status "Easy Kanban PostgreSQL backup (${TIMESTAMP})"
  print_status "=============================================="
  print_status "Host: $(hostname)  User: $(id -un)  HOME=${HOME}"
  print_status "KUBECONFIG=${KUBECONFIG}"
  print_status "Namespace: ${PG_NAMESPACE}  Deploy: ${PG_DEPLOYMENT}"
  print_status "Database: ${POSTGRES_DB}  Retention: ${RETENTION_DAYS}d"
  print_status "Output dir: ${PROJECT_ROOT}/${BASE_BACKUP_DIR#./}"
  echo ""

  mkdir -p "$BASE_BACKUP_DIR"

  local schemas
  schemas="$(list_tenant_schemas || true)"
  if [ -z "${schemas//[$' \t\r\n']/}" ]; then
    print_error "No tenant_* schemas found in ${POSTGRES_DB}"
    exit 1
  fi

  print_status "Tenant schemas to dump:"
  echo "$schemas" | while read -r s; do
    [ -n "$s" ] && echo "  - $s → $(tenant_id_from_schema "$s")  =>  backups/$(tenant_id_from_schema "$s")/*.sql.gz"
  done
  echo ""

  local nfs_pod=""
  if [ "$SKIP_NFS" != "true" ]; then
    nfs_pod="$(get_nfs_pod_name || true)"
  fi

  local success=0
  local fail=0
  local dumped_files=()

  if [ "$SKIP_FULL_DUMP" != "true" ]; then
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    if backup_full_database; then
      dumped_files+=("${BASE_BACKUP_DIR}/postgres/kanban-easykanban-full-${TIMESTAMP}.sql.gz")
      cleanup_old_backups "${BASE_BACKUP_DIR}/postgres" "kanban-easykanban-full-*.sql.gz"
    else
      fail=$((fail + 1))
    fi
    echo ""
  fi

  while IFS= read -r schema; do
    schema="${schema#"${schema%%[![:space:]]*}"}"
    schema="${schema%"${schema##*[![:space:]]}"}"
    [ -z "$schema" ] && continue
    local tenant
    tenant="$(tenant_id_from_schema "$schema")"

    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    print_status "Processing tenant: ${tenant} (schema ${schema})"
    echo ""

    local ok=true
    if backup_tenant_schema "$schema"; then
      dumped_files+=("${BASE_BACKUP_DIR}/${tenant}/kanban-${tenant}-backup-${TIMESTAMP}.sql.gz")
    else
      ok=false
    fi

    if [ -n "$nfs_pod" ]; then
      backup_nfs_tree "$tenant" "attachments" "$nfs_pod" || true
      backup_nfs_tree "$tenant" "avatars" "$nfs_pod" || true
    fi

    cleanup_old_backups "${BASE_BACKUP_DIR}/${tenant}" \
      "kanban-${tenant}-backup-*.sql.gz" \
      "kanban-${tenant}-attachments-*.tar.gz" \
      "kanban-${tenant}-avatars-*.tar.gz" \
      "kanban-${tenant}-backup-*.db"

    if [ "$ok" = true ]; then
      success=$((success + 1))
    else
      fail=$((fail + 1))
    fi
    echo ""
  done <<< "$schemas"

  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  print_status "PostgreSQL dumps written this run:"
  local f
  for f in "${dumped_files[@]:-}"; do
    if [ -n "$f" ] && [ -s "$f" ]; then
      echo "  ✓ $f ($(du -h "$f" | cut -f1))"
    fi
  done
  echo ""
  print_success "Backup summary: ${success} tenant schema dump(s) ok, ${fail} failed"
  print_status "Latest symlinks: ${BASE_BACKUP_DIR}/kanban-*-latest.sql.gz and kanban-easykanban-full-latest.sql.gz"

  if [ "$fail" -gt 0 ] || [ "$success" -eq 0 ]; then
    print_error "Backup finished with failures (or zero successful PG dumps)"
    exit 1
  fi
}

usage() {
  cat <<EOF
Usage: $0 [all|list|help]

  all   (default) Dump every tenant_* schema + full DB + NFS files
  list  Show tenant schemas discovered in Postgres
  help  This message

Outputs (under ./backups):
  postgres/kanban-easykanban-full-TIMESTAMP.sql.gz
  {tenant}/kanban-{tenant}-backup-TIMESTAMP.sql.gz
  kanban-{tenant}-latest.sql.gz  (symlink)
  kanban-easykanban-full-latest.sql.gz  (symlink)

Environment overrides:
  PG_NAMESPACE, PG_DEPLOYMENT, POSTGRES_USER, POSTGRES_DB
  BASE_BACKUP_DIR, RETENTION_DAYS, SKIP_NFS, SKIP_FULL_DUMP, KUBECONFIG, HOME
EOF
}

main() {
  require_kubectl
  local cmd="${1:-all}"
  case "$cmd" in
    all|"")
      backup_all
      ;;
    list)
      print_status "Tenant schemas in ${PG_NAMESPACE}/${POSTGRES_DB}:"
      list_tenant_schemas | while read -r s; do
        [ -n "$s" ] && echo "  - $s → $(tenant_id_from_schema "$s")"
      done
      ;;
    help|-h|--help)
      usage
      ;;
    *)
      print_error "Unknown command: $cmd"
      usage
      exit 1
      ;;
  esac
}

main "$@"
