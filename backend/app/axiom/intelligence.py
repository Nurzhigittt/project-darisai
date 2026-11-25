from __future__ import annotations

from uuid import UUID

from app.axiom.concepts import concept_title
from app.axiom.cost import GenerationBudget
from app.axiom.models import Citation
from app.axiom.retrieval import TemporalRetriever
from app.axiom.validators import DeterministicCitationValidator
from app.config import Settings
from app.db import Database
from app.errors import AppError
from app.schemas.axiom import IntelligenceGenerateResponse
from app.schemas.insights import (
    InsightConcept,
    InsightContent,
    InsightTask,
)
from app.services.analytics import AnalyticsService
from app.services.insights import InsightService


def _time(ms: int) -> str:
    seconds = max(0, ms // 1000)
    return f"{seconds // 60:02d}:{seconds % 60:02d}"


def _clip(text: str, limit: int) -> str:
    value = " ".join(text.split())
    if len(value) <= limit:
        return value
    cut = value[:limit].rsplit(" ", 1)[0]
    return cut or value[:limit]


class IntelligenceService:
    """Adapter from deterministic Axiom evidence to P2's insight workflow.

    Counts and windows are read from PostgreSQL. Wording is generated from those
    values and a verified transcript quote; no number is delegated to an LLM.
    """

    def __init__(
        self,
        *,
        db: Database,
        settings: Settings,
        analytics: AnalyticsService,
        retrieval: TemporalRetriever,
        insights: InsightService,
        budget: GenerationBudget,
    ) -> None:
        self._db = db
        self._settings = settings
        self._analytics = analytics
        self._retrieval = retrieval
        self._insights = insights
        self._budget = budget
        self._citations = DeterministicCitationValidator()

    async def generate(
        self,
        *,
        lecture_id: UUID,
        professor_id: UUID,
        kind: str,
        max_concepts: int,
    ) -> IntelligenceGenerateResponse:
        lecture = await self._db.fetchrow(
            "SELECT * FROM lectures WHERE id = $1 AND professor_id = $2",
            lecture_id,
            professor_id,
        )
        if lecture is None:
            raise AppError(404, "NOT_FOUND", "Lecture not found.")
        if lecture["status"] != "ended":
            raise AppError(
                409,
                "LECTURE_NOT_ENDED",
                "Teacher intelligence is generated after the lecture ends.",
            )
        clusters = await self._analytics.clusters_for_lecture(lecture_id, include_open=False)
        if not clusters:
            raise AppError(
                409,
                "INSUFFICIENT_EVIDENCE",
                "No persisted confusion cluster is available for this lecture.",
            )
        await self._budget.consume(lecture_id)
        language = str(lecture.get("language") or "en")
        concepts: list[InsightConcept] = []
        first_citations: list[Citation] = []
        for cluster in clusters:
            if len(concepts) >= max_concepts:
                break
            context = await self._retrieval.retrieve(
                lecture_id=lecture_id,
                focus_offset_ms=cluster.start_ms,
                query="",
                top_k=self._settings.axiom_retrieval_top_k,
            )
            if not context.temporal_segments:
                continue
            segment = min(
                context.temporal_segments,
                key=lambda item: (abs(item.start_ms - cluster.start_ms), item.start_ms),
            )
            quote = _clip(segment.text, 180)
            citation = Citation(
                segment_id=segment.segment_id,
                start_ms=segment.start_ms,
                end_ms=segment.end_ms,
                quote=quote,
            )
            canonical, errors = self._citations.validate_and_canonicalize(
                citations=[citation.model_dump()], context=context
            )
            if errors or not canonical:
                continue
            concept = concept_title(segment.text, language)
            if any(item.title == concept for item in concepts):
                continue
            window_end = cluster.end_ms if cluster.end_ms is not None else cluster.start_ms
            detail = {
                "ru": (
                    f"Сигналы участия в окне {_time(cluster.start_ms)}–{_time(window_end)}: "
                    f"{cluster.unique_tokens} уникальных. Это наблюдение, не измерение понимания. "
                    f"Подтверждающий фрагмент: «{quote}»."
                ),
                "kk": (
                    f"{_time(cluster.start_ms)}–{_time(window_end)} аралығындағы қатысу сигналдары: "
                    f"{cluster.unique_tokens} бірегей. Бұл түсінуді өлшеу емес, бақылау. "
                    f"Растайтын үзінді: «{quote}»."
                ),
                "en": (
                    f"Participation signals at {_time(cluster.start_ms)}–{_time(window_end)}: "
                    f"{cluster.unique_tokens} unique. This is an observation, not a measure of "
                    f"comprehension. Supporting excerpt: “{quote}”."
                ),
            }.get(language, f"Supporting excerpt: “{quote}”.")
            concepts.append(
                InsightConcept(
                    title=concept,
                    detail=detail,
                    citations=canonical,
                    window_start_ms=cluster.start_ms,
                    window_end_ms=window_end,
                    unique_signals=cluster.unique_tokens,
                )
            )
            if not first_citations:
                first_citations = canonical
        if not concepts:
            raise AppError(
                409,
                "INSUFFICIENT_EVIDENCE",
                "Clusters exist, but no transcript evidence overlaps them.",
            )
        accepted = int(lecture.get("accepted_signals") or 0)
        unique = lecture.get("unique_participants")
        stats = {
            "accepted_signals": accepted,
            "unique_participants": unique,
            "clusters": len(clusters),
            "concepts_selected": len(concepts),
        }
        headline = {
            "ru": f"Есть {len(concepts)} момент(а), к которым стоит вернуться",
            "kk": f"Қайта оралуға тұрарлық {len(concepts)} сәт бар",
            "en": f"{len(concepts)} moment(s) worth revisiting",
        }.get(language, f"{len(concepts)} moment(s) worth revisiting")
        words = sum(len(item.detail.split()) + len(item.title.split()) for item in concepts)
        read_time = max(20, min(60, words // 3 + 10))
        task = None
        if kind == "handoff":
            task = InsightTask(
                title={
                    "ru": f"Семинар: {concepts[0].title}",
                    "kk": f"Семинар: {concepts[0].title}",
                    "en": f"Seminar: {concepts[0].title}",
                }.get(language, f"Seminar: {concepts[0].title}"),
                instructions={
                    "ru": (
                        "1. Покажите фрагмент и попросите студентов объяснить его своими словами.\n"
                        "2. Сравните два объяснения и найдите, где теряется причинная связь.\n"
                        "3. Попросите привести один контрпример к упрощённой формулировке.\n"
                        "4. Вернитесь к цитате и сформулируйте условие применимости."
                    ),
                    "kk": (
                        "1. Үзіндіні көрсетіп, студенттерден оны өз сөзімен түсіндіруді сұраңыз.\n"
                        "2. Екі түсіндіруді салыстырып, себеп-салдар байланысы қай жерде үзілетінін табыңыз.\n"
                        "3. Жеңілдетілген тұжырымға қарсы мысал келтіруді сұраңыз.\n"
                        "4. Дәйексөзге оралып, қолданылу шартын тұжырымдаңыз."
                    ),
                    "en": (
                        "1. Show the excerpt and ask students to explain it in their own words.\n"
                        "2. Compare two explanations and locate where the causal link breaks.\n"
                        "3. Ask for one counterexample to the simplified formulation.\n"
                        "4. Return to the quote and state its conditions of applicability."
                    ),
                }.get(language, "Discuss the excerpt and ask for a counterexample."),
                duration_minutes=15,
                grounded_in=first_citations,
            )
        content = InsightContent(
            headline=headline,
            read_time_sec=read_time,
            concepts=concepts,
            task=task,
        )
        validation = {
            "schema_ok": True,
            "citations_ok": True,
            "answer_leak": False,
            "grounded_score": 1.0,
            "attempts": 1,
            "fallback_used": True,
            "details": [
                "Deterministic template from persisted clusters and verified transcript quotes.",
                "Statistics come from PostgreSQL; no LLM-generated numbers.",
            ],
            "statistics": stats,
        }
        insight = await self._insights.create_generated(
            lecture_id=lecture_id,
            professor_id=professor_id,
            kind=kind,
            content=content,
            source="template",
            validation=validation,
        )
        return IntelligenceGenerateResponse(
            insight=insight,
            selection=f"persisted_clusters={len(clusters)}; selected={len(concepts)}",
            source="template",
        )
