#!/bin/bash

# Gradual Rollout Script for Easy Kanban
# This script rolls out new images to all instances gradually to avoid CPU spikes

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
DELAY_BETWEEN_BATCHES=30  # seconds to wait between batches
BATCH_SIZE=2              # number of instances to update at once
HEALTH_CHECK_TIMEOUT=300  # seconds to wait for health check (increased for potential scheduling delays)

# Get all Easy Kanban namespaces
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}🚀 Easy Kanban Gradual Rollout Script${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "${YELLOW}Configuration:${NC}"
echo -e "  • Batch size: ${BATCH_SIZE} instances at a time"
echo -e "  • Delay between batches: ${DELAY_BETWEEN_BATCHES} seconds"
echo -e "  • Health check timeout: ${HEALTH_CHECK_TIMEOUT} seconds"
echo ""

# Get all namespaces
NAMESPACES=($(kubectl get namespaces -o json | jq -r '.items[].metadata.name | select(startswith("easy-kanban-"))' 2>/dev/null || true))

if [ ${#NAMESPACES[@]} -eq 0 ]; then
    echo -e "${RED}❌ No Easy Kanban namespaces found!${NC}"
    exit 1
fi

echo -e "${GREEN}📋 Found ${#NAMESPACES[@]} instances:${NC}"
for ns in "${NAMESPACES[@]}"; do
    echo -e "   • ${ns}"
done
echo ""

# Ask for confirmation
read -p "$(echo -e ${YELLOW}"Do you want to proceed with the gradual rollout? (y/n): "${NC})" -n 1 -r
echo ""
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo -e "${RED}❌ Rollout cancelled${NC}"
    exit 1
fi

echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}🔄 Starting Gradual Rollout${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Function to restart a deployment
restart_deployment() {
    local namespace=$1
    local deployment_name=$(echo $namespace | sed 's/easy-kanban-/easy-kanban-/')
    
    echo -e "${YELLOW}🔄 Rolling out: ${namespace}${NC}"
    
    # Restart the deployment
    if kubectl rollout restart deployment/${deployment_name} -n ${namespace} 2>&1; then
        echo -e "${GREEN}   ✓ Restart initiated${NC}"
        return 0
    else
        echo -e "${RED}   ✗ Failed to restart${NC}"
        return 1
    fi
}

# Function to wait for deployment to be ready
wait_for_deployment() {
    local namespace=$1
    local deployment_name=$(echo $namespace | sed 's/easy-kanban-/easy-kanban-/')
    
    echo -e "${BLUE}   ⏳ Waiting for deployment to be ready...${NC}"
    
    if kubectl rollout status deployment/${deployment_name} -n ${namespace} --timeout=${HEALTH_CHECK_TIMEOUT}s 2>&1 | grep -q "successfully rolled out"; then
        echo -e "${GREEN}   ✓ Deployment ready${NC}"
        
        # Additional health check - verify pod is running
        local pod_ready=$(kubectl get pods -n ${namespace} -l app=${deployment_name} -o jsonpath='{.items[0].status.conditions[?(@.type=="Ready")].status}' 2>/dev/null || echo "False")
        
        if [ "$pod_ready" == "True" ]; then
            echo -e "${GREEN}   ✓ Pod is healthy${NC}"
            return 0
        else
            echo -e "${YELLOW}   ⚠ Pod is not yet fully ready, but continuing...${NC}"
            return 0
        fi
    else
        echo -e "${RED}   ✗ Deployment failed or timed out${NC}"
        
        # Show diagnostic information
        echo -e "${YELLOW}   📋 Diagnostic Info:${NC}"
        
        # Check for scheduling issues
        local pod_name=$(kubectl get pods -n ${namespace} -l app=${deployment_name} --sort-by=.metadata.creationTimestamp -o jsonpath='{.items[-1:].metadata.name}' 2>/dev/null)
        if [ -n "$pod_name" ]; then
            local pod_phase=$(kubectl get pod ${pod_name} -n ${namespace} -o jsonpath='{.status.phase}' 2>/dev/null)
            echo -e "${YELLOW}      Pod Phase: ${pod_phase}${NC}"
            
            # Check for scheduling events
            if kubectl get events -n ${namespace} --field-selector involvedObject.name=${pod_name} 2>/dev/null | grep -i "FailedScheduling" >/dev/null; then
                echo -e "${RED}      ⚠ Scheduling Issue Detected!${NC}"
                kubectl get events -n ${namespace} --field-selector involvedObject.name=${pod_name} | grep "FailedScheduling" | tail -1
            fi
        fi
        
        return 1
    fi
}

# Process namespaces in batches
batch_num=1
total_batches=$(( (${#NAMESPACES[@]} + BATCH_SIZE - 1) / BATCH_SIZE ))

for ((i=0; i<${#NAMESPACES[@]}; i+=BATCH_SIZE)); do
    batch=("${NAMESPACES[@]:i:BATCH_SIZE}")
    
    echo ""
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BLUE}📦 Batch ${batch_num}/${total_batches} (${#batch[@]} instance(s))${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    
    # Restart all deployments in this batch
    failed_restarts=()
    for namespace in "${batch[@]}"; do
        if ! restart_deployment "$namespace"; then
            failed_restarts+=("$namespace")
        fi
    done
    
    # If any restarts failed, warn but continue
    if [ ${#failed_restarts[@]} -gt 0 ]; then
        echo -e "${YELLOW}⚠ Warning: Failed to restart: ${failed_restarts[*]}${NC}"
    fi
    
    echo ""
    
    # Wait for all deployments in this batch to be ready
    failed_deployments=()
    for namespace in "${batch[@]}"; do
        if ! wait_for_deployment "$namespace"; then
            failed_deployments+=("$namespace")
        fi
    done
    
    # Report batch results
    echo ""
    if [ ${#failed_deployments[@]} -eq 0 ]; then
        echo -e "${GREEN}✅ Batch ${batch_num} completed successfully${NC}"
    else
        echo -e "${RED}❌ Batch ${batch_num} had failures: ${failed_deployments[*]}${NC}"
        echo -e "${YELLOW}⚠ Continuing with next batch anyway...${NC}"
    fi
    
    # Wait between batches (except for the last batch)
    if [ $((i + BATCH_SIZE)) -lt ${#NAMESPACES[@]} ]; then
        echo ""
        echo -e "${YELLOW}⏳ Waiting ${DELAY_BETWEEN_BATCHES} seconds before next batch...${NC}"
        for ((j=DELAY_BETWEEN_BATCHES; j>0; j-=5)); do
            echo -ne "${YELLOW}   ${j} seconds remaining...\r${NC}"
            sleep 5
        done
        echo -e "${GREEN}   ✓ Ready for next batch${NC}          "
    fi
    
    ((batch_num++))
done

echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}📊 Final Status Check${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Get final status of all deployments
kubectl get deployments -A | grep -E 'NAMESPACE|easy-kanban-' | grep -v redis

echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}🏃 Pod Status${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

kubectl get pods -A | grep -E 'NAMESPACE|easy-kanban-' | grep -v redis

echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}✅ Gradual Rollout Complete!${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "${YELLOW}💡 Tip: You can customize the batch size and delays by editing${NC}"
echo -e "${YELLOW}   the configuration variables at the top of this script.${NC}"
echo ""

