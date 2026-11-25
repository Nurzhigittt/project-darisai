from __future__ import annotations

from fastapi import APIRouter, status

from app.api.deps import ContextDep, ProfessorDep
from app.schemas.lectures import CourseCreate, CourseOut

router = APIRouter(tags=["courses"])


@router.get("/courses", response_model=list[CourseOut])
async def list_courses(ctx: ContextDep, professor: ProfessorDep) -> list[CourseOut]:
    return await ctx.courses.list_for_professor(professor.professor_id)


@router.post("/courses", response_model=CourseOut, status_code=status.HTTP_201_CREATED)
async def create_course(body: CourseCreate, ctx: ContextDep, professor: ProfessorDep) -> CourseOut:
    return await ctx.courses.create(professor.professor_id, body.title)
