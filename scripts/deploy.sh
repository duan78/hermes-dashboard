#!/usr/bin/env bash
# ── Hermes Dashboard Auto-Deploy Script ──
# Rebuilds the frontend and restarts the backend via systemd.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_DIR"

echo "=== Hermes Dashboard Deploy ==="
echo "Project dir: $PROJECT_DIR"
echo "Timestamp:   $(date -Iseconds)"

# 1. Pull latest code
echo ""
echo "[1/4] Pulling latest code..."
git pull --ff-only || {
    echo "ERROR: git pull failed. Resolve conflicts manually."
    exit 1
}

# 2. Install backend dependencies (if requirements changed)
echo ""
echo "[2/4] Installing backend dependencies..."
pip install -q -r backend/requirements.txt 2>/dev/null || true

# 3. Build frontend
echo ""
echo "[3/4] Building frontend..."
if [ -d "frontend" ] && [ -f "frontend/package.json" ]; then
    cd frontend
    npm install --silent 2>&1 | tail -1
    npm run build
    BUILD_EXIT=$?
    if [ $BUILD_EXIT -ne 0 ]; then
        echo "ERROR: Frontend build failed (exit code $BUILD_EXIT)."
        exit 1
    fi
    cd "$PROJECT_DIR"
    echo "Frontend build succeeded."
else
    echo "No frontend/ directory found — skipping build."
fi

# 4. Restart via systemd
echo ""
echo "[4/4] Restarting hermes-dashboard service..."
systemctl restart hermes-dashboard

# 5. Health check
echo ""
echo "Waiting for health check..."
HEALTH_OK=false
for i in $(seq 1 15); do
    if curl -sf http://127.0.0.1:3100/api/health > /dev/null 2>&1; then
        HEALTH_OK=true
        break
    fi
    sleep 1
done

if $HEALTH_OK; then
    echo "✅ Deploy successful — health check passed."
else
    echo "❌ Deploy may have failed — health check did not pass within 15s."
    echo "   Check logs: journalctl -u hermes-dashboard --no-pager -n 30"
    exit 1
fi
