"""
WebSocket router for real-time notifications.
Clients connect to /ws/{user_id} and receive live updates when:
- Faculty marks attendance (students get notified)
- Admin broadcasts a notification
- Exam registration is approved/rejected
"""

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends, Query
from typing import Dict, List
import json
import asyncio
from datetime import datetime

router = APIRouter(tags=["WebSocket"])

# ─── Connection Manager ───────────────────────────────────────────────────────

class ConnectionManager:
    def __init__(self):
        # Map user_id → list of active WebSocket connections
        self.active: Dict[int, List[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, user_id: int):
        await websocket.accept()
        if user_id not in self.active:
            self.active[user_id] = []
        self.active[user_id].append(websocket)
        print(f"WS: User {user_id} connected. Total: {self._total()}")

    def disconnect(self, websocket: WebSocket, user_id: int):
        if user_id in self.active:
            self.active[user_id] = [ws for ws in self.active[user_id] if ws != websocket]
            if not self.active[user_id]:
                del self.active[user_id]
        print(f"WS: User {user_id} disconnected. Total: {self._total()}")

    async def send_to_user(self, user_id: int, data: dict):
        """Send a message to all connections for a specific user."""
        if user_id in self.active:
            dead = []
            for ws in self.active[user_id]:
                try:
                    await ws.send_text(json.dumps(data))
                except Exception:
                    dead.append(ws)
            for ws in dead:
                self.active[user_id].remove(ws)

    async def broadcast_to_role(self, user_ids: List[int], data: dict):
        """Send to all users in a list of IDs (e.g. all students in a class)."""
        for uid in user_ids:
            await self.send_to_user(uid, data)

    async def broadcast_all(self, data: dict):
        """Send to every connected user."""
        for user_id in list(self.active.keys()):
            await self.send_to_user(user_id, data)

    def _total(self):
        return sum(len(v) for v in self.active.values())

    @property
    def connected_count(self):
        return self._total()


# Global manager — import this in other routers to push events
manager = ConnectionManager()


# ─── WebSocket Endpoint ───────────────────────────────────────────────────────

@router.websocket("/ws/{user_id}")
async def websocket_endpoint(websocket: WebSocket, user_id: int, token: str = Query(None)):
    """
    Real-time WebSocket endpoint.
    Connect: ws://localhost:8000/ws/{user_id}?token=<jwt>
    
    Messages pushed from server:
      { "type": "notification", "title": "...", "message": "...", "timestamp": "..." }
      { "type": "attendance_marked", "course": "...", "status": "present", "date": "..." }
      { "type": "marks_updated", "course": "...", "internal_total": 32 }
      { "type": "exam_approved", "semester": 4, "academic_year": "2024-25" }
      { "type": "ping", "connected_users": N }
    """
    await manager.connect(websocket, user_id)

    # Send welcome + stats
    await websocket.send_text(json.dumps({
        "type": "connected",
        "message": "Real-time connection established",
        "connected_users": manager.connected_count,
        "timestamp": datetime.utcnow().isoformat()
    }))

    # Periodic ping to keep connection alive and show live user count
    async def ping_loop():
        while True:
            try:
                await asyncio.sleep(30)
                await websocket.send_text(json.dumps({
                    "type": "ping",
                    "connected_users": manager.connected_count,
                    "timestamp": datetime.utcnow().isoformat()
                }))
            except Exception:
                break

    ping_task = asyncio.create_task(ping_loop())

    try:
        while True:
            # Listen for client messages (e.g. "mark as read" acks)
            data = await websocket.receive_text()
            try:
                msg = json.loads(data)
                if msg.get("type") == "ping":
                    await websocket.send_text(json.dumps({"type": "pong"}))
            except Exception:
                pass
    except WebSocketDisconnect:
        ping_task.cancel()
        manager.disconnect(websocket, user_id)
    except Exception:
        ping_task.cancel()
        manager.disconnect(websocket, user_id)


# ─── Stats Endpoint ───────────────────────────────────────────────────────────

@router.get("/ws/stats")
def ws_stats():
    return {
        "connected_users": manager.connected_count,
        "active_connections": {str(k): len(v) for k, v in manager.active.items()}
    }
