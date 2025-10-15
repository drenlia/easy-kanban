#!/bin/bash

# Easy Kanban Database Backup Script for Kubernetes
# This script creates a backup of the SQLite database from Kubernetes pods

set -e  # Exit on any error

# Configuration
DB_PATH="/app/server/data/kanban.db"
BACKUP_DIR="./backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

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

# Function to list available instances
list_instances() {
    print_status "Available Easy Kanban instances:"
    kubectl get namespaces | grep "easy-kanban-" | awk '{print "  - " $1}' | sed 's/easy-kanban-//'
}

# Function to check if namespace exists
check_namespace() {
    local customer=$1
    local namespace="easy-kanban-${customer}"
    
    if ! kubectl get namespace "$namespace" &>/dev/null; then
        print_error "Namespace '${namespace}' not found."
        echo ""
        list_instances
        exit 1
    fi
}

# Function to get pod name for instance
get_pod_name() {
    local customer=$1
    local namespace="easy-kanban-${customer}"
    
    local pod_name=$(kubectl get pods -n "$namespace" -l app=easy-kanban-${customer} -o jsonpath='{.items[0].metadata.name}' 2>/dev/null)
    
    if [ -z "$pod_name" ]; then
        print_error "No Easy Kanban pod found in namespace '${namespace}'"
        exit 1
    fi
    
    # Check if pod is running
    local pod_status=$(kubectl get pod "$pod_name" -n "$namespace" -o jsonpath='{.status.phase}')
    if [ "$pod_status" != "Running" ]; then
        print_error "Pod '${pod_name}' is not running (status: ${pod_status})"
        exit 1
    fi
    
    echo "$pod_name"
}

# Function to create backup directory
create_backup_dir() {
    if [ ! -d "$BACKUP_DIR" ]; then
        print_status "Creating backup directory: $BACKUP_DIR"
        mkdir -p "$BACKUP_DIR"
    fi
}

# Function to backup database
backup_database() {
    local customer=$1
    local namespace="easy-kanban-${customer}"
    local pod_name=$(get_pod_name "$customer")
    local backup_filename="kanban-${customer}-backup-${TIMESTAMP}.db"
    local backup_path="${BACKUP_DIR}/${backup_filename}"
    local latest_filename="kanban-${customer}-latest.db"
    local latest_path="${BACKUP_DIR}/${latest_filename}"
    
    print_status "Backing up database from pod '${pod_name}' in namespace '${namespace}'..."
    
    # Copy database from pod
    if kubectl cp "${namespace}/${pod_name}:${DB_PATH}" "$backup_path" 2>/dev/null; then
        print_success "Database backed up to: $backup_path"
        
        # Create/update latest backup symlink
        if [ -L "$latest_path" ]; then
            rm "$latest_path"
        fi
        ln -s "$(basename "$backup_path")" "$latest_path"
        print_status "Latest backup link updated: $latest_path"
        
        # Show backup info
        local size=$(du -h "$backup_path" | cut -f1)
        print_success "Backup size: $size"
        
        return 0
    else
        print_error "Failed to backup database from pod '${pod_name}'"
        return 1
    fi
}

# Function to backup all instances
backup_all_instances() {
    print_status "Backing up all Easy Kanban instances..."
    echo ""
    
    local namespaces=$(kubectl get namespaces -o name | grep "namespace/easy-kanban-" | sed 's|namespace/easy-kanban-||')
    
    if [ -z "$namespaces" ]; then
        print_warning "No Easy Kanban instances found"
        exit 0
    fi
    
    local success_count=0
    local fail_count=0
    
    for customer in $namespaces; do
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        print_status "Processing instance: ${customer}"
        echo ""
        
        if backup_database "$customer"; then
            ((success_count++))
        else
            ((fail_count++))
        fi
        echo ""
    done
    
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    print_success "Backup Summary: ${success_count} successful, ${fail_count} failed"
}

# Function to list existing backups
list_backups() {
    local customer=$1
    
    if [ -d "$BACKUP_DIR" ]; then
        if [ -n "$customer" ]; then
            # List backups for specific customer
            if ls "$BACKUP_DIR"/kanban-${customer}-backup-*.db 2>/dev/null | grep -q .; then
                print_status "Backups for instance '${customer}':"
                ls -lah "$BACKUP_DIR"/kanban-${customer}-backup-*.db 2>/dev/null | while read line; do
                    echo "  $line"
                done
            else
                print_warning "No backups found for instance '${customer}'"
            fi
        else
            # List all backups
            if ls "$BACKUP_DIR"/kanban-*-backup-*.db 2>/dev/null | grep -q .; then
                print_status "All backups:"
                ls -lah "$BACKUP_DIR"/kanban-*-backup-*.db 2>/dev/null | while read line; do
                    echo "  $line"
                done
            else
                print_warning "No backups found"
            fi
        fi
    else
        print_warning "Backup directory does not exist"
    fi
}

