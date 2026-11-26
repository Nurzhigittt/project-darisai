-- P2 completion: canonical concepts, decision history, Handoff controls,
-- autonomy policy metadata and isolated demo sessions. Additive only.

CREATE TABLE IF NOT EXISTS canonical_concepts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    normalized_key text NOT NULL CHECK (char_length(normalized_key) BETWEEN 1 AND 200),
    title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (course_id, normalized_key)
);

CREATE INDEX IF NOT EXISTS canonical_concepts_course_idx
    ON canonical_concepts (course_id, title);

CREATE UNIQUE INDEX IF NOT EXISTS concepts_lecture_canonical_title_idx
    ON concepts (lecture_id, canonical_id, title)
    WHERE canonical_id IS NOT NULL;

ALTER TABLE insights
    ADD COLUMN IF NOT EXISTS concept_canonical_id uuid
        REFERENCES canonical_concepts(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS generation_key text;

CREATE UNIQUE INDEX IF NOT EXISTS insights_generation_key_idx
    ON insights (lecture_id, kind, generation_key)
    WHERE generation_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS insight_decisions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    insight_id uuid NOT NULL REFERENCES insights(id) ON DELETE CASCADE,
    lecture_id uuid NOT NULL REFERENCES lectures(id) ON DELETE CASCADE,
    professor_id uuid REFERENCES professors(id) ON DELETE SET NULL,
    concept_canonical_id uuid REFERENCES canonical_concepts(id) ON DELETE SET NULL,
    action text NOT NULL CHECK (action IN ('approve', 'edit', 'reject', 'publish', 'revoke')),
    from_status text NOT NULL,
    to_status text NOT NULL,
    reason text CHECK (reason IS NULL OR char_length(reason) BETWEEN 1 AND 1000),
    content_hash text,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS insight_decisions_insight_idx
    ON insight_decisions (insight_id, created_at DESC);
CREATE INDEX IF NOT EXISTS insight_decisions_concept_idx
    ON insight_decisions (lecture_id, concept_canonical_id, created_at DESC);

ALTER TABLE handoff_links
    ADD COLUMN IF NOT EXISTS redeemed_at timestamptz,
    ADD COLUMN IF NOT EXISTS redeem_count integer NOT NULL DEFAULT 0
        CHECK (redeem_count >= 0),
    ADD COLUMN IF NOT EXISTS last_redeemed_at timestamptz,
    ADD COLUMN IF NOT EXISTS revoked_reason text
        CHECK (revoked_reason IS NULL OR char_length(revoked_reason) BETWEEN 1 AND 200);

ALTER TABLE concept_autonomy
    ADD COLUMN IF NOT EXISTS observation_started_at timestamptz NOT NULL DEFAULT now(),
    ADD COLUMN IF NOT EXISTS whitelisted_at timestamptz,
    ADD COLUMN IF NOT EXISTS whitelisted_by_professor_id uuid
        REFERENCES professors(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS policy_reason text
        CHECK (policy_reason IS NULL OR char_length(policy_reason) BETWEEN 1 AND 500);

ALTER TABLE cohort_stats
    ADD COLUMN IF NOT EXISTS term_order integer NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS demo_sessions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    lecture_id uuid NOT NULL UNIQUE REFERENCES lectures(id) ON DELETE CASCADE,
    professor_id uuid NOT NULL REFERENCES professors(id) ON DELETE CASCADE,
    scenario text NOT NULL CHECK (char_length(scenario) BETWEEN 1 AND 160),
    synthetic boolean NOT NULL DEFAULT true,
    expires_at timestamptz NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    last_reset_at timestamptz
);

CREATE INDEX IF NOT EXISTS demo_sessions_expiry_idx
    ON demo_sessions (expires_at);
