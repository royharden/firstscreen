import { useState } from "react";
import {
  ArrowRight, Eye, ShieldCheck, Gauge, Monitor, Smartphone, Play, Loader2,
  Moon, Sun, PenLine, BarChart3, Plug,
} from "lucide-react";
import { runAnalysis, type WriterMode } from "@/lib/api";
import type { RunOptions } from "@/lib/types";
import { FIXTURES } from "@/lib/fixtures";
import { aggregateAnswers } from "@/lib/scoring";
import type { AnalysisResult, Aggregate, JevAnswers, RunResult } from "@/lib/types";
import { Results } from "@/components/Results";

type Mode = "live" | "mock" | "offline";

const STEPS = [
  "Fetching the page (passive GET only)",
  "Building the first-screen model",
  "Asking the Jev panel (one request, 33 questions)",
  "Aggregating scores and attention",
  "Writing the summary",
];

export default function App() {
  const [url, setUrl] = useState("");
  const [viewport, setViewport] = useState<"desktop" | "mobile">("desktop");
  const [mode, setMode] = useState<Mode>("live");
  const writerMode: WriterMode = mode === "mock" ? "mock" : "live";
  const [dark, setDark] = useState(false);
  const [step, setStep] = useState(-1);
  const [stepNote, setStepNote] = useState("");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RunResult | null>(null);
  const [usedOpts, setUsedOpts] = useState<RunOptions | null>(null);

  const start = async (opts: RunOptions) => {
    setRunning(true);
    setError(null);
    setStep(0);
    setStepNote("");
    try {
      const r = await runAnalysis(opts, (s, note) => {
        setStep(s);
        if (note) setStepNote(note);
      });
      setUsedOpts(opts);
      setResult(r);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Analysis failed.");
      setStep(-1);
    } finally {
      setRunning(false);
    }
  };

  const runDemo = (fixtureId: string) => {
    const fx = FIXTURES.find((f) => f.id === fixtureId);
    if (!fx) return;
    const opts: RunOptions = { url: fx.url, viewport, writerMode };
    // Offline replay: run the real scoring code on recorded Jev responses
    const answers = fx.answers as JevAnswers;
    const ctaIds = fx.firstScreen.blocks.filter((b) => b.kind === "cta").map((b) => b.id);
    const aggregate: Aggregate = aggregateAnswers(answers, ctaIds);
    const offline: AnalysisResult = {
      firstScreen: fx.firstScreen,
      wireframe: fx.wireframe,
      screenshotPath: null,
      answers,
      jevMeta: {
        scope: "offline_replay",
        question_count: 33,
        latency_ms: 420,
        input_tokens: fx.inputTokens,
        cost_usd: (fx.inputTokens * 0.042) / 1_000_000,
        model: "jev-1.13.0 (recorded)",
      },
      aggregate,
      summary: null,
      flagged: false,
    };
    setUsedOpts(opts);
    setResult(offline as unknown as RunResult);
  };

  const runUrl = () => {
    if (!url.trim()) {
      setError("Paste a URL first.");
      return;
    }
    start({ url: url.trim(), viewport, writerMode });
  };

  if (result && usedOpts) {
    return <Results result={result} opts={usedOpts} onReset={() => { setResult(null); setStep(-1); }} />;
  }

  return (
    <div className={dark ? "dark" : ""}>
      <div className="min-h-screen bg-gray-50 transition-colors dark:bg-gray-950">
        {/* nav */}
        <nav className="mx-auto flex max-w-6xl items-center justify-between px-4 py-5">
          <div className="flex items-center gap-2">
            <Eye className="h-6 w-6 text-blue-600" />
            <span className="text-lg font-bold tracking-tight text-gray-900 dark:text-gray-100">FirstScreen</span>
          </div>
          <div className="flex items-center gap-3">
            <a
              href="#rules"
              className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
            >
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" /> Passive fetch only
            </a>
            <button
              onClick={() => setDark((d) => !d)}
              className="rounded-lg border border-gray-200 bg-white p-2 text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
              aria-label="Toggle dark mode"
            >
              {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
          </div>
        </nav>

        {/* hero */}
        <section className="mx-auto max-w-3xl px-4 pt-10 text-center">
          <div className="mx-auto mb-5 inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700 dark:bg-blue-950 dark:text-blue-300">
            <Eye className="h-3.5 w-3.5" /> 3 personas × 3 rubrics · one Jev request
          </div>
          <h1 className="text-4xl font-bold tracking-tight text-gray-900 sm:text-5xl dark:text-gray-100">
            FirstScreen: a third opinion on your landing page
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-lg leading-relaxed text-gray-600 dark:text-gray-400">
            Paste a URL. An Investor, a First-time User, and a Designer judge only what's visible above the fold — on Clarity, Trust, and Call to Action.
          </p>

          {/* input row */}
          <div className="mx-auto mt-8 max-w-2xl">
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && runUrl()}
                placeholder="https://your-landing-page.com"
                className="flex-1 rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 shadow-sm outline-none transition-colors placeholder:text-gray-400 focus:border-blue-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
              />
              <button
                onClick={runUrl}
                disabled={running}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-gray-900 px-6 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-gray-800 disabled:opacity-50 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-white"
              >
                {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
                Analyze
              </button>
            </div>

            {/* toggles */}
            <div className="mt-4 flex flex-wrap items-center justify-center gap-2 text-sm">
              <div className="flex overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700">
                <button
                  onClick={() => setViewport("desktop")}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 transition-colors ${viewport === "desktop" ? "bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900" : "bg-white text-gray-600 dark:bg-gray-900 dark:text-gray-300"}`}
                >
                  <Monitor className="h-3.5 w-3.5" /> Desktop
                </button>
                <button
                  onClick={() => setViewport("mobile")}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 transition-colors ${viewport === "mobile" ? "bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900" : "bg-white text-gray-600 dark:bg-gray-900 dark:text-gray-300"}`}
                >
                  <Smartphone className="h-3.5 w-3.5" /> Mobile
                </button>
              </div>
              <div className="flex overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700">
                {(
                  [
                    { id: "live", label: "Live", icon: Plug },
                    { id: "mock", label: "Mock writer", icon: PenLine },
                    { id: "offline", label: "Offline replay", icon: BarChart3 },
                  ] as const
                ).map((m) => (
                  <button
                    key={m.id}
                    onClick={() => setMode(m.id)}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 transition-colors ${mode === m.id ? "bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900" : "bg-white text-gray-600 dark:bg-gray-900 dark:text-gray-300"}`}
                  >
                    <m.icon className="h-3.5 w-3.5" /> {m.label}
                  </button>
                ))}
              </div>
            </div>

            {/* demo buttons */}
            <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
              <span className="text-xs font-medium text-gray-400">Load demo:</span>
              {FIXTURES.map((f) => (
                <button
                  key={f.id}
                  onClick={() => runDemo(f.id)}
                  disabled={running}
                  className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:border-gray-300 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
                  title={f.description}
                >
                  <Play className="h-3 w-3" /> {f.label}
                </button>
              ))}
            </div>
            {mode === "offline" && (
              <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
                Offline replay: scoring runs on recorded Jev responses bundled with the app — no network calls.
              </p>
            )}
            {mode === "mock" && (
              <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
                Mock writer: Jev still runs live; the summary is built from the numbers by a template.
              </p>
            )}
          </div>

          {/* error */}
          {error && (
            <div className="mx-auto mt-6 max-w-2xl rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
              {error}
            </div>
          )}

          {/* progress */}
          {running && (
            <div className="mx-auto mt-6 max-w-2xl rounded-2xl border border-gray-200 bg-white p-6 text-left dark:border-gray-800 dark:bg-gray-900">
              <ol className="space-y-3">
                {STEPS.map((s, i) => (
                  <li key={s} className="flex items-center gap-3 text-sm">
                    {i < step ? (
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300">✓</span>
                    ) : i === step ? (
                      <Loader2 className="h-5 w-5 animate-spin text-blue-500" />
                    ) : (
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-gray-100 text-xs text-gray-400 dark:bg-gray-800">{i + 1}</span>
                    )}
                    <span className={i <= step ? "font-medium text-gray-900 dark:text-gray-100" : "text-gray-400"}>{s}</span>
                  </li>
                ))}
              </ol>
              {stepNote && <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">{stepNote}</p>}
            </div>
          )}
        </section>

        {/* pipeline explainer */}
        <section className="mx-auto mt-16 max-w-5xl px-4 pb-16">
          <div className="grid gap-4 md:grid-cols-3">
            {[
              { icon: Gauge, title: "Jev scores", body: "One multi-question request carries all 33 persona × rubric questions. Jev returns calibrated scores, gaps, and attention probabilities per question." },
              { icon: BarChart3, title: "Code aggregates", body: "All the math — scaling, weighting by confidence, bounce risk, fix priorities, attention heatmaps — happens in deterministic code, not in the model." },
              { icon: PenLine, title: "The LLM writes", body: "A separate writer model sees only the parsed first screen and Jev's aggregated numbers, and produces the verdict, per-persona takes, and rewrites." },
            ].map((c) => (
              <div key={c.title} className="rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900">
                <c.icon className="h-6 w-6 text-blue-500" />
                <h3 className="mt-3 font-semibold text-gray-900 dark:text-gray-100">{c.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-gray-600 dark:text-gray-400">{c.body}</p>
              </div>
            ))}
          </div>

          {/* rules */}
          <div id="rules" className="mt-10 rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900">
            <h3 className="flex items-center gap-2 font-semibold text-gray-900 dark:text-gray-100">
              <ShieldCheck className="h-5 w-5 text-emerald-600" /> Rules & scope
            </h3>
            <ul className="mt-3 grid gap-2 text-sm text-gray-600 sm:grid-cols-2 dark:text-gray-400">
              <li>• Passive GET of the page HTML and up to 5 same-origin stylesheets — no forms, logins, or crawling.</li>
              <li>• Private/internal hosts, non-standard ports, and cloud metadata endpoints are blocked.</li>
              <li>• Caps: 10 requests, 2 MB per file, 15 seconds per analysis. One analysis per URL per minute.</li>
              <li>• Page content is treated as untrusted data; instruction-like text is flagged, never obeyed.</li>
              <li>• All API keys stay server-side in Edge Function secrets.</li>
              <li>• No JavaScript is executed on the target page, so the fold is approximate.</li>
            </ul>
          </div>
        </section>

        <footer className="border-t border-gray-200 py-6 text-center text-xs text-gray-400 dark:border-gray-800">
          FirstScreen — Jev scores, code aggregates, the LLM writes.
        </footer>
      </div>
    </div>
  );
}
