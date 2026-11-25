from __future__ import annotations

import asyncio
import contextlib
import logging
import time
from dataclasses import dataclass, field
from typing import Any, Literal
from uuid import UUID

from fastapi import WebSocket

logger = logging.getLogger("daris.ws")


@dataclass
class LiveConnection:
    websocket: WebSocket
    role: Literal["student", "professor"]
    lecture_id: UUID
    token_hash: str | None = None
    professor_id: UUID | None = None
    connected_at: float = field(default_factory=time.monotonic)
    last_seen: float = field(default_factory=time.monotonic)
    send_lock: asyncio.Lock = field(default_factory=asyncio.Lock)
    rate_tokens: float = 20.0
    rate_last: float = field(default_factory=time.monotonic)
    closed: bool = False

    def take_rate_token(self, rate_per_second: int, burst: int) -> bool:
        now = time.monotonic()
        self.rate_tokens = min(
            float(burst), self.rate_tokens + (now - self.rate_last) * rate_per_second
        )
        self.rate_last = now
        if self.rate_tokens < 1.0:
            return False
        self.rate_tokens -= 1.0
        return True


class ConnectionManager:
    def __init__(self) -> None:
        self._connections: list[LiveConnection] = []
        self._lock = asyncio.Lock()
        self._background_tasks: set[asyncio.Task[None]] = set()

    async def add(self, connection: LiveConnection) -> None:
        async with self._lock:
            self._connections.append(connection)

    async def remove(self, connection: LiveConnection) -> None:
        async with self._lock:
            with contextlib.suppress(ValueError):
                self._connections.remove(connection)
            connection.closed = True

    async def send(self, connection: LiveConnection, event: dict[str, Any]) -> None:
        if connection.closed:
            return
        try:
            async with connection.send_lock:
                await connection.websocket.send_json(event)
        except Exception:
            connection.closed = True

    async def broadcast(
        self,
        lecture_id: UUID | str,
        event: dict[str, Any],
        *,
        role: Literal["student", "professor"] | None = None,
    ) -> int:
        sent = 0
        async with self._lock:
            targets = [
                item
                for item in self._connections
                if str(item.lecture_id) == str(lecture_id)
                and not item.closed
                and (role is None or item.role == role)
            ]
        for connection in targets:
            await self.send(connection, event)
            sent += 1
        return sent

    async def dispatch(self, event: dict[str, Any]) -> None:
        event_type = event.get("type")
        lecture_id = str(event.get("lecture_id", ""))
        if event_type == "ripple_update":
            await self.broadcast(lecture_id, event, role="professor")
        elif event_type == "lecture_state":
            await self.broadcast(lecture_id, event)
            if event.get("payload", {}).get("status") == "ended":
                task = asyncio.create_task(self.close_students(lecture_id))
                self._background_tasks.add(task)
                task.add_done_callback(self._background_tasks.discard)
        else:
            await self.broadcast(lecture_id, event)

    async def close_students(self, lecture_id: UUID | str) -> None:
        async with self._lock:
            targets = [
                item
                for item in self._connections
                if str(item.lecture_id) == str(lecture_id)
                and item.role == "student"
                and not item.closed
            ]
        await asyncio.sleep(0.35)
        for connection in targets:
            with contextlib.suppress(Exception):
                await connection.websocket.close(code=4409, reason="lecture ended")
            connection.closed = True

    async def count(self) -> int:
        async with self._lock:
            return sum(1 for item in self._connections if not item.closed)

    async def close_all(self) -> None:
        async with self._lock:
            targets = list(self._connections)
        for connection in targets:
            connection.closed = True
            with contextlib.suppress(Exception):
                await connection.websocket.close(code=1001, reason="server shutting down")
