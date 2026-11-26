from __future__ import annotations

from dataclasses import dataclass
from typing import cast

from app.axiom.abuse import ReplayAbuseGuard
from app.axiom.cost import GenerationBudget
from app.axiom.embeddings import build_embedding_provider
from app.axiom.engine import AxiomEngine
from app.axiom.intelligence import IntelligenceService
from app.axiom.interfaces import EmbeddingProvider
from app.axiom.llm import build_llm_client
from app.axiom.replay import GapCardService, ReplayService
from app.axiom.retrieval import TemporalRetriever
from app.axiom.state import AxiomTokenCodec
from app.axiom.transcript import TranscriptService
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
from app.services.autonomy import ConceptAutonomyService
from app.services.cohort import CohortMemoryService
from app.services.concepts import ConceptCatalogService
from app.services.demo import DemoService
from app.services.insights import InsightService
from app.services.lectures import CourseService, LectureService
from app.services.rate_limit import RateLimiter
from app.services.tokens import StudentTokenService
from app.stt.whisper_client import build_stt_provider


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
    insights: InsightService
    rate_limiter: RateLimiter
    signals: SignalProcessor
    analytics: AnalyticsService
    autonomy: ConceptAutonomyService
    cohort_memory: CohortMemoryService
    connections: ConnectionManager
    event_bus: LectureEventBus
    ripple: RippleRuntime
    embeddings: EmbeddingProvider
    budget: GenerationBudget
    replay_guard: ReplayAbuseGuard
    retrieval: TemporalRetriever
    axiom_state: AxiomTokenCodec
    axiom: AxiomEngine
    transcripts: TranscriptService
    concept_catalog: ConceptCatalogService
    replay: ReplayService
    gapcards: GapCardService
    intelligence: IntelligenceService
    demo: DemoService

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
        student_tokens = StudentTokenService(redis_client, codec, settings)
        insights = InsightService(db, settings)
        embeddings = cast(EmbeddingProvider, build_embedding_provider(settings))
        retrieval = TemporalRetriever(db, settings, embeddings)
        axiom = AxiomEngine(settings, build_llm_client(settings))
        axiom_state = AxiomTokenCodec(settings)
        concept_catalog = ConceptCatalogService(db)
        courses = CourseService(db)
        transcripts = TranscriptService(
            db, settings, embeddings, build_stt_provider(settings), concept_catalog
        )
        budget = GenerationBudget(redis_client, settings)
        replay_guard = ReplayAbuseGuard(redis_client, settings)
        replay = ReplayService(
            db=db,
            settings=settings,
            retrieval=retrieval,
            engine=axiom,
            state=axiom_state,
            student_tokens=student_tokens,
            budget=budget,
            guard=replay_guard,
        )
        gapcards = GapCardService(
            db=db,
            settings=settings,
            retrieval=retrieval,
            engine=axiom,
            state=axiom_state,
            student_tokens=student_tokens,
            budget=budget,
            guard=replay_guard,
        )
        return cls(
            settings=settings,
            db=db,
            redis=redis_client,
            codec=codec,
            counters=counters,
            auth=AuthService(db, settings, codec),
            courses=courses,
            lectures=LectureService(db, settings),
            student_tokens=student_tokens,
            insights=insights,
            rate_limiter=RateLimiter(redis_client, settings),
            signals=signals,
            analytics=analytics,
            autonomy=ConceptAutonomyService(db, settings),
            cohort_memory=CohortMemoryService(db, settings),
            connections=manager,
            event_bus=event_bus,
            ripple=ripple,
            embeddings=embeddings,
            budget=budget,
            replay_guard=replay_guard,
            retrieval=retrieval,
            axiom_state=axiom_state,
            axiom=axiom,
            transcripts=transcripts,
            concept_catalog=concept_catalog,
            replay=replay,
            gapcards=gapcards,
            intelligence=IntelligenceService(
                db=db,
                settings=settings,
                analytics=analytics,
                retrieval=retrieval,
                insights=insights,
                budget=budget,
                axiom=axiom,
                concept_catalog=concept_catalog,
            ),
            demo=DemoService(
                db=db,
                settings=settings,
                courses=courses,
                transcripts=transcripts,
                concepts=concept_catalog,
            ),
        )
