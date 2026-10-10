import { useState } from "react";
import type { RunResult, RunOptions } from "@/lib/types";

// Editable cost-model constants (USD per million input tokens)
const JEV_INPUT_USD_PER_MTOK = 0.042;
const LLM_INPUT_USD_PER_MTOK = 2.5; // estimated typical LLM writer cost
const LLM_QUESTIONS_EQUIVALENT = 33; // questions an LLM-only panel would need
const LLM_TOKENS_PER_QUESTION = 350; // prompt+completion estimate per question

export function StatsPanel({ result, opts }: { result: RunResult; opts: RunOptions }) {
  const [jevRate, setJevRate] = useState(JEV_INPUT_USD_PER_MTOK);
  const [llmRate, setLlmRate] = useState(LLM_INPUT_USD_PER_MTOK);

  const m = result.jevMeta;
  const jevCost = m ? (m.input_tokens / 1_000_000) * jevRate : 0;
  const llmOnlyCost = (LLM_QUESTIONS_EQUIVALENT * LLM_TOKENS_PER_QUESTION / 1_000_000) * llmRate;
  const savings = llmOnlyCost > 0 ? (1 - jevCost / llmOnlyCost) * 100 : 0;

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900">
        <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Analysis stats</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Jev requests" value={m ? (m.scope === "all" ? "1" : "3 (fallback)") : "0 (fallback scores)"} />
          <Stat label="Questions asked" value={m ? String(m.question_count) : "—"} />
          <Stat label="Jev latency" value={m ? `${(m.latency_ms / 1000).toFixed(1)}s` : "—"} />
          <Stat label="Input tokens" value={m ? m.input_tokens.toLocaleString() : "—"} />
        </div>
        {m && (
          <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
            Model {m.model} · panel scope: {m.scope}
          </p>
        )}
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900">
        <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Cost model</h2>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Jev answers all 33 questions in one request; the LLM only writes the summary. Adjust the rates to compare.
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
              Jev rate ($ per 1M input tokens)
            </span>
            <input
              type="number"
              step="0.001"
              value={jevRate}
              onChange={(e) => setJevRate(Number(e.target.value) || 0)}
              className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
              LLM-only rate ($ per 1M input tokens)
            </span>
            <input
              type="number"
              step="0.1"
              value={llmRate}
              onChange={(e) => setLlmRate(Number(e.target.value) || 0)}
              className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
            />
          </label>
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <Stat label="Jev cost (this run)" value={`$${jevCost.toFixed(6)}`} />
          <Stat
            label="LLM-only panel (est.)"
            value={`$${llmOnlyCost.toFixed(4)}`}
            hint={`${LLM_QUESTIONS_EQUIVALENT} questions × ~${LLM_TOKENS_PER_QUESTION} tokens`}
          />
          <Stat label="Savings with Jev" value={`${savings.toFixed(1)}%`} />
        </div>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900">
        <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Run settings</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <Stat label="URL" value={opts.url} small />
          <Stat label="Viewport" value={opts.viewport === "desktop" ? "Desktop 1440×900" : "Mobile 390×844"} />
          <Stat label="Writer mode" value={opts.writerMode === "live" ? "Live LLM" : "Mock writer"} />
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, hint, small }: { label: string; value: string; hint?: string; small?: boolean }) {
  return (
    <div className="rounded-xl bg-gray-50 p-4 dark:bg-gray-800">
      <div className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">{label}</div>
      <div className={`mt-1 font-bold text-gray-900 dark:text-gray-100 ${small ? "truncate text-sm" : "text-2xl"}`} title={value}>
        {value}
      </div>
      {hint && <div className="mt-0.5 text-xs text-gray-400">{hint}</div>}
    </div>
  );
}
