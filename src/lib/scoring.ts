import type {
  Aggregate,
  CellResult,
  FirstScreen,
  JevAnswers,
  Persona,
  Rubric,
} from "./types";
import { PERSONAS, RUBRICS } from "./types";

export function scaleTo100(raw: number): number {
  return Math.max(0, Math.min(100, (raw / 4) * 100));
}

export function gradeFor(overall: number): "A" | "B" | "C" | "D" | "F" {
  if (overall >= 85) return "A";
  if (overall >= 70) return "B";
  if (overall >= 55) return "C";
  if (overall >= 40) return "D";
  return "F";
}

export function aggregateAnswers(
  answers: JevAnswers,
  ctaBlockIds: string[],
): Aggregate {
  const cells: Record<string, CellResult> = {};

  for (const persona of PERSONAS) {
    for (const rubric of RUBRICS) {
      const key = `${persona}__${rubric}`;
      const score = answers[`${key}__score`];
      const gap = answers[`${key}__main_gap`];
      const cont = answers[`${key}__continue`];

      const raw = score && score.type === "score" ? score.score : 2;
      const confidence = score && score.type === "score" ? score.confidence ?? 0.5 : 0;
      const display = scaleTo100(raw);

      cells[`${persona}__${rubric}`] = {
        persona,
        rubric,
        display,
        raw,
        confidence,
        low_confidence: confidence < 0.5,
        gap: gap && gap.type === "choice" ? gap.choice : null,
        gap_confidence: gap && gap.type === "choice" ? gap.confidence ?? 0 : 0,
        gap_probabilities: gap && gap.type === "choice" ? gap.probabilities ?? {} : {},
        score_probabilities: score && score.type === "score" ? score.probabilities ?? {} : {},
        continue_prob: cont && cont.type === "noul" ? cont.noul : null,
      };
    }
  }

  const rubricScores = Object.fromEntries(
    RUBRICS.map((r) => [
      r,
      Math.round(PERSONAS.reduce((s, p) => s + cells[`${p}__${r}`].display, 0) / PERSONAS.length),
    ]),
  ) as Record<Rubric, number>;

  const personaScores = Object.fromEntries(
    PERSONAS.map((p) => [
      p,
      Math.round(RUBRICS.reduce((s, r) => s + cells[`${p}__${r}`].display, 0) / RUBRICS.length),
    ]),
  ) as Record<Persona, number>;

  const overall = Math.round(
    PERSONAS.flatMap((p) => RUBRICS.map((r) => cells[`${p}__${r}`].display)).reduce((a, b) => a + b, 0) / 9,
  );

  const bounceRisk = Object.fromEntries(
    PERSONAS.map((p) => {
      const vals = RUBRICS.map((r) => cells[`${p}__${r}`].continue_prob).filter(
        (v): v is number => v !== null,
      );
      const avgContinue = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0.5;
      return [p, Math.round((1 - avgContinue) * 100)];
    }),
  ) as Record<Persona, number>;

  // Fix priority: (100 - cell) * gap_confidence, deduped by gap (sum priorities)
  const byGap = new Map<string, { rubric: Rubric; persona: Persona; gap: string; priority: number }>();
  for (const persona of PERSONAS) {
    for (const rubric of RUBRICS) {
      const cell = cells[`${persona}__${rubric}`];
      if (!cell.gap || cell.gap === "nothing" || cell.gap === "uncertain") continue;
      const priority = (100 - cell.display) * cell.gap_confidence;
      const existing = byGap.get(cell.gap);
      if (existing) {
        existing.priority += priority;
      } else {
        byGap.set(cell.gap, { rubric, persona, gap: cell.gap, priority });
      }
    }
  }
  const priorityFixes = [...byGap.values()].sort((a, b) => b.priority - a.priority);

  // Attention weights per block: mean over personas of P(look)*0.6 + P(click)*0.4
  const blockIds = new Set<string>();
  for (const persona of PERSONAS) {
    for (const kind of ["look", "click"] as const) {
      const a = answers[`${persona}__attention__${kind}`];
      if (a && a.type === "choice" && a.probabilities) {
        for (const id of Object.keys(a.probabilities)) blockIds.add(id);
      }
    }
  }
  blockIds.delete("uncertain");
  blockIds.delete("nothing");

  const attentionBlocks = [...blockIds].map((id) => {
    const vals = PERSONAS.map((p) => {
      const look = answers[`${p}__attention__look`];
      const click = answers[`${p}__attention__click`];
      const lp = look && look.type === "choice" ? look.probabilities?.[id] ?? 0 : 0;
      const cp = click && click.type === "choice" ? click.probabilities?.[id] ?? 0 : 0;
      return lp * 0.6 + cp * 0.4;
    });
    const weight = vals.reduce((a, b) => a + b, 0) / vals.length;
    const lookMean =
      PERSONAS.reduce((s, p) => {
        const a = answers[`${p}__attention__look`];
        return s + (a && a.type === "choice" ? a.probabilities?.[id] ?? 0 : 0);
      }, 0) / PERSONAS.length;
    const clickMean =
      PERSONAS.reduce((s, p) => {
        const a = answers[`${p}__attention__click`];
        return s + (a && a.type === "choice" ? a.probabilities?.[id] ?? 0 : 0);
      }, 0) / PERSONAS.length;
    return { id, weight, look: lookMean, click: clickMean };
  }).sort((a, b) => b.weight - a.weight);

  const topLook = PERSONAS.map((p) => {
    const a = answers[`${p}__attention__look`];
    return { persona: p, id: a && a.type === "choice" ? a.choice : "uncertain" };
  });
  const topClick = PERSONAS.map((p) => {
    const a = answers[`${p}__attention__click`];
    return { persona: p, id: a && a.type === "choice" ? a.choice : "nothing" };
  });

  // Flag "CTA not noticed" if the top CTA's weight is below the median block weight
  const weights = attentionBlocks.map((b) => b.weight).sort((a, b) => a - b);
  const median = weights.length ? weights[Math.floor(weights.length / 2)] : 0;
  const topCtaWeight = ctaBlockIds
    .map((id) => attentionBlocks.find((b) => b.id === id)?.weight ?? 0)
    .sort((a, b) => b - a)[0] ?? 0;

  return {
    cells,
    rubricScores,
    personaScores,
    overall,
    grade: gradeFor(overall),
    bounceRisk,
    priorityFixes,
    attention: {
      blocks: attentionBlocks,
      topLook,
      topClick,
      ctaNotNoticed: topCtaWeight < median,
    },
  };
}

