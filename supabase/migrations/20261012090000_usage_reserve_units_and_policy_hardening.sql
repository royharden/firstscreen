/*
# Reserve N usage units atomically, and tighten table/storage privileges

1. New Functions
- `increment_usage_by(fn_name text, units int, cap int default 200) returns int`
  SECURITY DEFINER, search_path = public.
  In a single INSERT ... ON CONFLICT DO UPDATE ... WHERE statement, adds `units`
  to today's row only if calls + units <= cap. Returns the new count, or -1 when
  the reservation would exceed the cap (nothing is incremented in that case).
  Invalid arguments raise an error, which edge functions treat as fail-closed (503).
  Execution revoked from PUBLIC, anon, authenticated; granted only to service_role.

2. usage_counters
- RLS stays enabled with zero policies (re-asserted), and all table privileges
  are revoked from anon and authenticated.

3. analyses / jev_calls
- Every existing policy on both tables is dropped and only the ones the demo
  needs are recreated:
  - analyses: anon/authenticated SELECT (shared reports by slug) and a bounded
    INSERT (the "Create report" button). The INSERT check restricts status,
    writer_mode, grade, slug format, screenshot_path format, created_at near
    now(), url length and the size of every jsonb column.
  - jev_calls: anon/authenticated SELECT only. Rows are written by the jev-panel
    edge function with the service-role client, so the anon INSERT policy is gone.
- UPDATE/DELETE/TRUNCATE privileges are revoked from anon and authenticated on
  both tables, and INSERT on jev_calls.

4. Storage
- Drops any INSERT/UPDATE/DELETE/ALL policy on storage.objects and
  storage.buckets that applies to anon, authenticated or public. Screenshots are
  uploaded by fetch-page with the service-role client; the SELECT-only
  "anon_read_screenshots" policy is kept.

5. Important notes
- No keys, URLs, or JWTs are hardcoded here.
- Earlier migrations are not modified.
*/

-- ---------------------------------------------------------------------------
-- usage_counters: no direct access for anon/authenticated
-- ---------------------------------------------------------------------------
ALTER TABLE usage_counters ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN (SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'usage_counters')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.usage_counters', r.policyname);
  END LOOP;
END $$;

REVOKE ALL ON usage_counters FROM anon, authenticated;

-- ---------------------------------------------------------------------------
-- increment_usage_by: atomic reservation of N units against the daily cap
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION increment_usage_by(fn_name text, units int, cap int DEFAULT 200) RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_count int;
BEGIN
  IF fn_name IS NULL OR length(fn_name) = 0 OR length(fn_name) > 64 THEN
    RAISE EXCEPTION 'increment_usage_by: invalid fn_name';
  END IF;
  IF units IS NULL OR units < 1 OR units > 1000 THEN
    RAISE EXCEPTION 'increment_usage_by: invalid units';
  END IF;
  IF cap IS NULL OR cap < 0 THEN
    RAISE EXCEPTION 'increment_usage_by: invalid cap';
  END IF;

  -- Single statement: insert today's row (only if units fit) or add units to it
  -- (only if the total stays within the cap). No row returned = over the cap.
  INSERT INTO usage_counters AS uc (fn, day, calls)
  SELECT fn_name, CURRENT_DATE, units
  WHERE units <= cap
  ON CONFLICT (fn, day)
  DO UPDATE SET calls = uc.calls + EXCLUDED.calls
  WHERE uc.calls + EXCLUDED.calls <= cap
  RETURNING calls INTO new_count;

  IF new_count IS NULL THEN
    RETURN -1;
  END IF;
  RETURN new_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION increment_usage_by(text, int, int) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION increment_usage_by(text, int, int) FROM anon;
REVOKE EXECUTE ON FUNCTION increment_usage_by(text, int, int) FROM authenticated;
GRANT EXECUTE ON FUNCTION increment_usage_by(text, int, int) TO service_role;

-- Re-assert the lock-down of the original single-unit counter
REVOKE EXECUTE ON FUNCTION increment_usage(text, int) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION increment_usage(text, int) FROM anon;
REVOKE EXECUTE ON FUNCTION increment_usage(text, int) FROM authenticated;
GRANT EXECUTE ON FUNCTION increment_usage(text, int) TO service_role;

-- ---------------------------------------------------------------------------
-- analyses / jev_calls: drop every policy, recreate only what the demo needs
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN (
    SELECT tablename, policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename IN ('analyses', 'jev_calls')
  )
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, r.tablename);
  END LOOP;
END $$;

ALTER TABLE analyses ENABLE ROW LEVEL SECURITY;
ALTER TABLE jev_calls ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read analyses" ON analyses
FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "Public can insert bounded analyses" ON analyses
FOR INSERT TO anon, authenticated
WITH CHECK (
  slug ~ '^[0-9a-f]{10}$'
  AND char_length(url) <= 2048
  AND status IN ('running', 'complete')
  AND writer_mode IN ('live', 'mock')
  AND (grade IS NULL OR grade IN ('A', 'B', 'C', 'D', 'F'))
  AND (screenshot_path IS NULL OR screenshot_path ~ '^screenshots/[0-9a-f-]{36}\.png$')
  AND (jev_cost_usd IS NULL OR (jev_cost_usd >= 0 AND jev_cost_usd <= 100))
  AND created_at BETWEEN now() - interval '5 minutes' AND now() + interval '5 minutes'
  AND (first_screen IS NULL OR octet_length(first_screen::text) <= 65536)
  AND (scores IS NULL OR octet_length(scores::text) <= 65536)
  AND (attention IS NULL OR octet_length(attention::text) <= 32768)
  AND (summary IS NULL OR octet_length(summary::text) <= 65536)
);

CREATE POLICY "Public can read jev_calls" ON jev_calls
FOR SELECT TO anon, authenticated USING (true);

REVOKE UPDATE, DELETE, TRUNCATE ON analyses FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON jev_calls FROM anon, authenticated;

-- ---------------------------------------------------------------------------
-- Storage: no anon/authenticated/public write policies (service role uploads)
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN (
    SELECT tablename, policyname FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename IN ('objects', 'buckets')
      AND cmd IN ('INSERT', 'UPDATE', 'DELETE', 'ALL')
      AND roles && ARRAY['anon', 'authenticated', 'public']::name[]
  )
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON storage.%I', r.policyname, r.tablename);
  END LOOP;
END $$;
