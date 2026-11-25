-- P3 transcript ingestion and AI provenance. Additive only.
-- Raw audio is never stored; only the metadata needed for idempotent chunk processing.

ALTER TABLE transcript_segments
    ADD COLUMN IF NOT EXISTS content_hash text,
    ADD COLUMN IF NOT EXISTS language text,
    ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'fixture',
    ADD COLUMN IF NOT EXISTS embedding_model text,
    ADD COLUMN IF NOT EXISTS embedding_updated_at timestamptz;

ALTER TABLE transcript_segments
    DROP CONSTRAINT IF EXISTS transcript_segments_language_check;
ALTER TABLE transcript_segments
    ADD CONSTRAINT transcript_segments_language_check
    CHECK (language IS NULL OR language IN ('ru', 'kk', 'en'));

ALTER TABLE transcript_segments
    DROP CONSTRAINT IF EXISTS transcript_segments_source_check;
ALTER TABLE transcript_segments
    ADD CONSTRAINT transcript_segments_source_check
    CHECK (source IN ('fixture', 'audio', 'manual'));

CREATE UNIQUE INDEX IF NOT EXISTS transcript_segments_lecture_content_idx
    ON transcript_segments (lecture_id, content_hash)
    WHERE content_hash IS NOT NULL;

CREATE TABLE IF NOT EXISTS transcript_ingestion_runs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    lecture_id uuid NOT NULL REFERENCES lectures(id) ON DELETE CASCADE,
    source text NOT NULL CHECK (source IN ('fixture', 'audio', 'manual')),
    status text NOT NULL DEFAULT 'queued'
        CHECK (status IN ('queued', 'processing', 'completed', 'degraded', 'failed')),
    segment_count integer NOT NULL DEFAULT 0 CHECK (segment_count >= 0),
    embedded_count integer NOT NULL DEFAULT 0 CHECK (embedded_count >= 0),
    embedding_model text,
    error_code text,
    started_at timestamptz,
    completed_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS transcript_ingestion_runs_lecture_idx
    ON transcript_ingestion_runs (lecture_id, created_at DESC);

CREATE TABLE IF NOT EXISTS audio_chunks (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    lecture_id uuid NOT NULL REFERENCES lectures(id) ON DELETE CASCADE,
    chunk_index integer NOT NULL CHECK (chunk_index >= 0),
    start_ms bigint NOT NULL CHECK (start_ms >= 0),
    mime_type text NOT NULL CHECK (char_length(mime_type) <= 120),
    chunk_sha256 text NOT NULL CHECK (chunk_sha256 ~ '^[0-9a-f]{64}$'),
    status text NOT NULL DEFAULT 'processing'
        CHECK (status IN ('processing', 'completed', 'failed')),
    run_id uuid REFERENCES transcript_ingestion_runs(id) ON DELETE SET NULL,
    error_code text,
    created_at timestamptz NOT NULL DEFAULT now(),
    completed_at timestamptz,
    UNIQUE (lecture_id, chunk_index)
);

CREATE INDEX IF NOT EXISTS audio_chunks_lecture_idx
    ON audio_chunks (lecture_id, chunk_index);