export interface HeuristicResult {
  cells: Record<string, CellResult>;
  rubricScores: Record<Rubric, number>;
  personaScores: Record<Persona, number>;
  overall: number;
  grade: "A" | "B" | "C" | "D" | "F";
  bounceRisk: Record<Persona, number>;
  priorityFixes: { rubric: Rubric; persona: Persona; gap: string; priority: number }[];
}

// Clearly-labeled "Fallback (not Jev)" heuristic from the block list
export function heuristicScores(fs: FirstScreen): HeuristicResult {
  const h1 = fs.blocks.find((b) => b.kind === "hero_heading");
  const sub = fs.blocks.find((b) => b.kind === "subheading");
  const ctas = fs.blocks.filter((b) => b.kind === "cta");
  const trust = fs.blocks.filter((b) => b.kind === "trust" || b.kind === "badge");
  const form = fs.blocks.find((b) => b.kind === "form");
  const pricing = fs.blocks.find((b) => b.kind === "pricing");

  let clarityRaw = 1.0;
  if (h1) clarityRaw += 1.2;
  if (sub) clarityRaw += 0.6;
  if (h1 && h1.text.length > 12 && h1.text.length < 80) clarityRaw += 0.4;
  if (fs.js_only_warning) clarityRaw -= 0.5;

  let trustRaw = 0.8;
  trustRaw += Math.min(1.2, trust.length * 0.4);
  if (pricing) trustRaw += 0.5;
  if (fs.meta_description) trustRaw += 0.3;

  let ctaRaw = 0.5;
  if (ctas.length === 1) ctaRaw += 1.8;
  else if (ctas.length === 2) ctaRaw += 1.0;
  else if (ctas.length > 2) ctaRaw += 0.3;
  if (form) ctaRaw += 0.5;

  const gaps: Record<Rubric, string> = {
    clarity: h1 ? (sub ? "why_better" : "who_its_for") : "what_it_is",
    trust: trust.length === 0 ? "no_proof" : trust.length < 2 ? "no_pricing" : "nothing",
    cta: ctas.length === 0 ? "no_cta" : ctas.length > 2 ? "too_many_ctas" : "nothing",
  };

  const cells: Record<string, CellResult> = {};
  for (const persona of PERSONAS) {
    for (const rubric of RUBRICS) {
      const raw = rubric === "clarity" ? clarityRaw : rubric === "trust" ? trustRaw : ctaRaw;
      cells[`${persona}__${rubric}`] = {
        persona,
        rubric,
        display: scaleTo100(Math.min(4, raw)),
        raw: Math.min(4, raw),
        confidence: 0,
        low_confidence: true,
        gap: gaps[rubric],
        gap_confidence: 0.5,
        gap_probabilities: {},
        score_probabilities: {},
        continue_prob: null,
      };
    }
  }

  const rubricScores = Object.fromEntries(
    RUBRICS.map((r) => [
      r,
      Math.round(PERSONAS.reduce((s, p) => s + cells[`${p}__${r}`].display, 0) / PERSONAS.length),
    ]),
  ) as Record<Rubric, number>;
  const personaScores = Object.fromEntries(
    PERSONAS.map((p) => [
      p,
      Math.round(RUBRICS.reduce((s, r) => s + cells[`${p}__${r}`].display, 0) / RUBRICS.length),
    ]),
  ) as Record<Persona, number>;
  const overall = Math.round(
    PERSONAS.flatMap((p) => RUBRICS.map((r) => cells[`${p}__${r}`].display)).reduce((a, b) => a + b, 0) / 9,
  );

  return {
    cells,
    rubricScores,
    personaScores,
    overall,
    grade: gradeFor(overall),
    bounceRisk: { investor: 55, user: 60, designer: 50 },
    priorityFixes: Object.values(
      RUBRICS.reduce((acc, r) => {
        if (gaps[r] !== "nothing") {
          acc[gaps[r]] = { rubric: r, persona: "user" as Persona, gap: gaps[r], priority: 100 - rubricScores[r] };
        }
        return acc;
      }, {} as Record<string, { rubric: Rubric; persona: Persona; gap: string; priority: number }>),
    ),
  };
}
