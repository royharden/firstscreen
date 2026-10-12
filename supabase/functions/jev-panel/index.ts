import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.57.4";
// verify_jwt = true — callers must send the anon key

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const JEVC_URL = "https://api.typesafe.ai/v1/systemone";
const MODEL = "jev-1.13.0";
const COST_PER_INPUT_TOKEN_USD = 0.042 / 1_000_000;

const DEFAULT_DAILY_LIMIT = 200;
const USAGE_FN = "jev-panel";
const MAX_JEV_ATTEMPTS = 2;
const MAX_BODY_BYTES = 32 * 1024;
const MAX_FIELD_CHARS = 200;
const MAX_LIST_ITEMS = 12;
const MAX_BLOCKS = 12;
const BLOCK_ID_RE = /^b[0-9]{1,2}$/;
const BLOCK_KIND_RE = /^[a-z_]{1,32}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAILY_LIMIT_MESSAGE = "Demo daily limit reached - Offline demo still works";

const PERSONAS: Record<string, string> = {
  investor: "Investor: skims for market, traction, and why-now in 5 seconds",
  user: "First-time User: wants to know what it is, if it's for them, and what to do next",
  designer: "Designer: judges hierarchy, focus, and visual trust signals",
};

const RUBRIC_CRITERIA: Record<string, { scores: string[]; gaps: Record<string, string> }> = {
  clarity: {
    scores: [
      "Very unclear: I can't tell what it is.",
      "Unclear: vague idea only.",
      "Somewhat clear: I get the category but not the value.",
      "Clear: I know what it is and who it's for.",
      "Very clear: I could explain it to a friend.",
    ],
    gaps: {
      what_it_is: "What the product actually does.",
      who_its_for: "Who it is for.",
      why_better: "Why it beats alternatives.",
      proof: "Evidence it works.",
      nothing: "Nothing important is missing.",
      uncertain: "Can't tell.",
    },
  },
  trust: {
    scores: [
      "No trust at all: feels risky or fake.",
      "Low trust: generic marketing, no proof.",
      "Some trust: hints of a real company.",
      "Trustworthy: real proof and credibility.",
      "Highly trustworthy: obvious, verifiable credibility.",
    ],
    gaps: {
      no_proof: "No evidence it works.",
      generic_stock: "Generic or stock imagery/copy.",
      unclear_company: "Unclear who the company is.",
      no_pricing: "No pricing or plan info.",
      nothing: "Nothing important is missing.",
      uncertain: "Can't tell.",
    },
  },
  cta: {
    scores: [
      "No idea what to do next.",
      "Confusing: competing or hidden actions.",
      "Weak: next step exists but is easy to miss.",
      "Clear: one obvious next step.",
      "Perfect: obvious, low-friction, well-placed.",
    ],
    gaps: {
      no_cta: "No visible call to action.",
      too_many_ctas: "Too many competing CTAs.",
      vague_label: "Vague or unclear CTA label.",
      high_friction: "CTA demands too much (signup, payment) too early.",
      below_fold: "CTA is likely below the fold.",
      nothing: "Nothing important is missing.",
      uncertain: "Can't tell.",
    },
  },
};

const RUBRIC_INSTRUCTIONS: Record<string, string> = {
  clarity: "after 5 seconds on `first_screen`, how clearly do you understand what this product is and who it's for?",
  trust: "after 5 seconds on `first_screen`, how much do you trust this product and company?",
  cta: "after 5 seconds on `first_screen`, how clear and compelling is the next action you should take?",
};

const GAP_INSTRUCTIONS: Record<string, string> = {
  clarity: "what is the single biggest thing missing from `first_screen` for the Clarity rubric?",
  trust: "what is the single biggest thing missing from `first_screen` for the Trust rubric?",
  cta: "what is the single biggest thing missing from `first_screen` for the Call to Action rubric?",
};

