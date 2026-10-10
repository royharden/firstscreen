import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { Loader2, ArrowLeft } from "lucide-react";
import { loadReport } from "@/lib/api";
import type { RunOptions } from "@/lib/types";
import { Results } from "@/components/Results";

export function ReportPage() {
  const { slug } = useParams<{ slug: string }>();
  const [state, setState] = useState<
    | { status: "loading" }
    | { status: "notfound" }
    | { status: "ready"; result: NonNullable<Awaited<ReturnType<typeof loadReport>>> }
  >({ status: "loading" });

  useEffect(() => {
    if (!slug) return;
    loadReport(slug).then((r) => {
      setState(r ? { status: "ready", result: r } : { status: "notfound" });
    });
  }, [slug]);

  if (state.status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 dark:bg-gray-950">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    );
  }

  if (state.status === "notfound") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-gray-50 dark:bg-gray-950">
        <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Report not found</h1>
        <Link to="/" className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:underline">
          <ArrowLeft className="h-4 w-4" /> Back to FirstScreen
        </Link>
      </div>
    );
  }

  const opts: RunOptions = {
    url: (state.result.firstScreen as unknown as { url?: string }).url ?? "saved report",
    viewport: "desktop",
    writerMode: "live",
  };

  return (
    <div>
      <div className="border-b border-gray-200 bg-amber-50 py-2 text-center text-xs font-medium text-amber-800 dark:border-gray-800 dark:bg-amber-950 dark:text-amber-200">
        Read-only shared report — created with FirstScreen
      </div>
      <Results result={state.result} opts={opts} onReset={() => window.location.assign("/")} />
    </div>
  );
}
