#!/bin/bash

# Script to extract task move performance breakdown from logs
# Usage: ./scripts/extract-task-move-timing.sh [pod-name] [--since=10m]

NAMESPACE="easy-kanban"
SINCE="${2:-10m}"

# Get pod name if provided, otherwise get first running pod
if [ -n "$1" ] && [ "$1" != "--since" ]; then
  POD="$1"
else
  POD=$(kubectl get pods -n "$NAMESPACE" -l app=easy-kanban --field-selector=status.phase=Running -o jsonpath='{.items[0].metadata.name}' 2>/dev/null)
fi

if [ -z "$POD" ]; then
  echo "❌ No running easy-kanban pods found"
  exit 1
fi

echo "📊 Extracting task move timing from pod: $POD"
echo "   (Looking for logs from the last $SINCE)"
echo ""

# Extract timing data from logs
kubectl logs -n "$NAMESPACE" "$POD" --since="$SINCE" 2>/dev/null | \
  grep -E "\[batch-update-positions\]|\[PUT /tasks/:id\]" | \
  tail -20 | \
  awk '
    BEGIN {
      validation=0
      column_fetch=0
      activity_logging=0
      fetch_relationships=0
      websocket=0
      total=0
      db_updates=0
      count=0
    }
    /Task validation took/ {
      match($0, /([0-9]+)ms/, arr)
      validation += arr[1]
      count++
    }
    /Column fetch took/ {
      match($0, /([0-9]+)ms/, arr)
      column_fetch += arr[1]
    }
    /Activity logging took/ {
      match($0, /([0-9]+)ms/, arr)
      activity_logging += arr[1]
    }
    /Fetching.*tasks with relationships.*took/ {
      match($0, /([0-9]+)ms/, arr)
      fetch_relationships += arr[1]
    }
    /WebSocket publishing took/ {
      match($0, /([0-9]+)ms/, arr)
      websocket += arr[1]
    }
    /Database updates took/ {
      match($0, /([0-9]+)ms/, arr)
      db_updates += arr[1]
    }
    /Total endpoint time:/ {
      match($0, /([0-9]+)ms/, arr)
      total = arr[1]
      # Print breakdown for this operation
      if (total > 0) {
        print "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        print "Task Move Performance Breakdown"
        print "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        printf "Total endpoint time: %dms\n", total
        print ""
        print "Operation                    Time    % of Total"
        print "────────────────────────────────────────────────────"
        
        if (validation > 0) {
          printf "Task validation              %5dms   %5.1f%%\n", validation, (validation/total)*100
        }
        if (db_updates > 0) {
          printf "Database updates             %5dms   %5.1f%%\n", db_updates, (db_updates/total)*100
        }
        if (column_fetch > 0) {
          printf "Column fetch                 %5dms   %5.1f%%\n", column_fetch, (column_fetch/total)*100
        }
        if (activity_logging > 0) {
          printf "Activity logging             %5dms   %5.1f%%\n", activity_logging, (activity_logging/total)*100
        }
        if (fetch_relationships > 0) {
          printf "Fetching tasks with rels    %5dms   %5.1f%%\n", fetch_relationships, (fetch_relationships/total)*100
        }
        if (websocket > 0) {
          printf "WebSocket publishing         %5dms   %5.1f%%\n", websocket, (websocket/total)*100
        }
        
        # Calculate other overhead
        measured = validation + db_updates + column_fetch + activity_logging + fetch_relationships + websocket
        other = total - measured
        if (other > 0) {
          printf "Other overhead               %5dms   %5.1f%%\n", other, (other/total)*100
        }
        print ""
        
        # Reset for next operation
        validation=0
        column_fetch=0
        activity_logging=0
        fetch_relationships=0
        websocket=0
        db_updates=0
        total=0
      }
    }
  '

if [ $? -eq 0 ]; then
  echo ""
  echo "✅ Done. If no output above, try:"
  echo "   1. Move a task in the application"
  echo "   2. Run this script again"
  echo "   3. Or check logs manually: kubectl logs -n $NAMESPACE $POD --tail=100 | grep '⏱️'"
else
  echo "❌ Failed to extract timing data"
  exit 1
fi