# Function to cleanup old backups (keep last 10 per instance)
cleanup_old_backups() {
    local customer=$1
    
    if [ ! -d "$BACKUP_DIR" ]; then
        print_warning "Backup directory does not exist"
        return
    fi
    
    if [ -n "$customer" ]; then
        # Cleanup for specific customer
        local backup_count=$(ls -1 "$BACKUP_DIR"/kanban-${customer}-backup-*.db 2>/dev/null | wc -l)
        if [ "$backup_count" -gt 10 ]; then
            print_status "Cleaning up old backups for '${customer}' (keeping last 10)..."
            ls -1t "$BACKUP_DIR"/kanban-${customer}-backup-*.db | tail -n +11 | xargs rm -f
            print_success "Old backups cleaned up for '${customer}'"
        else
            print_status "No cleanup needed for '${customer}' (${backup_count} backups)"
        fi
    else
        # Cleanup for all customers
        print_status "Cleaning up old backups for all instances (keeping last 10 per instance)..."
        
        # Get unique customer names from backup files
        local customers=$(ls "$BACKUP_DIR"/kanban-*-backup-*.db 2>/dev/null | \
            sed 's|.*/kanban-\([^-]*\)-backup-.*|\1|' | sort -u)
        
        if [ -z "$customers" ]; then
            print_warning "No backups found to cleanup"
            return
        fi
        
        for cust in $customers; do
            local backup_count=$(ls -1 "$BACKUP_DIR"/kanban-${cust}-backup-*.db 2>/dev/null | wc -l)
            if [ "$backup_count" -gt 10 ]; then
                print_status "  Cleaning up old backups for '${cust}'..."
                ls -1t "$BACKUP_DIR"/kanban-${cust}-backup-*.db | tail -n +11 | xargs rm -f
            fi
        done
        
        print_success "Cleanup completed for all instances"
    fi
}

# Function to show help
show_help() {
    echo "Easy Kanban Database Backup Script for Kubernetes"
    echo ""
    echo "Usage: $0 [CUSTOMER] [OPTIONS]"
    echo ""
    echo "Arguments:"
    echo "  CUSTOMER           Instance name to backup (e.g., code7, drenlia, info)"
    echo "                     Use 'all' to backup all instances"
    echo "                     Omit to show available instances"
    echo ""
    echo "Options:"
    echo "  -h, --help         Show this help message"
    echo "  -l, --list         List existing backups"
    echo "  -c, --cleanup      Cleanup old backups (keep last 10 per instance)"
    echo "  --no-cleanup       Skip automatic cleanup"
    echo ""
    echo "Examples:"
    echo "  $0                           # Show available instances"
    echo "  $0 code7                     # Backup code7 instance with automatic cleanup"
    echo "  $0 code7 --no-cleanup        # Backup code7 without cleanup"
    echo "  $0 all                       # Backup all instances"
    echo "  $0 code7 --list              # List backups for code7"
    echo "  $0 --list                    # List all backups"
    echo "  $0 code7 --cleanup           # Only cleanup old backups for code7"
    echo "  $0 --cleanup                 # Cleanup old backups for all instances"
    echo ""
    echo "Output format: backups/kanban-{customer}-backup-{TIMESTAMP}.db"
    echo ""
}

# Main function
main() {
    local customer=""
    local do_backup=false
    local do_cleanup=true
    local list_only=false
    local cleanup_only=false
    local backup_all=false
    
    # Parse command line arguments
    if [ $# -eq 0 ]; then
        show_help
        echo ""
        list_instances
        exit 0
    fi
    
    # First argument might be customer name
    if [ $# -gt 0 ] && [[ ! "$1" =~ ^- ]]; then
        customer="$1"
        if [ "$customer" = "all" ]; then
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
    echo "Easy Kanban K8s Database Backup Script"
    echo "=========================================="
    echo ""
    
    # List backups only
    if [ "$list_only" = true ]; then
        list_backups "$customer"
        exit 0
    fi
    
    # Cleanup only
    if [ "$cleanup_only" = true ]; then
        cleanup_old_backups "$customer"
        exit 0
    fi
    
    # Full backup process
    if [ "$do_backup" = true ]; then
        create_backup_dir
        
        if [ "$backup_all" = true ]; then
            if backup_all_instances; then
                if [ "$do_cleanup" = true ]; then
                    echo ""
                    cleanup_old_backups ""
                fi
                
                echo ""
                print_success "All backups completed!"
                echo ""
                list_backups ""
            fi
        else
            check_namespace "$customer"
            
            if backup_database "$customer"; then
                if [ "$do_cleanup" = true ]; then
                    cleanup_old_backups "$customer"
                fi
                
                echo ""
                print_success "Backup completed successfully!"
                echo ""
                list_backups "$customer"
            else
                exit 1
            fi
        fi
    fi
}

# Run main function with all arguments
main "$@"

