import type { Aggregate, CellResult } from "./types";
import { PERSONAS, RUBRICS } from "./types";

export const RUBRIC_LABELS: Record<string, string> = {
  clarity: "Clarity",
  trust: "Trust",
  cta: "Call to Action",
};

export const PERSONA_LABELS: Record<string, string> = {
  investor: "Investor",
  user: "First-time User",
  designer: "Designer",
};

export function heatColor(v: number): string {
  // cool (weak) -> warm (strong), 0-100
  const t = Math.max(0, Math.min(100, v)) / 100;
  const stops = [
    { t: 0, c: [49, 87, 173] },   // cool blue
    { t: 0.35, c: [93, 168, 209] },
    { t: 0.55, c: [250, 204, 21] }, // yellow
    { t: 0.75, c: [249, 115, 22] }, // orange
    { t: 1, c: [220, 38, 38] },   // warm red
  ];
  for (let i = 0; i < stops.length - 1; i++) {
    if (t >= stops[i].t && t <= stops[i + 1].t) {
      const f = (t - stops[i].t) / (stops[i + 1].t - stops[i].t || 1);
      const c = stops[i].c.map((v0, j) => Math.round(v0 + f * (stops[i + 1].c[j] - v0)));
      return `rgb(${c[0]},${c[1]},${c[2]})`;
    }
  }
  return "rgb(220,38,38)";
}

export function textOnHeat(v: number): string {
  return v > 55 ? "text-white" : "text-gray-900";
}

export const GRADE_STYLES: Record<string, string> = {
  A: "text-emerald-600 border-emerald-200 bg-emerald-50",
  B: "text-teal-600 border-teal-200 bg-teal-50",
  C: "text-amber-600 border-amber-200 bg-amber-50",
  D: "text-orange-600 border-orange-200 bg-orange-50",
  F: "text-red-600 border-red-200 bg-red-50",
};

export function markdownExport(result: {
  firstScreen: { title: string };
  aggregate: Aggregate;
  summary: { verdict: string; per_persona: { persona: string; take: string }[]; top_fixes: { rubric: string; fix: string; why: string }[]; rewrites: { h1_options: string[]; sub_options: string[]; cta_options: string[] } } | null;
  url: string;
  viewport: string;
}): string {
  const a = result.aggregate;
  const lines: string[] = [];
  lines.push(`# FirstScreen report — ${result.url}`);
  lines.push("");
  lines.push(`Viewport: ${result.viewport} · Overall: **${a.overall}/100 (${a.grade})**`);
  lines.push("");
  lines.push(`## Verdict`);
  lines.push(result.summary?.verdict ?? "(no summary)");
  lines.push("");
  lines.push(`## Scores`);
  lines.push(`| Persona | ${RUBRICS.map((r) => RUBRIC_LABELS[r]).join(" | ")} |`);
  lines.push(`|---|${RUBRICS.map(() => "---|").join("")}`);
  for (const p of PERSONAS) {
    lines.push(`| ${PERSONA_LABELS[p]} | ${RUBRICS.map((r) => a.cells[`${p}__${r}`]?.display ?? "—").join(" | ")} |`);
  }
  lines.push("");
  lines.push(`## Per-persona takes`);
  for (const pp of result.summary?.per_persona ?? []) {
    lines.push(`- **${PERSONA_LABELS[pp.persona] ?? pp.persona}:** ${pp.take}`);
  }
  lines.push("");
  lines.push(`## Top fixes`);
  for (const f of result.summary?.top_fixes ?? a.priorityFixes.map((pf) => ({ rubric: pf.rubric, fix: pf.gap, why: `priority ${Math.round(pf.priority)}` }))) {
    lines.push(`- **${RUBRIC_LABELS[f.rubric] ?? f.rubric}:** ${f.fix} — ${f.why}`);
  }
  lines.push("");
  if (result.summary?.rewrites) {
    lines.push(`## Rewrite options`);
    lines.push(`### Headlines`);
    for (const h of result.summary.rewrites.h1_options) lines.push(`- ${h}`);
    lines.push(`### Subheadings`);
    for (const s of result.summary.rewrites.sub_options) lines.push(`- ${s}`);
    lines.push(`### CTAs`);
    for (const c of result.summary.rewrites.cta_options) lines.push(`- ${c}`);
  }
  return lines.join("\n");
}

export function cellSummary(c: CellResult): string {
  if (c.low_confidence) return `Low confidence (${(c.confidence * 100).toFixed(0)}%)`;
  return `Confidence ${(c.confidence * 100).toFixed(0)}%`;
}