function buildQuestions(blockIds: string[]): Record<string, unknown> {
  const questions: Record<string, unknown> = {};
  const lookIds = [...blockIds.slice(0, 12), "uncertain"];
  const clickIds = [...blockIds.slice(0, 12), "nothing"];

  for (const [persona, desc] of Object.entries(PERSONAS)) {
    const stateKey = `personas.${persona}`;
    for (const rubric of ["clarity", "trust", "cta"] as const) {
      questions[`${persona}__${rubric}__score`] = {
        type: "score",
        instructions: `As \`${stateKey}\` (${desc}), ${RUBRIC_INSTRUCTIONS[rubric]}`,
        criteria: RUBRIC_CRITERIA[rubric].scores,
      };
      questions[`${persona}__${rubric}__main_gap`] = {
        type: "choice",
        instructions: `As \`${stateKey}\` (${desc}), ${GAP_INSTRUCTIONS[rubric]}`,
        criteria: RUBRIC_CRITERIA[rubric].gaps,
      };
      questions[`${persona}__${rubric}__continue`] = {
        type: "noul",
        instructions: `As \`${stateKey}\` (${desc}), would you keep scrolling or click instead of leaving?`,
        criteria: { true: "I'd keep going.", false: "I'd leave." },
      };
    }
    questions[`${persona}__attention__look`] = {
      type: "choice",
      instructions: `As \`${stateKey}\`, which block do you look at first on \`first_screen\`? Pick a block id.`,
      criteria: Object.fromEntries(lookIds.map((id) => [id, id === "uncertain" ? "Can't tell." : `Block ${id}.`])),
    };
    questions[`${persona}__attention__click`] = {
      type: "choice",
      instructions: `As \`${stateKey}\`, which block would you click first on \`first_screen\`? Pick a block id, or nothing.`,
      criteria: Object.fromEntries(clickIds.map((id) => [id, id === "nothing" ? "I wouldn't click anything." : `Block ${id}.`])),
    };
  }
  return questions;
}

function questionCount(q: Record<string, unknown>): number {
  return Object.keys(q).length;
}


function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

class InputError extends Error {
  constructor(readonly status: 400 | 413 | 422, message: string) {
    super(message);
  }
}

// Daily cap hit (429) or the usage counter could not confirm a reservation (503).
class UsageLimitError extends Error {
  constructor(readonly status: 429 | 503) {
    super(status === 429 ? "daily_limit" : "usage_unavailable");
  }
}

function usageLimitResponse(status: 429 | 503) {
  return status === 429
    ? json({ error: DAILY_LIMIT_MESSAGE, code: "daily_limit", fallback: "heuristic" }, 429)
    : json({ error: "Usage counter unavailable.", fallback: "heuristic" }, 503);
}

function dailyLimit(): number {
  const raw = (Deno.env.get("DAILY_CALL_LIMIT") ?? "").trim();
  const n = /^\d+$/.test(raw) ? Number(raw) : NaN;
  return Number.isSafeInteger(n) && n > 0 ? n : DEFAULT_DAILY_LIMIT;
}

function adminClient(): SupabaseClient | null {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

// Reserve one unit of today's cap. Fails closed: an RPC error or a missing /
// non-integer result is never treated as OK.
async function reserveUsage(supabase: SupabaseClient): Promise<{ ok: true } | { ok: false; status: 429 | 503 }> {
  try {
    const { data, error } = await supabase.rpc("increment_usage_by", { fn_name: USAGE_FN, units: 1, cap: dailyLimit() });
    if (error) {
      console.error("increment_usage_by failed", error.message);
      return { ok: false, status: 503 };
    }
    if (typeof data !== "number" || !Number.isInteger(data)) return { ok: false, status: 503 };
    if (data === -1) return { ok: false, status: 429 };
    if (data < 1) return { ok: false, status: 503 };
    return { ok: true };
  } catch (err) {
    console.error("increment_usage_by threw", err instanceof Error ? err.message : err);
    return { ok: false, status: 503 };
  }
}

async function readJsonBody(req: Request, maxBytes: number): Promise<unknown> {
  const declared = Number(req.headers.get("content-length") ?? "0");
  if (declared > maxBytes) throw new InputError(413, "Request body too large.");
  if (!req.body) throw new InputError(400, "JSON body required");
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new InputError(413, "Request body too large.");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    bytes.set(c, offset);
    offset += c.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new InputError(400, "Invalid JSON body");
  }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function boundedString(v: unknown, field: string): string {
  if (v === undefined || v === null) return "";
  if (typeof v !== "string") throw new InputError(400, `${field} must be a string`);
  if (v.length > MAX_FIELD_CHARS) throw new InputError(422, `${field} exceeds ${MAX_FIELD_CHARS} characters`);
  return v;
}

function boundedStringList(v: unknown, field: string): string[] {
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v)) throw new InputError(400, `${field} must be an array`);
  if (v.length > MAX_LIST_ITEMS) throw new InputError(422, `${field} exceeds ${MAX_LIST_ITEMS} items`);
  return v.map((item, i) => boundedString(item, `${field}[${i}]`));
}

