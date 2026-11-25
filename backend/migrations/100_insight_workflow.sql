-- BriefNext/Handoff approval workflow. Capability tokens are stored only as hashes.

ALTER TABLE insights
    ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now(),
    ADD COLUMN decided_by_professor_id uuid REFERENCES professors(id) ON DELETE RESTRICT,
    ADD COLUMN decision_reason text
        CHECK (decision_reason IS NULL OR char_length(decision_reason) BETWEEN 1 AND 1000);

ALTER TABLE insights DROP CONSTRAINT IF EXISTS insights_source_check;
ALTER TABLE insights
    ADD CONSTRAINT insights_source_check
    CHECK (source IN ('live', 'prebaked', 'template', 'manual'));

CREATE TABLE handoff_links (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    insight_id uuid NOT NULL REFERENCES insights(id) ON DELETE CASCADE,
    token_hash text NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
    expires_at timestamptz NOT NULL,
    revoked_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX handoff_links_insight_idx ON handoff_links (insight_id, created_at DESC);
CREATE INDEX handoff_links_expiry_idx ON handoff_links (expires_at) WHERE revoked_at IS NULL;
