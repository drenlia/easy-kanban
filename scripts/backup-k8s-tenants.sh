#!/bin/bash

# Easy Kanban Multi-Tenant Backup Script for Kubernetes
# This script creates backups of databases, attachments, and avatars for each tenant
# Backups are stored in backups/{tenant}/ with 2 weeks retention

set -e  # Exit on any error

# Configuration
BASE_BACKUP_DIR="./backups"
RETENTION_DAYS=14
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
NAMESPACE="easy-kanban"  # Single shared namespace for multi-tenant
NFS_SERVER_LABEL="app=nfs-server"  # NFS server pod label

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Function to get NFS server pod name
get_nfs_pod_name() {
    local pod_name=$(kubectl get pods -n "$NAMESPACE" -l "$NFS_SERVER_LABEL" -o jsonpath='{.items[0].metadata.name}' 2>/dev/null)
    
    if [ -z "$pod_name" ]; then
        print_error "No NFS server pod found in namespace '${NAMESPACE}'"
        exit 1
    fi
    
    # Check if pod is running
    local pod_status=$(kubectl get pod "$pod_name" -n "$NAMESPACE" -o jsonpath='{.status.phase}')
    if [ "$pod_status" != "Running" ]; then
        print_error "NFS server pod '${pod_name}' is not running (status: ${pod_status})"
        exit 1
    fi
    
    echo "$pod_name"
}

# Function to list available tenants by checking filesystem in NFS server
list_tenants() {
    print_status "Discovering tenants from NFS server..."
    
    local pod_name=$(get_nfs_pod_name)
    local tenants_dir="/exports/data/tenants"
    
    # List tenant directories from the NFS server pod
    local tenants=$(kubectl exec -n "$NAMESPACE" "$pod_name" -- sh -c "ls -d ${tenants_dir}/*/ 2>/dev/null | xargs -n1 basename 2>/dev/null | sort" 2>/dev/null || echo "")
    
    if [ -z "$tenants" ]; then
        print_warning "No tenants found in ${tenants_dir}"
        return
    fi
    
    print_status "Available Easy Kanban tenants:"
    echo "$tenants" | while read -r tenant; do
        if [ -n "$tenant" ]; then
            echo "  - $tenant"
        fi
    done
}

# Function to check if tenant exists
check_tenant() {
    local tenant=$1
    local pod_name=$(get_nfs_pod_name)
    local tenant_db_path="/exports/data/tenants/${tenant}/kanban.db"
    
    # Check if tenant database exists in the NFS server
    if ! kubectl exec -n "$NAMESPACE" "$pod_name" -- test -f "$tenant_db_path" 2>/dev/null; then
        print_error "Tenant '${tenant}' not found (database not found at ${tenant_db_path})"
        echo ""
        list_tenants
        exit 1
    fi
}

# Function to create tenant backup directory
create_tenant_backup_dir() {
    local tenant=$1
    local tenant_backup_dir="${BASE_BACKUP_DIR}/${tenant}"
    
    if [ ! -d "$tenant_backup_dir" ]; then
        print_status "Creating backup directory: $tenant_backup_dir"
        mkdir -p "$tenant_backup_dir"
    fi
    
    echo "$tenant_backup_dir"
}

