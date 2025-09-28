#!/bin/bash

# Easy Kanban Database Restore Script
# This script restores a SQLite database backup to the Docker container

set -e  # Exit on any error

# Configuration
CONTAINER_NAME="easy-kanban"
DB_PATH="/app/server/data/kanban.db"
BACKUP_DIR="./backups"
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

# Function to check if backup directory exists
check_backup_dir() {
    if [ ! -d "$BACKUP_DIR" ]; then
        print_error "Backup directory '$BACKUP_DIR' not found."
        print_status "Make sure you have created backups first using backup-db.sh"
        exit 1
    fi
}

# Function to list available backups
list_backups() {
    local backups=()
    local backup_files=()
    
    # Find all backup files (excluding symlinks)
    while IFS= read -r -d '' file; do
        if [[ "$file" == *"kanban-backup-"*".db" ]]; then
            backups+=("$file")
            backup_files+=("$(basename "$file")")
        fi
    done < <(find "$BACKUP_DIR" -name "kanban-backup-*.db" -type f -print0 2>/dev/null | sort -rz)
    
    if [ ${#backups[@]} -eq 0 ]; then
        print_error "No backup files found in '$BACKUP_DIR'"
        print_status "Available files:"
        ls -la "$BACKUP_DIR" 2>/dev/null || true
        exit 1
    fi
    
    echo "Available backups:"
    echo "=================="
    for i in "${!backups[@]}"; do
        local file="${backups[$i]}"
        local filename="${backup_files[$i]}"
        local size=$(du -h "$file" | cut -f1)
        local date=$(stat -c %y "$file" 2>/dev/null || stat -f %Sm "$file" 2>/dev/null || echo "Unknown")
        
        if [ $i -eq 0 ]; then
            echo "  [$((i+1))] $filename (LATEST) - $size - $date"
        else
            echo "  [$((i+1))] $filename - $size - $date"
        fi
    done
    echo ""
    
    # Return the backup files array
    printf '%s\n' "${backup_files[@]}"
}

# Function to select backup
select_backup() {
    # Get backup files directly from the directory
    local backup_files=()
    while IFS= read -r -d '' file; do
        if [[ "$file" == *"kanban-backup-"*".db" ]]; then
            backup_files+=("$(basename "$file")")
        fi
    done < <(find "$BACKUP_DIR" -name "kanban-backup-*.db" -type f -print0 2>/dev/null | sort -rz)
    
    local total_backups=${#backup_files[@]}
    
    if [ $total_backups -eq 0 ]; then
        print_error "No backups available"
        exit 1
    fi
    
    # Display available backups (to stderr so it doesn't interfere with return value)
    print_status "Available backups:" >&2
    echo "==================" >&2
    for i in "${!backup_files[@]}"; do
        local filename="${backup_files[$i]}"
        local filepath="${BACKUP_DIR}/${filename}"
        local size=$(du -h "$filepath" | cut -f1)
        local date=$(stat -c %y "$filepath" 2>/dev/null || stat -f %Sm "$filepath" 2>/dev/null || echo "Unknown")
        
        if [ $i -eq 0 ]; then
            echo "  [$((i+1))] $filename (LATEST) - $size - $date" >&2
        else
            echo "  [$((i+1))] $filename - $size - $date" >&2
        fi
    done
    echo "" >&2
    
    # Default to latest (first in the list)
    local default_choice=1
    local selected_file="${backup_files[0]}"
    
    if [ $total_backups -eq 1 ]; then
        print_status "Only one backup available, using: $selected_file" >&2
        echo "$selected_file"
        return
    fi
    
    print_status "Select backup to restore (default: $default_choice - latest):" >&2
    read -p "Enter choice [1-$total_backups] (or press Enter for latest): " choice
    
    # Use default if empty
    if [ -z "$choice" ]; then
        choice=$default_choice
    fi
    
    # Validate choice
    if ! [[ "$choice" =~ ^[0-9]+$ ]] || [ "$choice" -lt 1 ] || [ "$choice" -gt $total_backups ]; then
        print_error "Invalid choice. Please enter a number between 1 and $total_backups"
        exit 1
    fi
    
    # Get selected file (array is 0-indexed)
    local selected_index=$((choice - 1))
    selected_file="${backup_files[$selected_index]}"
    
    print_status "Selected backup: $selected_file" >&2
    echo "$selected_file"
}

# Function to create backup of current database before restore
backup_current_db() {
    local current_backup_path="${BACKUP_DIR}/kanban-pre-restore-$(date +%Y%m%d_%H%M%S).db"
    
    print_status "Creating backup of current database before restore..."
    
    if docker cp "${CONTAINER_NAME}:${DB_PATH}" "$current_backup_path" 2>/dev/null; then
        print_success "Current database backed up to: $current_backup_path"
        return 0
    else
        print_warning "Could not backup current database (it might not exist or be accessible)"
        return 1
    fi
}

# Function to restore database
restore_database() {
    local backup_file="$1"
    local backup_path="${BACKUP_DIR}/${backup_file}"
    
    if [ ! -f "$backup_path" ]; then
        print_error "Backup file not found: $backup_path"
        exit 1
    fi
    
    print_status "Restoring database from: $backup_file"
    print_warning "This will replace the current database in the container!"
    
    # Confirm restore
    read -p "Are you sure you want to continue? (yes/no): " confirm
    if [ "$confirm" != "yes" ]; then
        print_status "Restore cancelled"
        exit 0
    fi
    
    # Create backup of current database
    backup_current_db
    
    # Stop the container to ensure database is not in use
    print_status "Stopping container to ensure database is not in use..."
    docker stop "$CONTAINER_NAME"
    
    # Copy backup to container
    print_status "Copying backup to container..."
    if docker cp "$backup_path" "${CONTAINER_NAME}:${DB_PATH}"; then
        print_success "Database restored successfully!"
        
        # Start the container
        print_status "Starting container..."
        docker start "$CONTAINER_NAME"
        
        # Wait a moment for container to start
        sleep 2
        
        # Verify container is running
        if docker ps --format "table {{.Names}}" | grep -q "^${CONTAINER_NAME}$"; then
            print_success "Container started successfully"
        else
            print_warning "Container may not have started properly. Check with: docker ps"
        fi
        
        return 0
    else
        print_error "Failed to restore database"
        # Try to start container anyway
        docker start "$CONTAINER_NAME" 2>/dev/null || true
        exit 1
    fi
}

# Function to show help
show_help() {
    echo "Easy Kanban Database Restore Script"
    echo ""
    echo "Usage: $0 [OPTIONS]"
    echo ""
    echo "Options:"
    echo "  -h, --help     Show this help message"
    echo "  -l, --list     List available backups"
    echo "  -f, --file     Specify backup file directly"
    echo ""
    echo "Examples:"
    echo "  $0                    # Interactive restore (select from list)"
    echo "  $0 --list            # List available backups"
    echo "  $0 --file kanban-backup-20240101_120000.db  # Restore specific file"
    echo ""
    echo "Note: This script will create a backup of your current database"
    echo "      before restoring, so you can always go back if needed."
    echo ""
}

# Main function
main() {
    local list_only=false
    local backup_file=""
    
    # Parse command line arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            -h|--help)
                show_help
                exit 0
                ;;
            -l|--list)
                list_only=true
                shift
                ;;
            -f|--file)
                backup_file="$2"
                shift 2
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
    echo "Easy Kanban Database Restore Script"
    echo "=================================="
    echo ""
    
    # Check prerequisites
    check_backup_dir
    
    # List backups only
    if [ "$list_only" = true ]; then
        list_backups
        exit 0
    fi
    
    # Check container
    check_container
    
    # Select backup file
    if [ -z "$backup_file" ]; then
        backup_file=$(select_backup)
    else
        # Validate specified file exists
        if [ ! -f "${BACKUP_DIR}/${backup_file}" ]; then
            print_error "Specified backup file not found: ${BACKUP_DIR}/${backup_file}"
            print_status "Available backups:"
            list_backups
            exit 1
        fi
        print_status "Using specified backup file: $backup_file"
    fi
    
    # Restore database
    if restore_database "$backup_file"; then
        echo ""
        print_success "Restore completed successfully!"
        print_status "The application should now be running with the restored database."
        print_status "You can access it at: http://localhost:3000"
    else
        exit 1
    fi
}

# Run main function with all arguments
main "$@"
