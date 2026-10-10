import { useState } from "react";
import { Copy, Check } from "lucide-react";
import type { RunResult } from "@/lib/types";
import { RUBRIC_LABELS } from "@/lib/format";

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
};

function RewriteList({ title, options }: { title: string; options: string[] }) {
  return (
    <div>
      <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{title}</h4>
      <ul className="mt-2 space-y-2">
        {options.map((o, i) => (
          <li key={i} className="flex items-start justify-between gap-3 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 dark:border-gray-700 dark:bg-gray-800">
            <span className="text-sm text-gray-800 dark:text-gray-200">{o}</span>
            <CopyBtn text={o} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        });
      }}
      className="shrink-0 rounded-md p-1.5 text-gray-400 hover:bg-gray-200 hover:text-gray-700 dark:hover:bg-gray-700 dark:hover:text-gray-200"
      aria-label="Copy"
    >
      {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
}

export function FixesPanel({ result }: { result: RunResult }) {
  const a = result.aggregate;
  const summary = result.summary;
  const fixes = summary?.top_fixes?.length
    ? summary.top_fixes
    : a.priorityFixes.slice(0, 5).map((f) => ({
        rubric: f.rubric,
        fix: GAP_LABELS[f.gap] ?? f.gap,
        why: `Priority ${Math.round(f.priority)}`,
      }));
  const maxPriority = Math.max(1, ...a.priorityFixes.map((f) => f.priority));

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900">
        <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Verdict</h2>
        <p className="mt-2 text-lg text-gray-800 dark:text-gray-200">
          {summary?.verdict ?? "The writer is unavailable — check the panel board for scores."}
        </p>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900">
        <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Top fixes</h2>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Priority = (100 − cell score) × Jev's gap confidence, summed across personas.
        </p>
        <ol className="mt-4 space-y-4">
          {fixes.map((f, i) => {
            const pf = a.priorityFixes.find((x) => (GAP_LABELS[x.gap] ?? x.gap) === f.fix) ?? a.priorityFixes[i];
            return (
              <li key={i} className="rounded-xl border border-gray-100 p-4 dark:border-gray-700">
                <div className="flex items-center justify-between">
                  <span className="rounded-full bg-gray-900 px-2.5 py-0.5 text-xs font-semibold text-white dark:bg-gray-100 dark:text-gray-900">
                    {RUBRIC_LABELS[f.rubric] ?? f.rubric}
                  </span>
                  {pf && (
                    <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                      priority {Math.round(pf.priority)}
                    </span>
                  )}
                </div>
                <p className="mt-2 font-medium text-gray-900 dark:text-gray-100">{f.fix}</p>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{f.why}</p>
                {pf && (
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
                    <div className="h-full rounded-full bg-orange-500" style={{ width: `${(pf.priority / maxPriority) * 100}%` }} />
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      </div>

      {summary?.rewrites && (
        <div className="rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900">
          <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Rewrite options</h2>
          <div className="mt-4 grid gap-6 md:grid-cols-3">
            <RewriteList title="Headlines" options={summary.rewrites.h1_options} />
            <RewriteList title="Subheadings" options={summary.rewrites.sub_options} />
            <RewriteList title="CTA labels" options={summary.rewrites.cta_options} />
          </div>
        </div>
      )}
    </div>
  );
}