# Function to backup database
backup_database() {
    local tenant=$1
    local pod_name=$(get_nfs_pod_name)
    local tenant_backup_dir=$(create_tenant_backup_dir "$tenant")
    
    # Multi-tenant database path on NFS server
    local db_path="/exports/data/tenants/${tenant}/kanban.db"
    local backup_filename="kanban-${tenant}-backup-${TIMESTAMP}.db"
    local backup_path="${tenant_backup_dir}/${backup_filename}"
    
    print_status "Backing up database from NFS server pod '${pod_name}'..."
    print_status "Database path: ${db_path}"
    
    # Copy database from NFS server pod with retry logic
    # Note: kubectl cp may show "tar: removing leading '/' from member names" warning, which is normal and harmless
    local max_retries=3
    local retry_count=0
    local copy_success=false
    
    while [ $retry_count -lt $max_retries ]; do
        # Attempt the copy, capturing any real errors but suppressing harmless warnings
        # Store stderr separately to check for actual errors
        local cp_stderr=$(kubectl cp "${NAMESPACE}/${pod_name}:${db_path}" "$backup_path" 2>&1)
        local cp_exit_code=$?
        
        # Filter out harmless warnings
        local real_errors=$(echo "$cp_stderr" | grep -v "tar: removing leading" | grep -v "Defaulted container" | grep -v "^$")
        
        # Small delay to ensure file is fully written to disk
        sleep 0.5
        
        # Check if file was actually created and is non-empty (this is the real test of success)
        if [ -f "$backup_path" ] && [ -s "$backup_path" ]; then
            copy_success=true
            break
        fi
        
        # If we got here and file doesn't exist, log any real errors
        if [ -n "$real_errors" ]; then
            print_warning "Error during copy: $real_errors"
        elif [ $cp_exit_code -ne 0 ]; then
            print_warning "kubectl cp exited with code: $cp_exit_code"
        fi
        
        retry_count=$((retry_count + 1))
        if [ $retry_count -lt $max_retries ]; then
            print_warning "Database backup attempt ${retry_count} failed, retrying in 2 seconds..."
            sleep 2
            # Clean up partial file if it exists
            [ -f "$backup_path" ] && rm -f "$backup_path"
        fi
    done
    
    if [ "$copy_success" = true ]; then
        print_success "Database backed up to: $backup_path"
        
        # Create/update latest backup symlink in root backups directory
        local latest_filename="kanban-${tenant}-latest.db"
        local latest_path="${BASE_BACKUP_DIR}/${latest_filename}"
        if [ -L "$latest_path" ]; then
            rm "$latest_path"
        fi
        ln -s "${tenant}/$(basename "$backup_path")" "$latest_path"
        print_status "Latest backup link updated: $latest_path"
        
        # Show backup info
        local size=$(du -h "$backup_path" | cut -f1)
        print_success "Backup size: $size"
        
        return 0
    else
        print_error "Failed to backup database from NFS server pod '${pod_name}' after ${max_retries} attempts"
        return 1
    fi
}

# Function to backup attachments
backup_attachments() {
    local tenant=$1
    local pod_name=$(get_nfs_pod_name)
    local tenant_backup_dir=$(create_tenant_backup_dir "$tenant")
    
    # Multi-tenant attachments path on NFS server
    local attachments_path="/exports/attachments/tenants/${tenant}"
    local backup_filename="kanban-${tenant}-attachments-${TIMESTAMP}.tar.gz"
    local backup_path="${tenant_backup_dir}/${backup_filename}"
    
    print_status "Backing up attachments from NFS server pod '${pod_name}'..."
    print_status "Attachments path: ${attachments_path}"
    
    # Create tar archive inside the NFS server pod and copy it out
    if kubectl exec -n "${NAMESPACE}" "${pod_name}" -- sh -c "test -d ${attachments_path} && tar czf /tmp/attachments-backup.tar.gz -C /exports/attachments/tenants ${tenant} 2>/dev/null" 2>/dev/null; then
        kubectl cp "${NAMESPACE}/${pod_name}:/tmp/attachments-backup.tar.gz" "$backup_path" 2>&1 | grep -v "tar: removing leading" | grep -v "Defaulted container" > /dev/null || true
        
        if [ -f "$backup_path" ]; then
            # Clean up temp file in pod
            kubectl exec -n "${NAMESPACE}" "${pod_name}" -- rm -f /tmp/attachments-backup.tar.gz 2>/dev/null || true
            
            print_success "Attachments backed up to: $backup_path"
            
            # Create/update latest backup symlink in root backups directory
            local latest_filename="kanban-${tenant}-attachments-latest.tar.gz"
            local latest_path="${BASE_BACKUP_DIR}/${latest_filename}"
            if [ -L "$latest_path" ]; then
                rm "$latest_path"
            fi
            ln -s "${tenant}/$(basename "$backup_path")" "$latest_path"
            print_status "Latest attachments link updated: $latest_path"
            
            # Show backup info
            local size=$(du -h "$backup_path" | cut -f1)
            print_success "Attachments backup size: $size"
            
            return 0
        else
            # Clean up temp file in pod even if copy failed
            kubectl exec -n "${NAMESPACE}" "${pod_name}" -- rm -f /tmp/attachments-backup.tar.gz 2>/dev/null || true
            print_error "Failed to copy attachments backup from NFS server pod '${pod_name}'"
            return 1
        fi
    else
        print_warning "Attachments directory not found or empty for tenant '${tenant}'"
        return 0  # Not an error if attachments don't exist
    fi
}

