#!/bin/bash

# Easy Kanban Database Backup Script
# This script creates a backup of the SQLite database from the Docker container

set -e  # Exit on any error

# Configuration
CONTAINER_NAME="easy-kanban"
DB_PATH="/app/server/data/kanban.db"
BACKUP_DIR="./backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILENAME="kanban-backup-${TIMESTAMP}.db"
LATEST_BACKUP="kanban-latest.db"

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

# Function to check if container exists and is running
check_container() {
    if ! docker ps --format "table {{.Names}}" | grep -q "^${CONTAINER_NAME}$"; then
        if docker ps -a --format "table {{.Names}}" | grep -q "^${CONTAINER_NAME}$"; then
            print_error "Container '${CONTAINER_NAME}' exists but is not running."
            print_status "Try: docker-compose up -d"
            exit 1
        else
            print_error "Container '${CONTAINER_NAME}' not found."
            print_status "Make sure you're in the correct directory and the container exists."
            exit 1
        fi
    fi
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
    local backup_path="${BACKUP_DIR}/${BACKUP_FILENAME}"
    local latest_path="${BACKUP_DIR}/${LATEST_BACKUP}"
    
    print_status "Backing up database from container '${CONTAINER_NAME}'..."
    
    # Copy database from container
    if docker cp "${CONTAINER_NAME}:${DB_PATH}" "$backup_path"; then
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
        print_error "Failed to backup database"
        return 1
    fi
}

# Function to list existing backups
list_backups() {
    if [ -d "$BACKUP_DIR" ] && [ "$(ls -A $BACKUP_DIR 2>/dev/null)" ]; then
        print_status "Existing backups:"
        ls -lah "$BACKUP_DIR"/*.db 2>/dev/null | while read line; do
            echo "  $line"
        done
    else
        print_warning "No existing backups found"
    fi
}

# Function to cleanup old backups (keep last 10)
cleanup_old_backups() {
    if [ -d "$BACKUP_DIR" ]; then
        local backup_count=$(ls -1 "$BACKUP_DIR"/kanban-backup-*.db 2>/dev/null | wc -l)
        if [ "$backup_count" -gt 10 ]; then
            print_status "Cleaning up old backups (keeping last 10)..."
            ls -1t "$BACKUP_DIR"/kanban-backup-*.db | tail -n +11 | xargs rm -f
            print_success "Old backups cleaned up"
        fi
    fi
}

# Function to show help
show_help() {
    echo "Easy Kanban Database Backup Script"
    echo ""
    echo "Usage: $0 [OPTIONS]"
    echo ""
    echo "Options:"
    echo "  -h, --help     Show this help message"
    echo "  -l, --list     List existing backups"
    echo "  -c, --cleanup  Cleanup old backups (keep last 10)"
    echo "  --no-cleanup   Skip automatic cleanup"
    echo ""
    echo "Examples:"
    echo "  $0                    # Create backup with automatic cleanup"
    echo "  $0 --no-cleanup      # Create backup without cleanup"
    echo "  $0 --list            # List existing backups"
    echo "  $0 --cleanup         # Only cleanup old backups"
    echo ""
}

# Main function
main() {
    local do_backup=true
    local do_cleanup=true
    local list_only=false
    local cleanup_only=false
    
    # Parse command line arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            -h|--help)
                show_help
                exit 0
                ;;
            -l|--list)
                list_only=true
                do_backup=false
                shift
                ;;
            -c|--cleanup)
                cleanup_only=true
                do_backup=false
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
    echo "=================================="
    echo "Easy Kanban Database Backup Script"
    echo "=================================="
    echo ""
    
    # List backups only
    if [ "$list_only" = true ]; then
        list_backups
        exit 0
    fi
    
    # Cleanup only
    if [ "$cleanup_only" = true ]; then
        cleanup_old_backups
        exit 0
    fi
    
    # Full backup process
    if [ "$do_backup" = true ]; then
        check_container
        create_backup_dir
        
        if backup_database; then
            if [ "$do_cleanup" = true ]; then
                cleanup_old_backups
            fi
            
            echo ""
            print_success "Backup completed successfully!"
            list_backups
        else
            exit 1
        fi
    fi
}

# Run main function with all arguments
main "$@"
