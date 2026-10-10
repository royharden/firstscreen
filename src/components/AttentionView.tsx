import type { RunResult } from "@/lib/types";
import { PERSONA_LABELS } from "@/lib/format";
import { AlertTriangle, Eye, MousePointerClick } from "lucide-react";

export function AttentionView({ result }: { result: RunResult }) {
  const a = result.aggregate;
  const blocks = result.firstScreen.blocks;
  const weights = new Map(a.attention.blocks.map((b) => [b.id, b]));

  const maxWeight = Math.max(0.01, ...a.attention.blocks.map((b) => b.weight));

  function heatFor(w: number): string {
    if (w <= 0) return "rgba(59,130,246,0.12)";
    const t = w / maxWeight;
    if (t > 0.75) return "rgba(220,38,38,0.55)";
    if (t > 0.5) return "rgba(249,115,22,0.5)";
    if (t > 0.25) return "rgba(250,204,21,0.45)";
    return "rgba(93,168,209,0.4)";
  }

  return (
    <div className="space-y-6">
      {result.firstScreen.js_only_warning && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          {result.firstScreen.js_only_warning}
        </div>
      )}

      <div className="rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900">
        <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Where attention lands</h2>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Weight per block = mean across personas of P(look first) × 0.6 + P(click first) × 0.4. Warmer = more attention.
        </p>

        {result.screenshotPath ? (
          <div className="mt-4">
            <img
              src={supabaseStorageUrl(result.screenshotPath)}
              alt="Analyzed page first screen"
              className="w-full rounded-xl border border-gray-200 dark:border-gray-700"
            />
            <HeatOverlay blocks={blocks} weights={weights} heatFor={heatFor} />
          </div>
        ) : (
          <div className="relative mt-4 overflow-hidden rounded-xl border border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800" style={{ aspectRatio: "16/10" }}>
            {blocks.map((b) => {
              const w = weights.get(b.id)?.weight ?? 0;
              const idx = blocks.indexOf(b);
              const row = Math.floor(idx / 2);
              return (
                <div
                  key={b.id}
                  className="absolute rounded-lg border-2 p-2 transition-all"
                  style={{
                    left: `${4 + (idx % 2) * 48}%`,
                    top: `${3 + row * 17}%`,
                    width: "46%",
                    minHeight: "14%",
                    borderColor: heatFor(w).replace(/[\d.]+\)$/, "0.9)"),
                    background: heatFor(w),
                  }}
                >
                  <div className="text-[10px] font-bold uppercase tracking-wide text-gray-800 dark:text-gray-100">{b.kind}</div>
                  <div className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-gray-700 dark:text-gray-200">{b.text}</div>
                  <div className="absolute bottom-1 right-1.5 rounded bg-black/40 px-1 text-[10px] font-bold text-white">
                    {(w * 100).toFixed(0)}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {a.attention.ctaNotNoticed && (
          <div className="mt-4 flex items-start gap-2 rounded-xl border border-orange-200 bg-orange-50 p-3 text-sm text-orange-800 dark:border-orange-800 dark:bg-orange-950 dark:text-orange-200">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            CTA not noticed: the top call-to-action draws less attention than the median block on this screen.
          </div>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-gray-100">
            <Eye className="h-4 w-4 text-blue-500" /> Seen first
          </h3>
          <ol className="mt-3 space-y-2">
            {a.attention.topLook.map((t) => (
              <li key={t.persona} className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2 text-sm dark:bg-gray-800">
                <span className="text-gray-700 dark:text-gray-300">{PERSONA_LABELS[t.persona]}</span>
                <span className="font-mono text-xs font-semibold text-gray-900 dark:text-gray-100">{blockLabel(t.id, blocks)}</span>
              </li>
            ))}
          </ol>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-gray-100">
            <MousePointerClick className="h-4 w-4 text-orange-500" /> Clicked first
          </h3>
          <ol className="mt-3 space-y-2">
            {a.attention.topClick.map((t) => (
              <li key={t.persona} className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2 text-sm dark:bg-gray-800">
                <span className="text-gray-700 dark:text-gray-300">{PERSONA_LABELS[t.persona]}</span>
                <span className="font-mono text-xs font-semibold text-gray-900 dark:text-gray-100">{blockLabel(t.id, blocks)}</span>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </div>
  );
}

function blockLabel(id: string, blocks: { id: string; kind: string; text: string }[]): string {
  if (id === "nothing") return "(nothing)";
  if (id === "uncertain") return "(uncertain)";
  const b = blocks.find((x) => x.id === id);
  if (!b) return id;
  return `${b.kind}: ${b.text.slice(0, 40)}`;
}

function supabaseStorageUrl(path: string): string {
  const url = import.meta.env.VITE_SUPABASE_URL as string;
  return `${url}/storage/v1/object/public/firstscreen-screenshots/${path}`;
}

function HeatOverlay({
  blocks,
  weights,
  heatFor,
}: {
  blocks: { id: string }[];
  weights: Map<string, { weight: number }>;
  heatFor: (w: number) => string;
}) {
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {blocks.map((b, i) => (
        <span
          key={b.id}
          className="rounded px-2 py-0.5 text-[10px] font-semibold text-gray-900"
          style={{ background: heatFor(weights.get(b.id)?.weight ?? 0) }}
        >
          {i + 1}
        </span>
      ))}
    </div>
  );
}
