#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="/root/hermes-dashboard"
LOG_FILE="/tmp/dashboard-deploy.log"
SERVICE="hermes-dashboard.service"
HEALTH_URL="http://127.0.0.1:3100/api/health"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"; }

log "=== Deploy started ==="

# 1. Build frontend
log "Building frontend..."
cd "$REPO_DIR/frontend"
npm install --prefer-offline 2>&1 | tail -1 >> "$LOG_FILE"
npm run build 2>&1 | tail -3 >> "$LOG_FILE"

# 2. Restart service
log "Restarting $SERVICE..."
systemctl restart "$SERVICE"

# 3. Wait for health check (max 15s)
log "Waiting for service..."
for i in $(seq 1 15); do
    if curl -sf "$HEALTH_URL" >/dev/null 2>&1; then
        log "Service is UP (attempt $i)"
        log "=== Deploy succeeded ==="
        exit 0
    fi
    sleep 1
done

log "ERROR: Service did not come up after 15s"
systemctl status "$SERVICE" --no-pager 2>&1 | tail -10 | while read -r line; do log "  $line"; done
log "=== Deploy FAILED ==="
exit 1