# Function to backup avatars
backup_avatars() {
    local tenant=$1
    local pod_name=$(get_nfs_pod_name)
    local tenant_backup_dir=$(create_tenant_backup_dir "$tenant")
    
    # Multi-tenant avatars path on NFS server
    local avatars_path="/exports/avatars/tenants/${tenant}"
    local backup_filename="kanban-${tenant}-avatars-${TIMESTAMP}.tar.gz"
    local backup_path="${tenant_backup_dir}/${backup_filename}"
    
    print_status "Backing up avatars from NFS server pod '${pod_name}'..."
    print_status "Avatars path: ${avatars_path}"
    
    # Create tar archive inside the NFS server pod and copy it out
    if kubectl exec -n "${NAMESPACE}" "${pod_name}" -- sh -c "test -d ${avatars_path} && tar czf /tmp/avatars-backup.tar.gz -C /exports/avatars/tenants ${tenant} 2>/dev/null" 2>/dev/null; then
        kubectl cp "${NAMESPACE}/${pod_name}:/tmp/avatars-backup.tar.gz" "$backup_path" 2>&1 | grep -v "tar: removing leading" | grep -v "Defaulted container" > /dev/null || true
        
        if [ -f "$backup_path" ]; then
            # Clean up temp file in pod
            kubectl exec -n "${NAMESPACE}" "${pod_name}" -- rm -f /tmp/avatars-backup.tar.gz 2>/dev/null || true
            
            print_success "Avatars backed up to: $backup_path"
            
            # Create/update latest backup symlink in root backups directory
            local latest_filename="kanban-${tenant}-avatars-latest.tar.gz"
            local latest_path="${BASE_BACKUP_DIR}/${latest_filename}"
            if [ -L "$latest_path" ]; then
                rm "$latest_path"
            fi
            ln -s "${tenant}/$(basename "$backup_path")" "$latest_path"
            print_status "Latest avatars link updated: $latest_path"
            
            # Show backup info
            local size=$(du -h "$backup_path" | cut -f1)
            print_success "Avatars backup size: $size"
            
            return 0
        else
            # Clean up temp file in pod even if copy failed
            kubectl exec -n "${NAMESPACE}" "${pod_name}" -- rm -f /tmp/avatars-backup.tar.gz 2>/dev/null || true
            print_error "Failed to copy avatars backup from NFS server pod '${pod_name}'"
            return 1
        fi
    else
        print_warning "Avatars directory not found or empty for tenant '${tenant}'"
        return 0  # Not an error if avatars don't exist
    fi
}

