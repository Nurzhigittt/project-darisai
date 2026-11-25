from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import Field, model_validator

from app.schemas.common import ApiModel

CohortHistoryStatus = Literal["ready", "insufficient_history"]
MIN_COHORT_LECTURES = 5
MIN_LECTURE_PARTICIPANTS = 3


class CohortConceptMetric(ApiModel):
    concept_canonical_id: UUID
    status: CohortHistoryStatus
    observed_lectures: int | None = Field(default=None, ge=MIN_COHORT_LECTURES)
    mean_signal_events_per_lecture: float | None = Field(default=None, ge=0)
    signal_observed_lecture_share: float | None = Field(default=None, ge=0, le=1)
    cluster_observed_lecture_share: float | None = Field(default=None, ge=0, le=1)
    mean_cluster_peak_intensity: float | None = Field(default=None, ge=0, le=1)

    @model_validator(mode="after")
    def enforce_suppression(self) -> CohortConceptMetric:
        metrics = (
            self.mean_signal_events_per_lecture,
            self.signal_observed_lecture_share,
            self.cluster_observed_lecture_share,
            self.mean_cluster_peak_intensity,
        )
        if self.status == "insufficient_history":
            if self.observed_lectures is not None or any(value is not None for value in metrics):
                raise ValueError("Insufficient cohort history must not expose counts or metrics.")
        elif self.observed_lectures is None:
            raise ValueError("Ready cohort metrics require a sufficient lecture count.")
        return self


class CohortMemoryOut(ApiModel):
    minimum_lectures_required: int = Field(default=5, ge=5)
    minimum_participants_per_lecture: int = Field(default=3, ge=3)
    concepts: list[CohortConceptMetric]
    generated_at: datetime
    interpretation_note: str
