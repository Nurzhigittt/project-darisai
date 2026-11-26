-- Private operational state, never exposed through PostgREST.
CREATE SCHEMA IF NOT EXISTS daris_private;
REVOKE ALL ON SCHEMA daris_private FROM PUBLIC;
CREATE TABLE daris_private.ephemeral_state (
    key text PRIMARY KEY,
    value jsonb NOT NULL,
    expires_at timestamptz NOT NULL,
    CHECK (length(key) <= 512)
);
CREATE INDEX ephemeral_state_expiry ON daris_private.ephemeral_state(expires_at);
ALTER TABLE daris_private.ephemeral_state ENABLE ROW LEVEL SECURITY;

-- Aggregate events only. Local PostgreSQL has no Supabase realtime extension.
-- Invoked in the same transaction as the authoritative state change.
CREATE FUNCTION daris_private.broadcast(topic text, envelope jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
    IF to_regprocedure('realtime.send(jsonb,text,text,boolean)') IS NOT NULL THEN
        EXECUTE 'SELECT realtime.send($1, $2, $3, true)'
        USING envelope, 'daris_event', topic;
    END IF;
END;
$$;
REVOKE ALL ON FUNCTION daris_private.broadcast(text,jsonb) FROM PUBLIC;