type SafeFirstScreen = {
  title: string;
  h1: string;
  sub: string;
  ctas: string[];
  trust: string[];
  blocks: { id: string; kind: string; text: string }[];
};

// Rebuild the first-screen model from whitelisted, bounded fields only; the
// raw client object is never forwarded to Jev.
function sanitizeFirstScreen(raw: unknown): SafeFirstScreen {
  if (!isRecord(raw) || !Array.isArray(raw.blocks)) throw new InputError(400, "first_screen with blocks required");
  if (raw.blocks.length > MAX_BLOCKS) throw new InputError(422, `blocks exceeds ${MAX_BLOCKS} items`);
  const blocks = raw.blocks.map((b, i) => {
    if (!isRecord(b)) throw new InputError(400, `blocks[${i}] must be an object`);
    if (typeof b.id !== "string" || !BLOCK_ID_RE.test(b.id)) throw new InputError(422, `blocks[${i}].id is invalid`);
    if (typeof b.kind !== "string" || !BLOCK_KIND_RE.test(b.kind)) throw new InputError(422, `blocks[${i}].kind is invalid`);
    return { id: b.id, kind: b.kind, text: boundedString(b.text, `blocks[${i}].text`) };
  });
  const src = isRecord(raw.state) ? raw.state : raw;
  return {
    title: boundedString(src.title ?? raw.title, "title"),
    h1: boundedString(src.h1, "h1"),
    sub: boundedString(src.sub, "sub"),
    ctas: boundedStringList(src.ctas, "ctas"),
    trust: boundedStringList(src.trust, "trust"),
    blocks,
  };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Every attempt reserves one unit of the daily cap right before the fetch.
// Retries only on 429/529 or a network error, max MAX_JEV_ATTEMPTS in total.
async function callJev(state: unknown, questions: Record<string, unknown>, apiKey: string, supabase: SupabaseClient) {
  const started = Date.now();
  const body = JSON.stringify({ model: MODEL, state, questions });
  let lastErr = "";
  for (let attempt = 0; attempt < MAX_JEV_ATTEMPTS; attempt++) {
    if (attempt > 0) await sleep(800 * Math.pow(2, attempt - 1));
    const reservation = await reserveUsage(supabase);
    if (!reservation.ok) throw new UsageLimitError(reservation.status);

    let status: number;
    let text: string;
    try {
      const res = await fetch(JEVC_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body,
        signal: AbortSignal.timeout(12_000),
      });
      status = res.status;
      text = await res.text();
    } catch (err) {
      lastErr = `network: ${err instanceof Error ? err.message : String(err)}`;
      continue;
    }
    if (status === 429 || status === 529) {
      lastErr = `HTTP ${status}`;
      continue;
    }
    if (status < 200 || status >= 300) throw new Error(`Jev HTTP ${status}: ${text.slice(0, 300)}`);
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error("Jev returned invalid JSON");
    }
    if (data.model) console.log("response.model =", data.model);
    return {
      data,
      latency_ms: Date.now() - started,
      input_tokens: data?.usage?.input_tokens ?? 0,
      output_tokens: data?.usage?.output_tokens ?? 0,
    };
  }
  throw new Error(`Jev unreachable after retries: ${lastErr}`);
}

