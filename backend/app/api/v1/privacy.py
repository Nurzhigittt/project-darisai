from __future__ import annotations

from fastapi import APIRouter

from app.api.deps import ContextDep
from app.schemas.privacy import PrivacyManifest
from app.services.privacy import PrivacyService

router = APIRouter(tags=["privacy"])


@router.get("/privacy/manifest", response_model=PrivacyManifest)
async def privacy_manifest(ctx: ContextDep) -> PrivacyManifest:
    return await PrivacyService(ctx.db).manifest()
