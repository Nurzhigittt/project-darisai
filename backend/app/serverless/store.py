from __future__ import annotations

from collections.abc import Callable
from typing import Any, cast

from app.config import Settings
from app.db import Database
from app.redis_client import RedisClient

# One short transaction lock for the small free-tier deployment. This also makes
# pipelines and signal admission atomic across independent function instances.
STATE_LOCK = 7_241_400


class Unit:
    def __init__(self, rows: list[dict[str, Any]], now: float) -> None:
        self.now = now
        self.data = {r["key"]: [r["value"], r["expires_at"].timestamp()] for r in rows}
        self.changed: set[str] = set()

    def call(self, name: str, *args: Any, **kwargs: Any) -> Any:
        key = str(args[0])
        entry = self.data.get(key)
        if entry and entry[1] <= self.now:
            self.data.pop(key)
            entry = None
        value = entry[0] if entry else None
        if name == "get":
            return value
        if name == "exists":
            return int(entry is not None)
        if name == "pttl":
            return int((entry[1] - self.now) * 1000) if entry else -2
        if name == "set":
            if kwargs.get("nx") and entry:
                return False
            seconds = kwargs.get("ex", kwargs.get("px", 86_400_000) / 1000)
            self.data[key] = [str(args[1]), self.now + min(float(seconds), 86_400)]
            self.changed.add(key)
            return True
        if name == "delete":
            count = sum(str(k) in self.data for k in args)
            for k in args:
                self.data.pop(str(k), None)
                self.changed.add(str(k))
            return count
        if name == "expire":
            if not entry:
                return False
            entry[1] = self.now + min(float(args[1]), 86_400)
            self.changed.add(key)
            return True
        if name == "renamenx":
            target = str(args[1])
            if not entry or target in self.data:
                return False
            self.data[target] = self.data.pop(key)
            self.changed.update((key, target))
            return True
        if name in {"incr", "incrby"}:
            number = int(value or 0) + (int(args[1]) if name == "incrby" else 1)
            self.data[key] = [str(number), entry[1] if entry else self.now + 86_400]
            self.changed.add(key)
            return number
        if name in {"smembers", "scard", "sadd", "srem"}:
            members = set(value or [])
            if name == "smembers":
                return members
            if name == "scard":
                return len(members)
            before = len(members)
            if name == "sadd":
                members.update(str(v) for v in args[1:])
            else:
                members.difference_update(str(v) for v in args[1:])
            self.data[key] = [sorted(members), entry[1] if entry else self.now + 86_400]
            self.changed.add(key)
            return abs(len(members) - before)
        if name == "hgetall":
            return value or {}
        if name == "hincrby":
            values = dict(value or {})
            values[str(args[1])] = int(values.get(str(args[1]), 0)) + int(args[2])
            self.data[key] = [values, entry[1] if entry else self.now + 86_400]
            self.changed.add(key)
            return values[str(args[1])]
        if name.startswith("z"):
            values = dict(value or {})
            if name == "zcard":
                return len(values)
            if name in {"zcount", "zrangebyscore"}:
                found = [k for k, v in values.items() if float(args[1]) <= v <= float(args[2])]
                return len(found) if name == "zcount" else found
            before = len(values)
            if name == "zadd":
                values.update({str(k): float(v) for k, v in args[1].items()})
            elif name == "zrem":
                for member in args[1:]:
                    values.pop(str(member), None)
            elif name == "zremrangebyscore":
                values = {k: v for k, v in values.items() if not float(args[1]) <= v <= float(args[2])}
            else:
                raise NotImplementedError(name)
            self.data[key] = [values, entry[1] if entry else self.now + 86_400]
            self.changed.add(key)
            return abs(len(values) - before)
        raise NotImplementedError(name)


class Pipeline:
    def __init__(self, store: PostgresState) -> None:
        self.store = store
        self.commands: list[tuple[str, tuple[Any, ...], dict[str, Any]]] = []

    def __getattr__(self, name: str) -> Callable[..., Pipeline]:
        def queue(*args: Any, **kwargs: Any) -> Pipeline:
            self.commands.append((name, args, kwargs))
            return self
        return queue

    async def execute(self) -> list[Any]:
        return cast(list[Any], await self.store.run(
            [str(args[0]) for _, args, _ in self.commands],
            lambda unit: [unit.call(name, *args, **kwargs) for name, args, kwargs in self.commands],
        ))


