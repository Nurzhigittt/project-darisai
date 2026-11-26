from __future__ import annotations

import asyncio
import json
from collections.abc import AsyncIterator
from uuid import UUID

from fastapi import APIRouter
from fastapi.responses import StreamingResponse

from app.api.deps import ContextDep, ProfessorDep
from app.errors import AppError
from app.schemas.axiom import IntelligenceGenerateRequest, IntelligenceGenerateResponse

router = APIRouter(tags=["intelligence"])


@router.post(
    "/lectures/{lecture_id}/insights/generate",
    response_model=IntelligenceGenerateResponse,
)
async def generate_intelligence(
    lecture_id: UUID,
    body: IntelligenceGenerateRequest,
    ctx: ContextDep,
    professor: ProfessorDep,
) -> IntelligenceGenerateResponse:
    return await ctx.intelligence.generate(
        lecture_id=lecture_id,
        professor_id=professor.professor_id,
        kind=body.kind,
        max_concepts=body.max_concepts,
    )


@router.post("/lectures/{lecture_id}/insights/generate/stream")
async def stream_intelligence(
    lecture_id: UUID, body: IntelligenceGenerateRequest, ctx: ContextDep, professor: ProfessorDep,
) -> StreamingResponse:
    await ctx.lectures.get_owned(lecture_id, professor.professor_id)

    async def events() -> AsyncIterator[str]:
        # Task is scoped to this response, always awaited/cancelled on disconnect.
        task = asyncio.create_task(ctx.intelligence.generate(
            lecture_id=lecture_id, professor_id=professor.professor_id,
            kind=body.kind, max_concepts=body.max_concepts,
        ))
        try:
            yield 'event: status\ndata: {"status":"generating"}\n\n'
            while not task.done():
                done, _ = await asyncio.wait({task}, timeout=5)
                if not done:
                    yield ': keepalive\n\n'
            result = await task
            # Never expose incomplete/unvalidated model output to students or teachers.
            yield 'event: result\ndata: ' + result.model_dump_json() + '\n\n'
        except AppError as exc:
            yield 'event: error\ndata: ' + json.dumps({"code": exc.code, "message": str(exc)}) + '\n\n'
        except Exception:
            yield 'event: error\ndata: {"code":"GENERATION_FAILED","message":"Generation failed."}\n\n'
        finally:
            if not task.done():
                task.cancel()
            await asyncio.gather(task, return_exceptions=True)
    return StreamingResponse(events(), media_type="text/event-stream", headers={
        "Cache-Control": "no-store", "X-Accel-Buffering": "no",
    })
