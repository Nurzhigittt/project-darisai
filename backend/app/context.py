from __future__ import annotations

from dataclasses import dataclass

from app.config import Settings
from app.db import Database
from app.observability import OperationalCounters
from app.realtime.connection import ConnectionManager
from app.realtime.pubsub import LectureEventBus
from app.realtime.ripple_runtime import RippleRuntime
from app.realtime.signals import SignalProcessor
from app.redis_client import RedisClient
from app.security import TokenCodec
from app.services.analytics import AnalyticsService
from app.services.auth import AuthService
from app.services.lectures import CourseService, LectureService
from app.services.rate_limit import RateLimiter
from app.services.tokens import StudentTokenService


@dataclass
class AppContext:
    settings: Settings
    db: Database
    redis: RedisClient
    codec: TokenCodec
    counters: OperationalCounters
    auth: AuthService
    courses: CourseService
    lectures: LectureService
    student_tokens: StudentTokenService
    rate_limiter: RateLimiter
    signals: SignalProcessor
    analytics: AnalyticsService
    connections: ConnectionManager
    event_bus: LectureEventBus
    ripple: RippleRuntime

    @classmethod
    def build(cls, settings: Settings) -> AppContext:
        db = Database(settings)
        redis_client = RedisClient(settings)
        codec = TokenCodec(settings)
        counters = OperationalCounters()
        manager = ConnectionManager()
        event_bus = LectureEventBus(redis_client, manager)
        analytics = AnalyticsService(db, redis_client, settings)
        signals = SignalProcessor(db, redis_client, settings, counters)
        ripple = RippleRuntime(db, redis_client, settings, signals, analytics, event_bus)
        return cls(
            settings=settings,
            db=db,
            redis=redis_client,
            codec=codec,
            counters=counters,
            auth=AuthService(db, settings, codec),
            courses=CourseService(db),
            lectures=LectureService(db, settings),
            student_tokens=StudentTokenService(redis_client, codec, settings),
            rate_limiter=RateLimiter(redis_client, settings),
            signals=signals,
            analytics=analytics,
            connections=manager,
            event_bus=event_bus,
            ripple=ripple,
        )