function personaState(firstScreen: SafeFirstScreen, persona: string) {
  return {
    personas: { ...PERSONAS },
    first_screen: firstScreen,
    viewport: "desktop",
    _debug_persona: persona,
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });
  try {
    if (req.method !== "POST") return json({ error: "POST required" }, 405);

    const body = await readJsonBody(req, MAX_BODY_BYTES);
    if (!isRecord(body)) throw new InputError(400, "first_screen with blocks required");
    const firstScreen = sanitizeFirstScreen(body.first_screen);
    const viewport = body.viewport === "mobile" ? "mobile" : "desktop";
    const analysisId = typeof body.analysis_id === "string" && UUID_RE.test(body.analysis_id) ? body.analysis_id : null;

    const apiKey = Deno.env.get("TYPESAFE_API_KEY");
    if (!apiKey) {
      return json({ error: "TYPESAFE_API_KEY not configured", fallback: "heuristic" });
    }

    // Daily usage cap (service-role only; fail closed). Counted per Jev fetch inside callJev.
    const supabase = adminClient();
    if (!supabase) return json({ error: "Server not configured.", fallback: "heuristic" }, 503);

    const blockIds = firstScreen.blocks.map((b) => b.id);
    const state = {
      personas: PERSONAS,
      first_screen: firstScreen,
      viewport,
    };
    const questions = buildQuestions(blockIds);
    const count = questionCount(questions);

    let result: Awaited<ReturnType<typeof callJev>>;
    let scope = "all";
    try {
      result = await callJev(state, questions, apiKey, supabase);
    } catch (err) {
      if (err instanceof UsageLimitError) return usageLimitResponse(err.status);
      console.log("single-request failed, falling back to per-persona:", err instanceof Error ? err.message : err);
      const settled = await Promise.allSettled(
        Object.keys(PERSONAS).map(async (persona) => {
          const r = await callJev(personaState(firstScreen, persona), buildQuestions(blockIds), apiKey, supabase);
          return { persona, ...r };
        }),
      );
      const rejected = settled.filter((s): s is PromiseRejectedResult => s.status === "rejected").map((s) => s.reason);
      const limitErr = rejected.find((e): e is UsageLimitError => e instanceof UsageLimitError);
      if (limitErr) return usageLimitResponse(limitErr.status);
      if (rejected.length > 0) throw rejected[0];
      const per = settled.map((s) => (s as PromiseFulfilledResult<{ persona: string } & Awaited<ReturnType<typeof callJev>>>).value);

      const merged: Record<string, unknown> = {};
      let latency = 0;
      let tokens = 0;
      for (const p of per) {
        Object.assign(merged, p.data.answers ?? p.data.questions ?? {});
        latency += p.latency_ms;
        tokens += p.input_tokens;
        await supabase.from("jev_calls").insert({
          analysis_id: analysisId,
          scope: p.persona,
          request: { state: personaState(firstScreen, p.persona), questions: buildQuestions(blockIds) },
          response: p.data,
          latency_ms: p.latency_ms,
          input_tokens: p.input_tokens,
        });
      }
      scope = "per_persona_fallback";
      result = {
        data: { answers: merged, usage: { input_tokens: tokens, output_tokens: 0 } },
        latency_ms: latency,
        input_tokens: tokens,
        output_tokens: 0,
      };
    }

    await supabase.from("jev_calls").insert({
      analysis_id: analysisId,
      scope,
      request: { state, questions: { count, ids: Object.keys(questions) } },
      response: result.data,
      latency_ms: result.latency_ms,
      input_tokens: result.input_tokens,
    });

    const cost = result.input_tokens * COST_PER_INPUT_TOKEN_USD;
    return json({
      answers: result.data.answers ?? result.data.questions ?? {},
      raw: result.data,
      scope,
      question_count: count,
      latency_ms: result.latency_ms,
      input_tokens: result.input_tokens,
      output_tokens: result.output_tokens,
      cost_usd: cost,
      model: MODEL,
    });
  } catch (err) {
    if (err instanceof InputError) return json({ error: err.message }, err.status);
    // Upstream error text stays in the server log only.
    console.error("jev-panel failed:", err instanceof Error ? err.message : err);
    return json({ error: "jev-panel failed", fallback: "heuristic" }, 500);
  }
});
