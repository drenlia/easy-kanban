#!/bin/bash

# Easy Kanban Multi-Tenant Instance Management Script

set -e

# Function to display usage
usage() {
    echo "Usage: $0 <command> [options]"
    echo ""
    echo "Commands:"
    echo "  list                    - List all Easy Kanban instances"
    echo "  status <instance_name>  - Show status of a specific instance"
    echo "  logs <instance_name>   - Show logs for a specific instance"
    echo "  scale <instance_name> <replicas> - Scale an instance"
    echo "  delete <instance_name> - Delete an instance"
    echo "  cleanup                 - Delete all instances (use with caution)"
    echo ""
    echo "Examples:"
    echo "  $0 list"
    echo "  $0 status my-company"
    echo "  $0 logs my-company"
    echo "  $0 scale my-company 3"
    echo "  $0 delete my-company"
    exit 1
}

# Check if kubectl is available
if ! command -v kubectl &> /dev/null; then
    echo "❌ kubectl is not installed or not in PATH"
    exit 1
fi

# Check if cluster is accessible
if ! kubectl cluster-info &> /dev/null; then
    echo "❌ Cannot connect to Kubernetes cluster"
    exit 1
fi

COMMAND="$1"

case "$COMMAND" in
    "list")
        echo "📋 Easy Kanban Instances:"
        echo ""
        NAMESPACES=$(kubectl get namespaces -o jsonpath='{.items[*].metadata.name}' | tr ' ' '\n' | grep '^easy-kanban-' | sort)
        
        if [ -z "$NAMESPACES" ]; then
            echo "No Easy Kanban instances found."
        else
            printf "%-30s %-20s %-15s %-20s\n" "NAMESPACE" "INSTANCE_NAME" "STATUS" "PODS"
            echo "--------------------------------------------------------------------------------"
            
            for ns in $NAMESPACES; do
                INSTANCE_NAME=$(echo "$ns" | sed 's/easy-kanban-//')
                STATUS=$(kubectl get namespace "$ns" -o jsonpath='{.status.phase}' 2>/dev/null || echo "Unknown")
                PODS=$(kubectl get pods -n "$ns" --no-headers 2>/dev/null | wc -l || echo "0")
                printf "%-30s %-20s %-15s %-20s\n" "$ns" "$INSTANCE_NAME" "$STATUS" "$PODS"
            done
        fi
        ;;
        
    "status")
        if [ $# -ne 2 ]; then
            echo "❌ Error: Instance name required"
            echo "Usage: $0 status <instance_name>"
            exit 1
        fi
        
        INSTANCE_NAME="$2"
        NAMESPACE="easy-kanban-${INSTANCE_NAME}"
        
        echo "📊 Status for instance: ${INSTANCE_NAME}"
        echo "📍 Namespace: ${NAMESPACE}"
        echo ""
        
        # Check if namespace exists
        if ! kubectl get namespace "$NAMESPACE" &> /dev/null; then
            echo "❌ Instance '${INSTANCE_NAME}' not found"
            exit 1
        fi
        
        echo "🔍 Pods:"
        kubectl get pods -n "$NAMESPACE"
        echo ""
        
        echo "🌐 Services:"
        kubectl get services -n "$NAMESPACE"
        echo ""
        
        echo "🔗 Ingress:"
        kubectl get ingress -n "$NAMESPACE"
        echo ""
        
        echo "📈 Deployment Status:"
        kubectl get deployment -n "$NAMESPACE"
        ;;
        
    "logs")
        if [ $# -ne 2 ]; then
            echo "❌ Error: Instance name required"
            echo "Usage: $0 logs <instance_name>"
            exit 1
        fi
        
        INSTANCE_NAME="$2"
        NAMESPACE="easy-kanban-${INSTANCE_NAME}"
        
        # Check if namespace exists
        if ! kubectl get namespace "$NAMESPACE" &> /dev/null; then
            echo "❌ Instance '${INSTANCE_NAME}' not found"
            exit 1
        fi
        
        echo "📋 Logs for instance: ${INSTANCE_NAME}"
        echo "📍 Namespace: ${NAMESPACE}"
        echo ""
        
        kubectl logs -f deployment/easy-kanban -n "$NAMESPACE"
        ;;
        
    "scale")
        if [ $# -ne 3 ]; then
            echo "❌ Error: Instance name and replica count required"
            echo "Usage: $0 scale <instance_name> <replicas>"
            exit 1
        fi
        
        INSTANCE_NAME="$2"
        REPLICAS="$3"
        NAMESPACE="easy-kanban-${INSTANCE_NAME}"
        
        # Check if namespace exists
        if ! kubectl get namespace "$NAMESPACE" &> /dev/null; then
            echo "❌ Instance '${INSTANCE_NAME}' not found"
            exit 1
        fi
        
        echo "📈 Scaling instance '${INSTANCE_NAME}' to ${REPLICAS} replicas..."
        kubectl scale deployment easy-kanban --replicas="$REPLICAS" -n "$NAMESPACE"
        
        echo "⏳ Waiting for scaling to complete..."
        kubectl rollout status deployment/easy-kanban -n "$NAMESPACE"
        
        echo "✅ Scaling completed!"
        kubectl get pods -n "$NAMESPACE"
        ;;
        
    "delete")
        if [ $# -ne 2 ]; then
            echo "❌ Error: Instance name required"
            echo "Usage: $0 delete <instance_name>"
            exit 1
        fi
        
        INSTANCE_NAME="$2"
        NAMESPACE="easy-kanban-${INSTANCE_NAME}"
        
        # Check if namespace exists
        if ! kubectl get namespace "$NAMESPACE" &> /dev/null; then
            echo "❌ Instance '${INSTANCE_NAME}' not found"
            exit 1
        fi
        
        echo "⚠️  WARNING: This will permanently delete instance '${INSTANCE_NAME}' and all its data!"
        echo "📍 Namespace to delete: ${NAMESPACE}"
        echo ""
        read -p "Are you sure you want to continue? (yes/no): " CONFIRM
        
        if [ "$CONFIRM" = "yes" ]; then
            echo "🗑️  Deleting instance '${INSTANCE_NAME}'..."
            kubectl delete namespace "$NAMESPACE"
            echo "✅ Instance '${INSTANCE_NAME}' deleted successfully!"
        else
            echo "❌ Deletion cancelled"
        fi
        ;;
        
    "cleanup")
        echo "⚠️  WARNING: This will delete ALL Easy Kanban instances!"
        echo ""
        read -p "Are you sure you want to continue? (yes/no): " CONFIRM
        
        if [ "$CONFIRM" = "yes" ]; then
            echo "🗑️  Deleting all Easy Kanban instances..."
            NAMESPACES=$(kubectl get namespaces -o jsonpath='{.items[*].metadata.name}' | tr ' ' '\n' | grep '^easy-kanban-')
            
            if [ -z "$NAMESPACES" ]; then
                echo "No Easy Kanban instances found."
            else
                for ns in $NAMESPACES; do
                    INSTANCE_NAME=$(echo "$ns" | sed 's/easy-kanban-//')
                    echo "Deleting instance: ${INSTANCE_NAME}"
                    kubectl delete namespace "$ns"
                done
                echo "✅ All instances deleted successfully!"
            fi
        else
            echo "❌ Cleanup cancelled"
        fi
        ;;
        
    *)
        echo "❌ Error: Unknown command '$COMMAND'"
        usage
        ;;
esac
