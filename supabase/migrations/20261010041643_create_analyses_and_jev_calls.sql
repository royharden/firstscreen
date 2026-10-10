/*
# FirstScreen schema (single-tenant, no auth demo workspace)

1. New Tables
- `analyses`: one row per landing-page analysis. Stores the URL, viewport, status,
  the parsed first-screen model (jsonb), optional screenshot path, aggregated scores
  and grade, attention heatmap data, the LLM summary, Jev cost, writer mode and slug
  for read-only report sharing.
- `jev_calls`: log of every Jev API request made for an analysis (scope = 'all' or a
  persona on fallback), with request/response payloads, latency and token usage.

2. Security
- Enable RLS on both tables.
- Permissive anon policies for this public demo workspace:
  - `analyses`: anyone can insert (run an analysis) and anyone can select by slug
    (read-only shared reports).
  - `jev_calls`: anyone can insert; selects allowed for demo transparency.
- No auth is used in this app, so policies target `anon, authenticated`.
- No destructive statements; idempotent `IF NOT EXISTS` / `DROP POLICY IF EXISTS`.
*/

CREATE TABLE IF NOT EXISTS analyses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL DEFAULT substr(md5(random()::text), 1, 10),
  url text NOT NULL,
  viewport text NOT NULL DEFAULT 'desktop' CHECK (viewport IN ('desktop', 'mobile')),
  status text NOT NULL DEFAULT 'running',
  first_screen jsonb,
  screenshot_path text,
  scores jsonb,
  grade text,
  attention jsonb,
  summary jsonb,
  jev_cost_usd numeric,
  writer_mode text NOT NULL DEFAULT 'live',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS jev_calls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_id uuid REFERENCES analyses(id) ON DELETE CASCADE,
  scope text NOT NULL DEFAULT 'all',
  request jsonb,
  response jsonb,
  latency_ms int,
  input_tokens int,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_analyses_slug ON analyses (slug);
CREATE INDEX IF NOT EXISTS idx_analyses_created ON analyses (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_jev_calls_analysis ON jev_calls (analysis_id);

ALTER TABLE analyses ENABLE ROW LEVEL SECURITY;
ALTER TABLE jev_calls ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can insert analyses" ON analyses;
CREATE POLICY "Public can insert analyses" ON analyses
FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Public can read analyses" ON analyses;
CREATE POLICY "Public can read analyses" ON analyses
FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Public can update analyses" ON analyses;
CREATE POLICY "Public can update analyses" ON analyses
FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public can insert jev_calls" ON jev_calls;
CREATE POLICY "Public can insert jev_calls" ON jev_calls
FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Public can read jev_calls" ON jev_calls;
CREATE POLICY "Public can read jev_calls" ON jev_calls
FOR SELECT TO anon, authenticated USING (true);
