import { useState } from "react";
import type { RunResult } from "@/lib/types";
import { PERSONAS, RUBRICS } from "@/lib/types";
import { heatColor, textOnHeat, PERSONA_LABELS, RUBRIC_LABELS } from "@/lib/format";

const GAP_LABELS: Record<string, string> = {
  what_it_is: "What the product does",
  who_its_for: "Who it's for",
  why_better: "Why it's better",
  proof: "Proof it works",
  no_proof: "No proof",
  generic_stock: "Generic/stock look",
  unclear_company: "Unclear company",
  no_pricing: "No pricing",
  no_cta: "No call to action",
  too_many_ctas: "Too many CTAs",
  vague_label: "Vague CTA label",
  high_friction: "High-friction CTA",
  below_fold: "CTA below the fold",
  nothing: "Nothing major missing",
  uncertain: "Can't tell",
};

const PROB_KEYS = ["0", "1", "2", "3", "4"];

export function PanelBoard({ result }: { result: RunResult }) {
  const [selected, setSelected] = useState<string | null>(null);
  const a = result.aggregate;
  const cell = selected ? a.cells[selected] : null;

  return (
    <div className="space-y-6">
      {/* 3x3 heatmap */}
      <div className="rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900">
        <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Persona × rubric heatmap</h2>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Jev scores each cell 0–4, scaled to 0–100. Cool = weak, warm = strong. Click a cell for details.
        </p>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[480px] border-separate border-spacing-1.5">
            <thead>
              <tr>
                <th className="w-28" />
                {RUBRICS.map((r) => (
                  <th key={r} className="pb-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    {RUBRIC_LABELS[r]}
                  </th>
                ))}
                <th className="pb-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Persona</th>
              </tr>
            </thead>
            <tbody>
              {PERSONAS.map((p) => (
                <tr key={p}>
                  <td className="pr-2 text-right text-sm font-medium text-gray-700 dark:text-gray-300">{PERSONA_LABELS[p]}</td>
                  {RUBRICS.map((r) => {
                    const c = a.cells[`${p}__${r}`];
                    if (!c) return <td key={r}>—</td>;
                    const key = `${p}__${r}`;
                    return (
                      <td key={r}>
                        <button
                          onClick={() => setSelected(key)}
                          className={`relative flex h-16 w-full items-center justify-center rounded-xl text-xl font-bold transition-transform hover:scale-[1.03] ${textOnHeat(c.display)} ${
                            selected === key ? "ring-2 ring-offset-2 ring-gray-900 dark:ring-gray-100 dark:ring-offset-gray-900" : ""
                          }`}
                          style={{ backgroundColor: heatColor(c.display) }}
                        >
                          {Math.round(c.display)}
                          {c.low_confidence && (
                            <span className="absolute bottom-1 right-1.5 rounded bg-black/25 px-1 py-0.5 text-[9px] font-semibold text-white">
                              low conf
                            </span>
                          )}
                        </button>
                      </td>
                    );
                  })}
                  <td className="pl-2 text-center text-lg font-bold text-gray-800 dark:text-gray-200">{a.personaScores[p]}</td>
                </tr>
              ))}
              <tr>
                <td className="pr-2 pt-1 text-right text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Rubric</td>
                {RUBRICS.map((r) => (
                  <td key={r} className="pt-1 text-center text-lg font-bold text-gray-800 dark:text-gray-200">
                    {a.rubricScores[r]}
                  </td>
                ))}
                <td />
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* selected cell detail */}
      {cell && (
        <div className="rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900">
          <div className="flex items-start justify-between">
            <div>
              <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
                {PERSONA_LABELS[cell.persona]} × {RUBRIC_LABELS[cell.rubric]}
              </h3>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Jev raw score {cell.raw.toFixed(1)} / 4 · confidence {(cell.confidence * 100).toFixed(0)}%
                {cell.low_confidence ? " · low confidence" : ""}
              </p>
            </div>
            <button onClick={() => setSelected(null)} className="text-sm text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
              Close
            </button>
          </div>
          <div className="mt-4 grid gap-6 md:grid-cols-2">
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Jev score probability bars</h4>
              <div className="mt-2 space-y-1.5">
                {PROB_KEYS.map((k) => {
                  const p = cell.score_probabilities[k] ?? 0;
                  return (
                    <div key={k} className="flex items-center gap-2">
                      <span className="w-8 text-xs text-gray-500 dark:text-gray-400">{k}/4</span>
                      <div className="h-4 flex-1 overflow-hidden rounded bg-gray-100 dark:bg-gray-800">
                        <div className="h-full rounded bg-blue-500 transition-all" style={{ width: `${p * 100}%` }} />
                      </div>
                      <span className="w-10 text-right text-xs text-gray-500 dark:text-gray-400">{(p * 100).toFixed(0)}%</span>
                    </div>
                  );
                })}
              </div>
            </div>
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Main gap</h4>
              <p className="mt-2 text-lg font-semibold text-gray-900 dark:text-gray-100">
                {cell.gap ? GAP_LABELS[cell.gap] ?? cell.gap : "—"}
              </p>
              {cell.gap && cell.gap !== "nothing" && cell.gap !== "uncertain" && (
                <div className="mt-3 space-y-1">
                  <h5 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Gap confidence</h5>
                  <div className="space-y-1">
                    {Object.entries(cell.gap_probabilities)
                      .sort((x, y) => y[1] - x[1])
                      .slice(0, 4)
                      .map(([g, p]) => (
                        <div key={g} className="flex items-center gap-2">
                          <span className="w-32 truncate text-xs text-gray-600 dark:text-gray-300">{GAP_LABELS[g] ?? g}</span>
                          <div className="h-3 flex-1 overflow-hidden rounded bg-gray-100 dark:bg-gray-800">
                            <div className="h-full rounded bg-amber-500" style={{ width: `${p * 100}%` }} />
                          </div>
                          <span className="w-9 text-right text-xs text-gray-500 dark:text-gray-400">{(p * 100).toFixed(0)}%</span>
                        </div>
                      ))}
                  </div>
                </div>
              )}
              {cell.continue_prob !== null && (
                <p className="mt-4 text-sm text-gray-600 dark:text-gray-300">
                  Would keep going: <span className="font-semibold">{(cell.continue_prob * 100).toFixed(0)}%</span>
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* per-persona cards */}
      <div className="grid gap-4 md:grid-cols-3">
        {PERSONAS.map((p) => {
          const bounce = a.bounceRisk[p] ?? 0;
          return (
            <div key={p} className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
              <div className="flex items-baseline justify-between">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{PERSONA_LABELS[p]}</h3>
                <span className="text-2xl font-bold text-gray-900 dark:text-gray-100">{a.personaScores[p]}</span>
              </div>
              <div className="mt-3">
                <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
                  <span>Bounce risk</span>
                  <span className="font-semibold text-gray-700 dark:text-gray-200">{bounce}%</span>
                </div>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${bounce}%`, backgroundColor: bounce > 60 ? "#dc2626" : bounce > 40 ? "#f59e0b" : "#10b981" }}
                  />
                </div>
              </div>
              {result.summary?.per_persona
                .filter((pp) => pp.persona === p)
                .map((pp) => (
                  <p key={pp.persona} className="mt-3 text-sm leading-relaxed text-gray-600 dark:text-gray-300">
                    {pp.take}
                  </p>
                ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
