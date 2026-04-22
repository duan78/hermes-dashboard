"""
WebSocket Hub + State Polling Bridge for real-time dashboard updates.

- WebSocketHub: manages authenticated WS connections, broadcasts events
- StatePollBridge: polls file-system state every 3s, emits change events
"""

import asyncio
import json
import logging
import time

from fastapi import WebSocket, WebSocketDisconnect

from .utils import hermes_path

logger = logging.getLogger(__name__)


class WebSocketHub:
    """Manages WebSocket connections and broadcasts events to clients."""

    def __init__(self):
        self._connections: list[WebSocket] = []
        self._authenticated: set[WebSocket] = set()

    async def connect(self, ws: WebSocket):
        await ws.accept()
        self._connections.append(ws)

    def disconnect(self, ws: WebSocket):
        if ws in self._connections:
            self._connections.remove(ws)
        self._authenticated.discard(ws)

    def authenticate(self, ws: WebSocket):
        self._authenticated.add(ws)

    def is_authenticated(self, ws: WebSocket) -> bool:
        return ws in self._authenticated

    async def broadcast(self, event_type: str, data: dict = None):
        """Broadcast an event to all authenticated connections."""
        if not self._authenticated:
            return
        payload = json.dumps({"type": event_type, "data": data or {}, "ts": time.time()})
        disconnected = []
        for ws in list(self._authenticated):
            try:
                await ws.send_text(payload)
            except Exception:
                disconnected.append(ws)
        for ws in disconnected:
            self.disconnect(ws)

    @property
    def connection_count(self) -> int:
        return len(self._authenticated)


class StatePollBridge:
    """Polls file-system state and emits WebSocket events on changes."""

    def __init__(self, hub: WebSocketHub, interval: float = 3.0):
        self.hub = hub
        self.interval = interval
        self._task: asyncio.Task | None = None
        self._running = False

        # State tracking
        self._state_db_mtime: float = 0
        self._gateway_state_mtime: float = 0
        self._cron_dir_mtime: float = 0
        self._last_cron_output: dict = {}

    def start(self):
        if self._task is None or self._task.done():
            self._running = True
            self._task = asyncio.create_task(self._poll_loop())
            logger.info("StatePollBridge started (interval=%.1fs)", self.interval)

    def stop(self):
        self._running = False
        if self._task and not self._task.done():
            self._task.cancel()
            logger.info("StatePollBridge stopped")

    async def _poll_loop(self):
        while self._running:
            try:
                await self._check_changes()
            except Exception as e:
                logger.warning("StatePollBridge error: %s", e)
            await asyncio.sleep(self.interval)

    async def _check_changes(self):
        # 1. state.db mtime (new sessions)
        state_db = hermes_path("state.db")
        if state_db.exists():
            mtime = state_db.stat().st_mtime
            if self._state_db_mtime and mtime > self._state_db_mtime:
                await self.hub.broadcast("session:new", {"source": "state_db"})
            self._state_db_mtime = mtime

        # 2. gateway_state.json mtime (platform status, cost)
        gw_path = hermes_path("gateway_state.json")
        if gw_path.exists():
            mtime = gw_path.stat().st_mtime
            if self._gateway_state_mtime and mtime > self._gateway_state_mtime:
                try:
                    gw_data = json.loads(gw_path.read_text())
                    platforms = gw_data.get("platforms", {})
                    for name, info in platforms.items():
                        await self.hub.broadcast("platform:status", {
                            "platform": name,
                            "state": info.get("state", "unknown"),
                        })
                except (json.JSONDecodeError, Exception):
                    pass
            self._gateway_state_mtime = mtime

        # 3. Cron directory changes
        cron_dir = hermes_path("cron")
        if cron_dir.exists():
            try:
                dir_mtime = cron_dir.stat().st_mtime
                if self._cron_dir_mtime and dir_mtime > self._cron_dir_mtime:
                    await self.hub.broadcast("cron:output", {"change": "updated"})
                self._cron_dir_mtime = dir_mtime

                # Check individual cron output files
                for f in cron_dir.glob("*.json"):
                    try:
                        data = json.loads(f.read_text())
                        last_output = data.get("last_output", "")
                        job_id = f.stem
                        if job_id in self._last_cron_output:
                            if last_output != self._last_cron_output[job_id]:
                                await self.hub.broadcast("cron:output", {
                                    "job_id": job_id,
                                    "output": last_output[:200],
                                })
                        self._last_cron_output[job_id] = last_output
                    except (json.JSONDecodeError, Exception):
                        pass
            except OSError:
                pass


# Singleton instances
hub = WebSocketHub()
poll_bridge = StatePollBridge(hub)


async def ws_hub_handler(ws: WebSocket):
    """WebSocket endpoint handler for the dashboard hub."""
    await hub.connect(ws)
    try:
        while True:
            raw = await ws.receive_text()
            try:
                msg = json.loads(raw)
            except json.JSONDecodeError:
                continue

            # Auth required as first message
            if msg.get("type") == "auth":
                token=msg.get("token", "")
                logger.warning("WS auth attempt: token=%s len=%d", token[:30] if token else "EMPTY", len(token) if token else 0)
                from .auth import verify_token, _try_parse_jwt, _load_user_by_id
                # Try JWT user token first (same logic as AuthMiddleware for HTTP)
                authenticated=False
                if token:
                    jwt_payload=_try_parse_jwt(token)
                    if jwt_payload:
                        user=_load_user_by_id(int(jwt_payload.get("sub", 0)))
                        if user:
                            authenticated=True
                # Fall back to legacy token
                if not authenticated and verify_token(token):
                    authenticated=True
                if authenticated:
                    hub.authenticate(ws)
                    await ws.send_text(json.dumps({"type": "auth_ok"}))
                    logger.info("WS client authenticated (total=%d)", hub.connection_count)
                else:
                    await ws.send_text(json.dumps({"type": "auth_error", "data": {"message": "Invalid token"}}))
                    await ws.close()
                    return
                continue

            # Must be authenticated for other messages
            if not hub.is_authenticated(ws):
                await ws.send_text(json.dumps({"type": "auth_error", "data": {"message": "Not authenticated"}}))
                await ws.close()
                return

    except WebSocketDisconnect:
        pass
    finally:
        hub.disconnect(ws)
        logger.info("WS client disconnected (total=%d)", hub.connection_count)
