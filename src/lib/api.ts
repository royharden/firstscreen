import { createClient } from "@supabase/supabase-js";
import type { Aggregate, FirstScreen, JevAnswers, RunOptions, RunResult, Summary, WireframeRect } from "./types";
import { aggregateAnswers } from "./scoring";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export type WriterMode = "live" | "mock";

async function invoke<T>(name: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T>(name, { body });
  if (error) throw new Error(error.message);
  if (data === null || data === undefined) throw new Error(`${name} returned an empty response`);
  return data;
}

export async function runAnalysis(opts: RunOptions, onStep: (step: number, note?: string) => void): Promise<RunResult> {
  onStep(0, `Fetching ${opts.url} (passive GET only)…`);

  const fetchRes = await invoke<{
    first_screen: FirstScreen;
    wireframe: WireframeRect[];
    screenshot_path: string | null;
    error?: string;
  }>("fetch-page", { url: opts.url, viewport: opts.viewport });

  if ("error" in fetchRes && fetchRes.error) throw new Error(fetchRes.error);
  const firstScreen = fetchRes.first_screen;
  if (!firstScreen?.blocks) throw new Error("Could not parse a first screen from this page.");

  onStep(1, firstScreen.js_only_warning ?? "First-screen model built.");

  let answers: JevAnswers = {};
  let jevMeta: RunResult["jevMeta"] = null;
  let jevError: string | null = null;

  try {
    onStep(2, "Asking the Jev panel (one request, 33 questions)…");
    const jevRes = await invoke<{
      answers: Record<string, unknown>;
      scope: string;
      question_count: number;
      latency_ms: number;
      input_tokens: number;
      cost_usd: number;
      model: string;
      error?: string;
      fallback?: string;
    }>("jev-panel", { first_screen: firstScreen, viewport: opts.viewport });

    if (jevRes.error && !jevRes.answers) {
      jevError = jevRes.error;
    } else {
      answers = (jevRes.answers ?? {}) as JevAnswers;
      jevMeta = {
        scope: jevRes.scope,
        question_count: jevRes.question_count,
        latency_ms: jevRes.latency_ms,
        input_tokens: jevRes.input_tokens,
        cost_usd: jevRes.cost_usd,
        model: jevRes.model,
      };
    }
  } catch (err) {
    jevError = err instanceof Error ? err.message : "Jev panel failed";
  }

  let aggregate: Aggregate;
  if (Object.keys(answers).length >= 33) {
    const ctaIds = firstScreen.blocks.filter((b) => b.kind === "cta").map((b) => b.id);
    aggregate = aggregateAnswers(answers, ctaIds);
  } else {
    onStep(3, jevError ? `Jev unavailable (${jevError}) — using fallback scores.` : undefined);
    const { heuristicScores } = await import("./scoring");
    const h = heuristicScores(firstScreen);
    aggregate = {
      ...h,
      attention: { blocks: [], topLook: [], topClick: [], ctaNotNoticed: false },
    };
  }

  onStep(4, "Writing the summary…");
  let summary: Summary | null = null;
  let flagged = false;
  try {
    const sumRes = await invoke<{
      summary: Summary;
      flagged: boolean;
      error?: string;
    }>("write-summary", {
      first_screen: firstScreen,
      aggregate: {
        scores: { cells: Object.fromEntries(Object.entries(aggregate.cells).map(([k, c]) => [k, c.display])), overall: aggregate.overall, grade: aggregate.grade },
        rubric_scores: aggregate.rubricScores,
        persona_scores: aggregate.personaScores,
        bounce_risk: aggregate.bounceRisk,
        priority_fixes: aggregate.priorityFixes,
      },
      mode: opts.writerMode,
    });
    summary = sumRes.summary ?? null;
    flagged = !!sumRes.flagged;
  } catch {
    summary = null;
  }

  onStep(5, "Done.");

  return { firstScreen, wireframe: fetchRes.wireframe ?? [], screenshotPath: fetchRes.screenshot_path, answers, aggregate, summary, flagged, jevMeta };
}

export async function saveReport(result: RunResult, opts: RunOptions, grade: string): Promise<string | null> {
  const { data, error } = await supabase
    .from("analyses")
    .insert({
      url: opts.url,
      viewport: opts.viewport,
      status: "complete",
      first_screen: result.firstScreen,
      screenshot_path: result.screenshotPath,
      scores: {
        cells: Object.fromEntries(Object.entries(result.aggregate.cells).map(([k, c]) => [k, c.display])),
        rubric_scores: result.aggregate.rubricScores,
        persona_scores: result.aggregate.personaScores,
        overall: result.aggregate.overall,
        grade: result.aggregate.grade,
      },
      grade,
      attention: result.aggregate.attention,
      summary: result.summary,
      jev_cost_usd: result.jevMeta?.cost_usd ?? 0,
      writer_mode: opts.writerMode,
    })
    .select("slug")
    .single();
  if (error) {
    console.error("saveReport failed", error);
    return null;
  }
  return data?.slug ?? null;
}

export async function loadReport(slug: string): Promise<RunResult | null> {
  const { data, error } = await supabase
    .from("analyses")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();
  if (error || !data) return null;

  const scores = (data.scores ?? {}) as Record<string, unknown>;
  const overall = Number(scores.overall ?? 0);
  return {
      firstScreen: data.first_screen as FirstScreen,
      wireframe: [],
      screenshotPath: (data.screenshot_path as string) ?? null,
      answers: {},
      aggregate: {
        cells: (scores.cells ?? {}) as Aggregate["cells"],
        rubricScores: (scores.rubric_scores ?? { clarity: 0, trust: 0, cta: 0 }) as Aggregate["rubricScores"],
        personaScores: (scores.persona_scores ?? { investor: 0, user: 0, designer: 0 }) as Aggregate["personaScores"],
        overall,
        grade: (data.grade as "A" | "B" | "C" | "D" | "F") ?? "F",
        bounceRisk: (scores.bounce_risk ?? { investor: 0, user: 0, designer: 0 }) as Aggregate["bounceRisk"],
        priorityFixes: [],
        attention: (data.attention ?? { blocks: [], topLook: [], topClick: [], ctaNotNoticed: false }) as Aggregate["attention"],
    },
    summary: (data.summary as Summary) ?? null,
    flagged: false,
    jevMeta: null,
  };
}