class PostgresState(RedisClient):
    """Bounded adapter for the exact Redis operations used by the existing app.

    No Lua interpreter, network Redis, process-local authority or raw credentials.
    Expired values are never returned, even before physical cleanup.
    """

    def __init__(self, settings: Settings, db: Database) -> None:
        super().__init__(settings)
        self.db = db

    @property
    def client(self) -> Any:
        return self

    async def connect(self) -> None:
        await self.db.fetchval("SELECT 1 FROM daris_private.ephemeral_state LIMIT 1")

    async def disconnect(self) -> None:
        pass

    async def health(self) -> tuple[bool, float | None]:
        return await self.db.health()

    def pipeline(self, **_: Any) -> Pipeline:
        return Pipeline(self)

    async def run(self, keys: list[str], action: Callable[[Unit], Any]) -> Any:
        async with self.db.transaction():
            await self.db.fetchval("SELECT pg_advisory_xact_lock($1)", STATE_LOCK)
            await self.db.execute("DELETE FROM daris_private.ephemeral_state WHERE expires_at <= now()")
            rows = await self.db.fetch(
                "SELECT key,value,expires_at FROM daris_private.ephemeral_state WHERE key=ANY($1::text[])", keys
            )
            now = float(await self.db.fetchval("SELECT extract(epoch FROM clock_timestamp())::float8"))
            unit = Unit(rows, now)
            result = action(unit)
            for key in sorted(unit.changed):
                if key not in unit.data:
                    await self.db.execute("DELETE FROM daris_private.ephemeral_state WHERE key=$1", key)
                else:
                    value, expiry = unit.data[key]
                    await self.db.execute(
                        "INSERT INTO daris_private.ephemeral_state VALUES($1,$2,to_timestamp($3)) "
                        "ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,expires_at=EXCLUDED.expires_at",
                        key, value, expiry,
                    )
            return result

    def __getattr__(self, name: str) -> Any:
        async def execute(*args: Any, **kwargs: Any) -> Any:
            keys = [str(args[0])]
            if name == "delete":
                keys = [str(v) for v in args]
            elif name == "renamenx":
                keys.append(str(args[1]))
            return await self.run(keys, lambda unit: unit.call(name, *args, **kwargs))
        return execute

    def register_script(self, script: str) -> Any:
        from app.realtime.signals import SIGNAL_SCRIPT
        from app.services.rate_limit import _FIXED_WINDOW_SCRIPT

        if script not in (SIGNAL_SCRIPT, _FIXED_WINDOW_SCRIPT):
            raise NotImplementedError("Unreviewed state script")

        async def execute(*, keys: list[str], args: list[Any]) -> Any:
            def action(unit: Unit) -> Any:
                call = unit.call
                if script == _FIXED_WINDOW_SCRIPT:
                    current = call("incr", keys[0])
                    if current == 1:
                        call("expire", keys[0], args[0])
                    return current
                if call("exists", keys[0]):
                    return [-2, 0]
                cooldown = call("pttl", keys[1])
                if cooldown > 0:
                    return [-1, cooldown]
                digest, now, seq, cooldown_ms, bucket, minute, idem_ttl, bucket_ttl, all_ttl = args
                call("set", keys[0], seq, ex=idem_ttl)
                call("set", keys[1], "1", px=cooldown_ms)
                call("zadd", keys[2], {digest: now})
                call("expire", keys[2], 900)
                for count_index, unique_index, registry_index, offset in ((3, 4, 7, bucket), (5, 6, 8, minute)):
                    call("hincrby", keys[count_index], "signals", 1)
                    call("sadd", keys[unique_index], digest)
                    call("expire", keys[count_index], bucket_ttl)
                    call("expire", keys[unique_index], bucket_ttl)
                    call("sadd", keys[registry_index], offset)
                call("sadd", keys[9], digest)
                call("expire", keys[9], all_ttl)
                call("incr", keys[10])
                call("expire", keys[10], all_ttl)
                return [1, 0]
            return await self.run(keys, action)
        return execute