# Function to cleanup old backups (keep 2 weeks)
cleanup_old_backups() {
    local tenant=$1
    local tenant_backup_dir="${BASE_BACKUP_DIR}/${tenant}"
    
    if [ ! -d "$tenant_backup_dir" ]; then
        print_warning "Backup directory does not exist for tenant '${tenant}'"
        return
    fi
    
    print_status "Cleaning up backups older than ${RETENTION_DAYS} days for tenant '${tenant}'..."
    
    local deleted_count=0
    
    # Find and delete old database backups
    if [ -d "$tenant_backup_dir" ]; then
        while IFS= read -r file; do
            if [ -n "$file" ] && [ -f "$file" ]; then
                local file_age=$(find "$file" -type f -mtime +${RETENTION_DAYS} 2>/dev/null)
                if [ -n "$file_age" ]; then
                    rm -f "$file"
                    ((deleted_count++))
                    print_status "Deleted old backup: $(basename "$file")"
                fi
            fi
        done < <(find "$tenant_backup_dir" -name "kanban-${tenant}-backup-*.db" -type f 2>/dev/null)
        
        # Find and delete old attachments backups
        while IFS= read -r file; do
            if [ -n "$file" ] && [ -f "$file" ]; then
                local file_age=$(find "$file" -type f -mtime +${RETENTION_DAYS} 2>/dev/null)
                if [ -n "$file_age" ]; then
                    rm -f "$file"
                    ((deleted_count++))
                    print_status "Deleted old backup: $(basename "$file")"
                fi
            fi
        done < <(find "$tenant_backup_dir" -name "kanban-${tenant}-attachments-*.tar.gz" -type f 2>/dev/null)
        
        # Find and delete old avatars backups
        while IFS= read -r file; do
            if [ -n "$file" ] && [ -f "$file" ]; then
                local file_age=$(find "$file" -type f -mtime +${RETENTION_DAYS} 2>/dev/null)
                if [ -n "$file_age" ]; then
                    rm -f "$file"
                    ((deleted_count++))
                    print_status "Deleted old backup: $(basename "$file")"
                fi
            fi
        done < <(find "$tenant_backup_dir" -name "kanban-${tenant}-avatars-*.tar.gz" -type f 2>/dev/null)
    fi
    
    if [ "$deleted_count" -eq 0 ]; then
        print_status "No old backups to clean up for tenant '${tenant}'"
    else
        print_success "Cleaned up ${deleted_count} old backup(s) for tenant '${tenant}'"
    fi
}

# Function to backup all tenants
backup_all_tenants() {
    print_status "Backing up all Easy Kanban tenants..."
    echo ""
    
    local pod_name=$(get_nfs_pod_name)
    local tenants_dir="/exports/data/tenants"
    
    # Discover tenants from the NFS server filesystem
    local tenants=$(kubectl exec -n "$NAMESPACE" "$pod_name" -- sh -c "ls -d ${tenants_dir}/*/ 2>/dev/null | xargs -n1 basename 2>/dev/null | sort" 2>/dev/null || echo "")
    
    if [ -z "$tenants" ]; then
        print_warning "No Easy Kanban tenants found"
        exit 0
    fi
    
    local success_count=0
    local fail_count=0
    
    # Use process substitution instead of pipe to avoid subshell issues
    while IFS= read -r tenant; do
        if [ -z "$tenant" ]; then
            continue
        fi
        
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        print_status "Processing tenant: ${tenant}"
        echo ""
        
        local tenant_success=true
        
        if ! backup_database "$tenant"; then
            tenant_success=false
        fi
        
        if ! backup_attachments "$tenant"; then
            tenant_success=false
        fi
        
        if ! backup_avatars "$tenant"; then
            tenant_success=false
        fi
        
        # Cleanup old backups for this tenant
        cleanup_old_backups "$tenant"
        
        if [ "$tenant_success" = true ]; then
            ((success_count++))
        else
            ((fail_count++))
        fi
        echo ""
    done < <(echo "$tenants")
    
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    print_success "Backup Summary: ${success_count} successful, ${fail_count} failed"
}

