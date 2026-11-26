-- Repair/idempotent guard for serverless operational state.
-- Migration 400 is kept immutable for installations that already applied it.
-- This migration makes the private table and broadcaster safe to re-check after
-- a partially provisioned environment or a role/permission repair.
CREATE SCHEMA IF NOT EXISTS daris_private;
REVOKE ALL ON SCHEMA daris_private FROM PUBLIC;
CREATE TABLE IF NOT EXISTS daris_private.ephemeral_state (
    key text PRIMARY KEY,
    value jsonb NOT NULL,
    expires_at timestamptz NOT NULL,
    CHECK (length(key) <= 512)
);
CREATE INDEX IF NOT EXISTS ephemeral_state_expiry
    ON daris_private.ephemeral_state(expires_at);
ALTER TABLE daris_private.ephemeral_state ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION daris_private.broadcast(topic text, envelope jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
    IF to_regprocedure('realtime.send(jsonb,text,text,boolean)') IS NOT NULL THEN
        EXECUTE 'SELECT realtime.send($1, $2, $3, true)'
        USING envelope, 'daris_event', topic;
    END IF;
END;
$$;
REVOKE ALL ON FUNCTION daris_private.broadcast(text,jsonb) FROM PUBLIC;

-- 410 creates this role only on a realtime-enabled Supabase project. Local
-- PostgreSQL and a partially provisioned project may not have it yet.
DO $repair$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'daris_backend') THEN
        GRANT USAGE ON SCHEMA daris_private TO daris_backend;
        GRANT SELECT, INSERT, UPDATE, DELETE
            ON daris_private.ephemeral_state TO daris_backend;
        GRANT EXECUTE ON FUNCTION daris_private.broadcast(text,jsonb)
            TO daris_backend;
    END IF;
END;
$repair$;
