-- DärisAI Phase 0/1 schema.
-- PostgreSQL 16+ with pgvector. All timestamps are UTC (timestamptz).
-- There is deliberately no students table and no student identity column.

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS professors (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 160),
    invite_code_hash text NOT NULL UNIQUE CHECK (char_length(invite_code_hash) = 64),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS courses (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    title text NOT NULL CHECK (char_length(title) BETWEEN 2 AND 160),
    professor_id uuid NOT NULL REFERENCES professors(id) ON DELETE RESTRICT,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (professor_id, title)
);

CREATE TABLE IF NOT EXISTS lectures (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id uuid NOT NULL REFERENCES courses(id) ON DELETE RESTRICT,
    professor_id uuid NOT NULL REFERENCES professors(id) ON DELETE RESTRICT,
    title text NOT NULL CHECK (char_length(title) BETWEEN 2 AND 200),
    language text NOT NULL DEFAULT 'en' CHECK (language IN ('ru', 'kk', 'en')),
    status text NOT NULL DEFAULT 'scheduled'
        CHECK (status IN ('scheduled', 'live', 'paused', 'ended')),
    join_code char(6) NOT NULL UNIQUE CHECK (join_code ~ '^[0-9A-HJKMNP-TV-Z]{6}$'),
    started_at timestamptz,
    ended_at timestamptz,
    paused_at timestamptz,
    paused_total_ms bigint NOT NULL DEFAULT 0 CHECK (paused_total_ms >= 0),
    is_demo boolean NOT NULL DEFAULT false,
    demo_run_id uuid,
    accepted_signals bigint NOT NULL DEFAULT 0 CHECK (accepted_signals >= 0),
    unique_participants integer CHECK (unique_participants >= 0),
    peak_active_participants integer CHECK (peak_active_participants >= 0),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CHECK (ended_at IS NULL OR started_at IS NOT NULL),
    CHECK (paused_at IS NULL OR started_at IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS lectures_professor_created_idx
    ON lectures (professor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS lectures_status_idx ON lectures (status);

CREATE TABLE IF NOT EXISTS transcript_segments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    lecture_id uuid NOT NULL REFERENCES lectures(id) ON DELETE CASCADE,
    start_ms bigint NOT NULL CHECK (start_ms >= 0),
    end_ms bigint NOT NULL CHECK (end_ms >= start_ms),
    text text NOT NULL CHECK (char_length(text) > 0),
    embedding vector(384),
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS transcript_segments_lecture_time_idx
    ON transcript_segments (lecture_id, start_ms);
CREATE INDEX IF NOT EXISTS transcript_segments_embedding_hnsw_idx
    ON transcript_segments USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);

CREATE TABLE IF NOT EXISTS concepts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    lecture_id uuid NOT NULL REFERENCES lectures(id) ON DELETE CASCADE,
    canonical_id uuid,
    title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
    start_ms bigint NOT NULL CHECK (start_ms >= 0),
    end_ms bigint NOT NULL CHECK (end_ms >= start_ms),
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS concepts_lecture_time_idx
    ON concepts (lecture_id, start_ms);

CREATE TABLE IF NOT EXISTS signal_buckets (
    lecture_id uuid NOT NULL REFERENCES lectures(id) ON DELETE CASCADE,
    bucket_start_ms bigint NOT NULL CHECK (bucket_start_ms >= 0),
    bucket_ms integer NOT NULL DEFAULT 10000 CHECK (bucket_ms > 0),
    signals integer NOT NULL CHECK (signals >= 0),
    unique_tokens integer NOT NULL CHECK (unique_tokens >= 0),
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (lecture_id, bucket_start_ms),
    CHECK (unique_tokens <= signals)
);

CREATE TABLE IF NOT EXISTS lecture_minutes (
    lecture_id uuid NOT NULL REFERENCES lectures(id) ON DELETE CASCADE,
    minute_start_ms bigint NOT NULL CHECK (minute_start_ms >= 0),
    signals integer NOT NULL CHECK (signals >= 0),
    unique_tokens integer NOT NULL CHECK (unique_tokens >= 0),
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (lecture_id, minute_start_ms),
    CHECK (unique_tokens <= signals)
);

CREATE TABLE IF NOT EXISTS confusion_clusters (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    lecture_id uuid NOT NULL REFERENCES lectures(id) ON DELETE CASCADE,
    start_ms bigint NOT NULL CHECK (start_ms >= 0),
    end_ms bigint CHECK (end_ms IS NULL OR end_ms >= start_ms),
    peak_intensity double precision NOT NULL CHECK (peak_intensity BETWEEN 0 AND 1),
    unique_tokens integer NOT NULL DEFAULT 0 CHECK (unique_tokens >= 0),
    concept_id uuid REFERENCES concepts(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS confusion_clusters_lecture_time_idx
    ON confusion_clusters (lecture_id, start_ms);
CREATE INDEX IF NOT EXISTS confusion_clusters_open_idx
    ON confusion_clusters (lecture_id) WHERE end_ms IS NULL;

CREATE TABLE IF NOT EXISTS insights (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    lecture_id uuid NOT NULL REFERENCES lectures(id) ON DELETE CASCADE,
    kind text NOT NULL CHECK (kind IN ('brief_next', 'handoff')),
    audience text NOT NULL CHECK (audience IN ('professor', 'seminar_leader')),
    status text NOT NULL DEFAULT 'pending_approval'
        CHECK (status IN ('pending_approval', 'approved', 'rejected', 'edited', 'published')),
    payload jsonb NOT NULL DEFAULT '{}'::jsonb,
    validation jsonb NOT NULL DEFAULT '{}'::jsonb,
    source text NOT NULL DEFAULT 'template' CHECK (source IN ('live', 'prebaked', 'template')),
    created_at timestamptz NOT NULL DEFAULT now(),
    decided_at timestamptz
);

CREATE INDEX IF NOT EXISTS insights_lecture_idx ON insights (lecture_id, created_at DESC);

CREATE TABLE IF NOT EXISTS concept_autonomy (
    course_id uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    concept_canonical_id uuid NOT NULL,
    mode text NOT NULL DEFAULT 'locked' CHECK (mode IN ('locked', 'whitelisted')),
    approvals integer NOT NULL DEFAULT 0 CHECK (approvals >= 0),
    rejections integer NOT NULL DEFAULT 0 CHECK (rejections >= 0),
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (course_id, concept_canonical_id)
);

CREATE TABLE IF NOT EXISTS cohort_stats (
    course_id uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    concept_canonical_id uuid NOT NULL,
    term text NOT NULL,
    confused_share double precision NOT NULL CHECK (confused_share BETWEEN 0 AND 1),
    lectures integer NOT NULL CHECK (lectures >= 0),
    synthetic boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (course_id, concept_canonical_id, term)
);

CREATE TABLE IF NOT EXISTS demo_fixtures (
    scenario text NOT NULL,
    key text NOT NULL,
    payload jsonb NOT NULL,
    prompt_version text,
    synthetic boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (scenario, key)
);