# Function to list existing backups
list_backups() {
    local tenant=$1
    
    if [ -n "$tenant" ]; then
        # List backups for specific tenant
        local tenant_backup_dir="${BASE_BACKUP_DIR}/${tenant}"
        
        if [ -d "$tenant_backup_dir" ]; then
            print_status "Backups for tenant '${tenant}':"
            echo ""
            
            local db_backups=$(find "$tenant_backup_dir" -name "kanban-${tenant}-backup-*.db" -type f 2>/dev/null | sort -r)
            local attachment_backups=$(find "$tenant_backup_dir" -name "kanban-${tenant}-attachments-*.tar.gz" -type f 2>/dev/null | sort -r)
            local avatar_backups=$(find "$tenant_backup_dir" -name "kanban-${tenant}-avatars-*.tar.gz" -type f 2>/dev/null | sort -r)
            
            if [ -n "$db_backups" ] || [ -n "$attachment_backups" ] || [ -n "$avatar_backups" ]; then
                if [ -n "$db_backups" ]; then
                    echo "  Database backups:"
                    echo "$db_backups" | while read -r file; do
                        if [ -f "$file" ]; then
                            local size=$(du -h "$file" | cut -f1)
                            local date=$(stat -c %y "$file" 2>/dev/null | cut -d' ' -f1)
                            echo "    $(basename "$file") - $size - $date"
                        fi
                    done
                    echo ""
                fi
                
                if [ -n "$attachment_backups" ]; then
                    echo "  Attachment backups:"
                    echo "$attachment_backups" | while read -r file; do
                        if [ -f "$file" ]; then
                            local size=$(du -h "$file" | cut -f1)
                            local date=$(stat -c %y "$file" 2>/dev/null | cut -d' ' -f1)
                            echo "    $(basename "$file") - $size - $date"
                        fi
                    done
                    echo ""
                fi
                
                if [ -n "$avatar_backups" ]; then
                    echo "  Avatar backups:"
                    echo "$avatar_backups" | while read -r file; do
                        if [ -f "$file" ]; then
                            local size=$(du -h "$file" | cut -f1)
                            local date=$(stat -c %y "$file" 2>/dev/null | cut -d' ' -f1)
                            echo "    $(basename "$file") - $size - $date"
                        fi
                    done
                fi
            else
                print_warning "No backups found for tenant '${tenant}'"
            fi
        else
            print_warning "No backup directory found for tenant '${tenant}'"
        fi
    else
        # List all backups
        if [ -d "$BASE_BACKUP_DIR" ]; then
            print_status "All tenant backups:"
            echo ""
            
            local tenants=$(find "$BASE_BACKUP_DIR" -mindepth 1 -maxdepth 1 -type d -exec basename {} \; | sort)
            
            if [ -z "$tenants" ]; then
                print_warning "No tenant backup directories found"
                return
            fi
            
            for t in $tenants; do
                echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
                echo "Tenant: $t"
                list_backups "$t"
            done
        else
            print_warning "Backup directory does not exist"
        fi
    fi
}

# Function to show help
show_help() {
    echo "Easy Kanban Multi-Tenant Backup Script for Kubernetes"
    echo ""
    echo "Usage: $0 [TENANT] [OPTIONS]"
    echo ""
    echo "Arguments:"
    echo "  TENANT             Tenant name to backup (e.g., code7, drenlia, info)"
    echo "                     Use 'all' to backup all tenants"
    echo "                     Omit to show available tenants"
    echo ""
    echo "Options:"
    echo "  -h, --help         Show this help message"
    echo "  -l, --list         List existing backups"
    echo "  -c, --cleanup      Cleanup old backups (keep ${RETENTION_DAYS} days)"
    echo "  --no-cleanup       Skip automatic cleanup"
    echo ""
    echo "Examples:"
    echo "  $0                           # Backup all tenants (default)"
    echo "  $0 code7                     # Backup code7 tenant with automatic cleanup"
    echo "  $0 code7 --no-cleanup        # Backup code7 without cleanup"
    echo "  $0 all                       # Backup all tenants"
    echo "  $0 code7 --list              # List backups for code7"
    echo "  $0 --list                    # List all backups"
    echo "  $0 code7 --cleanup           # Only cleanup old backups for code7"
    echo "  $0 --cleanup                 # Cleanup old backups for all tenants"
    echo ""
    echo "Backup structure:"
    echo "  backups/{tenant}/kanban-{tenant}-backup-{TIMESTAMP}.db"
    echo "  backups/{tenant}/kanban-{tenant}-attachments-{TIMESTAMP}.tar.gz"
    echo "  backups/{tenant}/kanban-{tenant}-avatars-{TIMESTAMP}.tar.gz"
    echo ""
    echo "Retention: ${RETENTION_DAYS} days"
    echo ""
}

