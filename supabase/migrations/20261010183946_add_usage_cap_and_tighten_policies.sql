/*
# Daily usage cap: usage_counters table + increment_usage function, and policy tightening

1. New Tables
- `usage_counters(fn text, day date, calls int, primary key(fn, day))`
  Tracks per-function daily call counts for the demo daily cap.
  RLS enabled with NO policies — the table is inaccessible to anon/authenticated
  directly; only the service_role (via the SECURITY DEFINER function) can read/write it.

2. New Functions
- `increment_usage(fn_name text, cap int default 200) returns int`
  SECURITY DEFINER, search_path = public.
  Upserts today's row for the given function name, incrementing calls by 1.
  Returns the new call count, or -1 when over the cap.
  Execution revoked from PUBLIC, anon, authenticated; granted only to service_role.

3. Security changes on existing tables
- `analyses`: DROP the "Public can update analyses" UPDATE policy.
  The demo only needs anon SELECT (read reports by slug) and anon INSERT
  (create a new analysis). All updates are done from edge functions using
  the service-role client, which bypasses RLS.
  No DELETE policy exists on analyses, so none to remove.
- `jev_calls`: already has only SELECT and INSERT policies — no changes needed.

4. Important notes
- The usage_counters table has RLS enabled and zero policies, so anon and
  authenticated roles cannot read or write it. The increment_usage function
  runs as SECURITY DEFINER (owner context) and is the sole access path.
- Only service_role can call increment_usage; anon/authenticated cannot.
- No keys, URLs, or JWTs are hardcoded — the function reads only its arguments.
*/

CREATE TABLE IF NOT EXISTS usage_counters (
  fn text NOT NULL,
  day date NOT NULL,
  calls int NOT NULL DEFAULT 0,
  PRIMARY KEY (fn, day)
);

ALTER TABLE usage_counters ENABLE ROW LEVEL SECURITY;

-- Drop all policies on usage_counters (idempotent: there should be none, but ensure clean state)
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN (SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'usage_counters')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON usage_counters', r.policyname);
  END LOOP;
END $$;

-- Remove anon UPDATE policy from analyses (updates now done via service-role client only)
DROP POLICY IF EXISTS "Public can update analyses" ON analyses;

-- No DELETE policy exists on analyses; nothing to remove there.
-- jev_calls already has only SELECT + INSERT policies; nothing to remove.

-- SECURITY DEFINER function: atomic upsert + increment with cap check
CREATE OR REPLACE FUNCTION increment_usage(fn_name text, cap int DEFAULT 200) RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_count int;
  today date := CURRENT_DATE;
BEGIN
  INSERT INTO usage_counters (fn, day, calls)
  VALUES (fn_name, today, 1)
  ON CONFLICT (fn, day)
  DO UPDATE SET calls = usage_counters.calls + 1
  RETURNING calls INTO new_count;

  IF new_count > cap THEN
    RETURN -1;
  END IF;
  RETURN new_count;
END;
$$;

-- Lock down execution: only service_role can call it
REVOKE EXECUTE ON FUNCTION increment_usage(text, int) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION increment_usage(text, int) FROM anon;
REVOKE EXECUTE ON FUNCTION increment_usage(text, int) FROM authenticated;
GRANT EXECUTE ON FUNCTION increment_usage(text, int) TO service_role;
