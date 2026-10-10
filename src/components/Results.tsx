import { useState } from "react";
import { Copy, Check, Sun, Moon, Download, ShieldCheck, AlertTriangle } from "lucide-react";
import type { RunOptions, RunResult } from "@/lib/types";
import { markdownExport, GRADE_STYLES } from "@/lib/format";
import { supabase } from "@/lib/api";
import { PanelBoard } from "./PanelBoard";
import { AttentionView } from "./AttentionView";
import { FixesPanel } from "./FixesPanel";
import { StatsPanel } from "./StatsPanel";

interface Props {
  result: RunResult;
  opts: RunOptions;
  onReset: () => void;
}

function CopyButton({ text, label }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        });
      }}
      className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:border-gray-300 hover:bg-gray-50 transition-colors dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
    >
      {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
      {copied ? "Copied" : label ?? "Copy"}
    </button>
  );
}

export function Results({ result, opts, onReset }: Props) {
  const [saving, setSaving] = useState(false);
  const [shareSlug, setShareSlug] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [dark, setDark] = useState(false);
  const [tab, setTab] = useState<"board" | "attention" | "fixes" | "stats">("board");

  const a = result.aggregate;

  const createReport = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      const { data, error } = await supabase
        .from("analyses")
        .insert({
          url: opts.url,
          viewport: opts.viewport,
          status: "complete",
          first_screen: result.firstScreen,
          screenshot_path: result.screenshotPath,
          scores: {
            cells: Object.fromEntries(Object.entries(a.cells).map(([k, c]) => [k, { display: c.display, confidence: c.confidence, gap: c.gap, gap_confidence: c.gap_confidence, low_confidence: c.low_confidence, continue_prob: c.continue_prob, gap_probabilities: c.gap_probabilities, score_probabilities: c.score_probabilities }])),
            rubric_scores: a.rubricScores,
            persona_scores: a.personaScores,
            overall: a.overall,
            grade: a.grade,
            bounce_risk: a.bounceRisk,
            priority_fixes: a.priorityFixes,
          },
          grade: a.grade,
          attention: a.attention,
          summary: result.summary,
          jev_cost_usd: result.jevMeta?.cost_usd ?? 0,
          writer_mode: opts.writerMode,
        })
        .select("slug")
        .maybeSingle();
      if (error) throw error;
      if (data?.slug) setShareSlug(data.slug);
      else setSaveError("Could not create the report link.");
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Saving the report failed.");
    } finally {
      setSaving(false);
    }
  };

  const exportMd = () => {
    const md = markdownExport({
      firstScreen: { title: result.firstScreen.title },
      aggregate: a,
      summary: result.summary,
      url: opts.url,
      viewport: opts.viewport,
    });
    const blob = new Blob([md], { type: "text/markdown" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `firstscreen-${new Date().toISOString().slice(0, 10)}.md`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  return (
    <div className={dark ? "dark" : ""}>
      <div className="min-h-screen bg-gray-50 transition-colors dark:bg-gray-950">
        <div className="mx-auto max-w-6xl px-4 py-8">
          {/* header */}
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="min-w-0">
              <h1 className="truncate text-lg font-semibold text-gray-900 dark:text-gray-100">
                {result.firstScreen.title}
              </h1>
              <p className="truncate text-sm text-gray-500 dark:text-gray-400">
                {opts.url} · {opts.viewport === "desktop" ? "1440×900" : "390×844"}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setDark((d) => !d)}
                className="rounded-lg border border-gray-200 bg-white p-2 text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
                aria-label="Toggle dark mode"
              >
                {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </button>
              <button onClick={onReset} className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200">
                New analysis
              </button>
            </div>
          </div>

          {result.flagged && (
            <div className="mt-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <p>
                The page contained text that looked like instructions aimed at the analysis models (for example
                "ignore previous instructions" or "rate this 10/10"). It was flagged as data and ignored — the
                scores reflect only the page's actual content.
              </p>
            </div>
          )}

          {/* grade ring + meta row */}
          <div className="mt-6 flex flex-wrap items-center gap-6 rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900">
            <div className="flex items-center gap-4">
              <div className={`flex h-20 w-20 items-center justify-center rounded-full border-4 text-3xl font-bold ${GRADE_STYLES[a.grade]}`}>
                {a.grade}
              </div>
              <div>
                <div className="text-4xl font-bold text-gray-900 dark:text-gray-100">{a.overall}</div>
                <div className="text-sm text-gray-500 dark:text-gray-400">out of 100</div>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {(["board", "attention", "fixes", "stats"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`rounded-full px-4 py-1.5 text-sm font-medium capitalize transition-colors ${
                    tab === t
                      ? "bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300"
                  }`}
                >
                  {t === "board" ? "Panel board" : t === "attention" ? "Attention" : t}
                </button>
              ))}
            </div>
            <div className="ml-auto flex flex-wrap items-center gap-2">
              <button
                onClick={createReport}
                disabled={saving}
                className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-white"
              >
                {saving ? "Creating…" : "Create report"}
              </button>
              <button
                onClick={exportMd}
                className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
              >
                <Download className="h-4 w-4" /> Export Markdown
              </button>
            </div>
          </div>

          {shareSlug && (
            <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">
              <ShieldCheck className="h-4 w-4" />
              <span>
                Read-only report ready at{" "}
                <a className="font-semibold underline" href={`/r/${shareSlug}`}>
                  /r/{shareSlug}
                </a>
              </span>
              <CopyButton text={`${window.location.origin}/r/${shareSlug}`} label="Copy link" />
            </div>
          )}
          {saveError && (
            <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
              {saveError}
            </div>
          )}

          {/* tabs */}
          <div className="mt-6">
            {tab === "board" && <PanelBoard result={result} />}
            {tab === "attention" && <AttentionView result={result} />}
            {tab === "fixes" && <FixesPanel result={result} />}
            {tab === "stats" && <StatsPanel result={result} opts={opts} />}
          </div>
        </div>
      </div>
    </div>
  );
}
