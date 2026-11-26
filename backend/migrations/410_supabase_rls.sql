-- Executes only on Supabase. Plain PostgreSQL local development is unchanged.
DO $migration$
DECLARE t text;
BEGIN
    IF to_regclass('realtime.messages') IS NULL THEN RETURN; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='daris_backend') THEN
        CREATE ROLE daris_backend LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
    END IF;
    GRANT USAGE ON SCHEMA public, daris_private TO daris_backend;
    GRANT SELECT,INSERT,UPDATE,DELETE ON daris_private.ephemeral_state TO daris_backend;
    CREATE POLICY backend_state ON daris_private.ephemeral_state
        FOR ALL TO daris_backend USING (true) WITH CHECK (true);
    GRANT EXECUTE ON FUNCTION daris_private.broadcast(text,jsonb) TO daris_backend;
    FOREACH t IN ARRAY ARRAY[
        'professors','courses','lectures','transcript_segments','concepts',
        'signal_buckets','lecture_minutes','confusion_clusters','insights',
        'concept_autonomy','cohort_stats','demo_fixtures','handoff_links',
        'transcript_ingestion_runs','audio_chunks','canonical_concepts',
        'insight_decisions','demo_sessions','schema_migrations'
    ] LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
        EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon, authenticated',t);
        EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON public.%I TO daris_backend',t);
        EXECUTE format('CREATE POLICY daris_backend_access ON public.%I FOR ALL TO daris_backend USING (true) WITH CHECK (true)',t);
    END LOOP;
    -- A fresh project is required: PostgreSQL ORs permissive policies, so an
    -- existing allow-all realtime policy would defeat lecture isolation.
    IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='realtime' AND tablename='messages') THEN
        RAISE EXCEPTION 'Review/remove existing realtime.messages policies before applying Daris RLS';
    END IF;
    EXECUTE $sql$
        CREATE POLICY daris_receive ON realtime.messages FOR SELECT TO authenticated
        USING (
            (select auth.jwt()->>'daris_channel') = (select realtime.topic())
            AND (select auth.jwt()->>'daris_role') IN ('student','professor')
            AND extension = 'broadcast'
        )
    $sql$;
    EXECUTE $sql$
        CREATE POLICY daris_presence_write ON realtime.messages FOR INSERT TO authenticated
        WITH CHECK (
            (select auth.jwt()->>'daris_channel') = (select realtime.topic())
            AND (select auth.jwt()->>'daris_role') IN ('student','professor')
            AND extension = 'presence'
        )
    $sql$;
    EXECUTE $sql$
        CREATE POLICY daris_presence_read ON realtime.messages FOR SELECT TO authenticated
        USING (
            (select auth.jwt()->>'daris_channel') = (select realtime.topic())
            AND (select auth.jwt()->>'daris_role') IN ('student','professor')
            AND extension = 'presence'
        )
    $sql$;
    -- There is deliberately NO client broadcast INSERT policy. A student or
    -- teacher cannot forge a server lecture_state/ripple_update notification.
END;
$migration$;
