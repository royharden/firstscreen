import { createClient } from "npm:@supabase/supabase-js@2.57.4";
// verify_jwt = true — callers must send the anon key

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const JEVC_URL = "https://api.typesafe.ai/v1/systemone";
const MODEL = "jev-1.13.0";
const COST_PER_INPUT_TOKEN_USD = 0.042 / 1_000_000;

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

async function callJev(state: unknown, questions: Record<string, unknown>, apiKey: string) {
  const started = Date.now();
  const body = JSON.stringify({ model: MODEL, state, questions });
  let lastErr = "";
  for (let attempt = 0; attempt < 3; attempt++) {
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
      const text = await res.text();
      if (res.status === 429 || res.status === 529) {
        lastErr = `HTTP ${res.status}`;
        await new Promise((r) => setTimeout(r, 800 * Math.pow(2, attempt)));
        continue;
      }
      if (!res.ok) throw new Error(`Jev HTTP ${res.status}: ${text.slice(0, 300)}`);
      const data = JSON.parse(text);
      if (data.model) console.log("response.model =", data.model);
      return {
        data,
        latency_ms: Date.now() - started,
        input_tokens: data?.usage?.input_tokens ?? 0,
        output_tokens: data?.usage?.output_tokens ?? 0,
      };
    } catch (err) {
      lastErr = err instanceof Error ? err.message : String(err);
      if (attempt < 2) await new Promise((r) => setTimeout(r, 800 * Math.pow(2, attempt)));
    }
  }
  throw new Error(`Jev unreachable after retries: ${lastErr}`);
}

function personaState(firstScreen: Record<string, unknown>, persona: string) {
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
    if (req.method !== "POST") return new Response(JSON.stringify({ error: "POST required" }), { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { first_screen, analysis_id, viewport } = (await req.json()) as {
      first_screen?: Record<string, unknown>;
      analysis_id?: string;
      viewport?: string;
    };
    if (!first_screen || !first_screen.blocks) {
      return new Response(JSON.stringify({ error: "first_screen with blocks required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const apiKey = Deno.env.get("TYPESAFE_API_KEY");
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "TYPESAFE_API_KEY not configured", fallback: "heuristic" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Daily usage cap (service-role only; fail closed on error)
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: capResult, error: capError } = await supabase.rpc("increment_usage", {
      fn_name: "jev-panel",
      cap: 200,
    });
    if (capError) {
      return new Response(JSON.stringify({ error: "Usage counter unavailable." }), { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (capResult === -1) {
      return new Response(JSON.stringify({ error: "Demo daily limit reached - Offline demo still works" }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const blockIds = (first_screen.blocks as { id: string }[]).map((b) => b.id).slice(0, 12);
    const state = {
      personas: PERSONAS,
      first_screen: first_screen.state ?? first_screen,
      viewport: viewport === "mobile" ? "mobile" : "desktop",
    };
    const questions = buildQuestions(blockIds);
    const count = questionCount(questions);

    let result: Awaited<ReturnType<typeof callJev>>;
    let scope = "all";
    try {
      result = await callJev(state, questions, apiKey);
    } catch (err) {
      console.log("single-request failed, falling back to per-persona:", err instanceof Error ? err.message : err);
      const per = await Promise.all(
        Object.keys(PERSONAS).map(async (persona) => {
          const r = await callJev(personaState(first_screen, persona), buildQuestions(blockIds), apiKey);
          return { persona, ...r };
        }),
      );
      const merged: Record<string, unknown> = {};
      let latency = 0;
      let tokens = 0;
      for (const p of per) {
        Object.assign(merged, p.data.answers ?? p.data.questions ?? {});
        latency += p.latency_ms;
        tokens += p.input_tokens;
        await supabase.from("jev_calls").insert({
          analysis_id: analysis_id ?? null,
          scope: p.persona,
          request: { state: personaState(first_screen, persona), questions: buildQuestions(blockIds) },
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
      analysis_id: analysis_id ?? null,
      scope,
      request: { state, questions: { count, ids: Object.keys(questions) } },
      response: result.data,
      latency_ms: result.latency_ms,
      input_tokens: result.input_tokens,
    });

    const cost = result.input_tokens * COST_PER_INPUT_TOKEN_USD;
    return new Response(
      JSON.stringify({
        answers: result.data.answers ?? result.data.questions ?? {},
        raw: result.data,
        scope,
        question_count: count,
        latency_ms: result.latency_ms,
        input_tokens: result.input_tokens,
        output_tokens: result.output_tokens,
        cost_usd: cost,
        model: MODEL,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "jev-panel failed", fallback: "heuristic" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
