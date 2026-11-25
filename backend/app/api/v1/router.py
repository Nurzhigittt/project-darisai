from __future__ import annotations

from fastapi import APIRouter

from app.api.v1 import auth, courses, join, lectures, privacy, system

api_router = APIRouter()
api_router.include_router(auth.router)
api_router.include_router(courses.router)
api_router.include_router(join.router)
api_router.include_router(lectures.router)
api_router.include_router(privacy.router)
api_router.include_router(system.router)
