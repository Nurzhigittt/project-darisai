"""Vercel FastAPI entry point.

Vercel's Python runtime discovers ASGI apps under api/; the local server keeps
using app.main:app directly.
"""
from app.main import app

__all__ = ["app"]
