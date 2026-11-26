from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, File, Form, UploadFile, status

from app.api.deps import ContextDep, ProfessorDep
from app.errors import AppError
from app.schemas.axiom import (
    AudioChunkOut,
    TranscriptImportOut,
    TranscriptImportRequest,
    TranscriptOut,
)

router = APIRouter(tags=["transcript"])


@router.post(
    "/lectures/{lecture_id}/transcript/import",
    response_model=TranscriptImportOut,
    status_code=status.HTTP_201_CREATED,
)
async def import_transcript(
    lecture_id: UUID,
    body: TranscriptImportRequest,
    ctx: ContextDep,
    professor: ProfessorDep,
) -> TranscriptImportOut:
    lecture = await ctx.transcripts.get_owned_lecture(lecture_id, professor.professor_id)
    return await ctx.transcripts.import_segments(
        lecture_id=lecture_id,
        language=str(lecture["language"]),
        segments=body.segments,
        source="fixture",
    )


@router.get("/lectures/{lecture_id}/transcript", response_model=TranscriptOut)
async def get_transcript(
    lecture_id: UUID,
    ctx: ContextDep,
    professor: ProfessorDep,
) -> TranscriptOut:
    lecture = await ctx.transcripts.get_owned_lecture(lecture_id, professor.professor_id)
    segments, run = await ctx.transcripts.get_transcript(lecture_id)
    return TranscriptOut(
        lecture_id=lecture_id,
        language=lecture["language"],
        segments=segments,
        total_segments=len(segments),
        embedded_segments=sum(1 for segment in segments if segment.has_embedding),
        latest_run=run,
    )


@router.post(
    "/lectures/{lecture_id}/audio-chunks",
    response_model=AudioChunkOut,
    status_code=status.HTTP_201_CREATED,
)
async def upload_audio_chunk(
    lecture_id: UUID,
    ctx: ContextDep,
    professor: ProfessorDep,
    file: Annotated[UploadFile, File()],
    chunk_index: Annotated[int, Form(ge=0)],
    start_ms: Annotated[int, Form(ge=0)],
    mime_type: Annotated[str, Form(min_length=1, max_length=120)],
) -> AudioChunkOut:
    lecture = await ctx.transcripts.get_owned_lecture(lecture_id, professor.professor_id)
    raw = await file.read(ctx.settings.axiom_stt_max_file_bytes + 1)
    if len(raw) > ctx.settings.axiom_stt_max_file_bytes:
        raise AppError(413, "AUDIO_TOO_LARGE", "The audio chunk is too large.")
    return await ctx.transcripts.ingest_audio_chunk(
        lecture_id=lecture_id,
        chunk_index=chunk_index,
        start_ms=start_ms,
        mime_type=mime_type,
        filename=file.filename or "chunk",
        audio=raw,
        language=str(lecture["language"]),
        professor_id=professor.professor_id,
    )