# Main function
main() {
    local tenant=""
    local do_backup=false
    local do_cleanup=true
    local list_only=false
    local cleanup_only=false
    local backup_all=false
    
    # Parse command line arguments
    # If no arguments provided, default to backing up all tenants
    if [ $# -eq 0 ]; then
        backup_all=true
        do_backup=true
    fi
    
    # First argument might be tenant name
    if [ $# -gt 0 ] && [[ ! "$1" =~ ^- ]]; then
        tenant="$1"
        if [ "$tenant" = "all" ]; then
            backup_all=true
            do_backup=true
        else
            do_backup=true
        fi
        shift
    fi
    
    while [[ $# -gt 0 ]]; do
        case $1 in
            -h|--help)
                show_help
                exit 0
                ;;
            -l|--list)
                list_only=true
                do_backup=false
                backup_all=false
                shift
                ;;
            -c|--cleanup)
                cleanup_only=true
                do_backup=false
                backup_all=false
                shift
                ;;
            --no-cleanup)
                do_cleanup=false
                shift
                ;;
            *)
                print_error "Unknown option: $1"
                show_help
                exit 1
                ;;
        esac
    done
    
    # Show header
    echo "=========================================="
    echo "Easy Kanban Multi-Tenant Backup Script"
    echo "=========================================="
    echo ""
    
    # List backups only
    if [ "$list_only" = true ]; then
        list_backups "$tenant"
        exit 0
    fi
    
    # Cleanup only
    if [ "$cleanup_only" = true ]; then
        if [ -n "$tenant" ]; then
            cleanup_old_backups "$tenant"
        else
            # Cleanup for all tenants
            local pod_name=$(get_nfs_pod_name)
            local tenants_dir="/exports/data/tenants"
            local tenants=$(kubectl exec -n "$NAMESPACE" "$pod_name" -- sh -c "ls -d ${tenants_dir}/*/ 2>/dev/null | xargs -n1 basename 2>/dev/null | sort" 2>/dev/null || echo "")
            if [ -z "$tenants" ]; then
                print_warning "No Easy Kanban tenants found"
                exit 0
            fi
            echo "$tenants" | while read -r t; do
                if [ -n "$t" ]; then
                    cleanup_old_backups "$t"
                fi
            done
        fi
        exit 0
    fi
    
    # Full backup process
    if [ "$do_backup" = true ]; then
        if [ "$backup_all" = true ]; then
            if backup_all_tenants; then
                echo ""
                print_success "All backups completed!"
            fi
        else
            # If no tenant specified but do_backup is true, backup all tenants
            if [ -z "$tenant" ]; then
                if backup_all_tenants; then
                    echo ""
                    print_success "All backups completed!"
                fi
            else
                check_tenant "$tenant"
                
                local backup_success=true
                
                if ! backup_database "$tenant"; then
                    backup_success=false
                fi
                
                if ! backup_attachments "$tenant"; then
                    backup_success=false
                fi
                
                if ! backup_avatars "$tenant"; then
                    backup_success=false
                fi
                
                if [ "$backup_success" = true ]; then
                    if [ "$do_cleanup" = true ]; then
                        cleanup_old_backups "$tenant"
                    fi
                    
                    echo ""
                    print_success "Backup completed successfully!"
                    echo ""
                    list_backups "$tenant"
                else
                    print_error "Backup failed!"
                    exit 1
                fi
            fi
        fi
    fi
}

# Run main function with all arguments
main "$@"

