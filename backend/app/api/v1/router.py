from __future__ import annotations

from fastapi import APIRouter

from app.api.v1 import auth, autonomy, cohort, courses, insights, join, lectures, privacy, system

api_router = APIRouter()
api_router.include_router(auth.router)
api_router.include_router(autonomy.router)
api_router.include_router(cohort.router)
api_router.include_router(courses.router)
api_router.include_router(join.router)
api_router.include_router(lectures.router)
api_router.include_router(insights.router)
api_router.include_router(privacy.router)
api_router.include_router(system.router)
