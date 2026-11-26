"""Vercel FastAPI entry point; local uvicorn app.main:app remains supported."""
from app.main import app

__all__ = ["app"]
