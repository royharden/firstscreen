import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const MAX_REQUESTS = 10;
const MAX_FILE_BYTES = 2 * 1024 * 1024;
const MAX_REDIRECTS = 5;
const TIMEOUT_MS = 15_000;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function isPrivateIp(host: string): boolean {
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".internal") ||
    host.endsWith(".local") ||
    host.endsWith(".localdomain")
  ) {
    return true;
  }
  // IPv4 literal
  const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (m) {
    const [a, b] = [Number(m[1]), Number(m[2])];
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true; // link-local incl. 169.254.169.254
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    if (a >= 224) return true; // multicast / reserved
    return false;
  }
  // IPv6 literal
  const h = host.replace(/^\[|\]$/g, "").toLowerCase();
  if (h.includes(":")) {
    if (h === "::1" || h === "::" || h.startsWith("fe80:") || h.startsWith("fc") || h.startsWith("fd")) return true;
    const v4 = h.match(/(\d+\.\d+\.\d+\.\d+)$/);
    if (v4) return isPrivateIp(v4[1]);
  }
  return false;
}

function normalizeUrl(raw: string): URL | null {
  try {
    const u = new URL(raw.trim());
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    const port = u.port ? Number(u.port) : u.protocol === "https:" ? 443 : 80;
    if (![80, 443].includes(port)) return null;
    if (isPrivateIp(u.hostname)) return null;
    return u;
  } catch {
    return null;
  }
}

async function fetchWithGuard(
  url: URL,
  deadline: number,
  budget: { requests: number },
  redirects: number,
): Promise<Response | null> {
  if (budget.requests >= MAX_REQUESTS || redirects > MAX_REDIRECTS) return null;
  if (Date.now() > deadline) return null;
  const checked = normalizeUrl(url.toString());
  if (!checked) throw new Error("blocked-url");
  budget.requests += 1;

  const res = await fetch(checked.toString(), {
    redirect: "manual",
    signal: AbortSignal.timeout(Math.min(10_000, Math.max(0, deadline - Date.now()))),
    headers: {
      "User-Agent": "FirstScreenBot/1.0 (+https://firstscreen.app; passive fetch, no JS execution)",
      Accept: "text/html,application/xhtml+xml,text/css,*/*;q=0.8",
    },
  });

  if (res.status >= 300 && res.status < 400) {
    const loc = res.headers.get("location");
    if (!loc) return null;
    const next = new URL(loc, checked);
    return fetchWithGuard(next, deadline, budget, redirects + 1);
  }
  return res;
}

function stripTags(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function truncate(s: string, n = 200): string {
  if (s.length <= n) return s;
  return s.slice(0, n - 1) + "…";
}

type Block = {
  id: string;
  kind: string;
  text: string;
  approx_position: "top" | "upper" | "middle";
  prominence_hint: number;
  tag?: string;
};

interface RawBlock {
  tag: string;
  classAttr: string;
  text: string;
  attrs: Record<string, string>;
  order: number;
}

function extractBlocks(html: string): RawBlock[] {
  const blocks: RawBlock[] = [];
  const re = /<(h1|h2|h3|nav|button|a|img|form|section|header|footer|p|ul|blockquote)\b([^>]*)>([\s\S]*?)<\/\1>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) && blocks.length < 120) {
    const tag = m[1].toLowerCase();
    const attrsStr = m[2] || "";
    let inner = m[3] || "";
    if (tag === "nav" || tag === "header" || tag === "footer" || tag === "section") {
      // keep nested anchors/buttons out of text
      inner = stripTags(inner);
    } else if (tag === "ul") {
      inner = stripTags(inner);
    } else {
      inner = stripTags(inner);
    }
    const classAttr = (attrsStr.match(/class\s*=\s*["']([^"']*)["']/i)?.[1] ?? "").toLowerCase();
    const attrs: Record<string, string> = {};
    for (const key of ["href", "src", "alt", "name", "type", "action", "aria-label", "placeholder", "id"]) {
      const v = attrsStr.match(new RegExp(`${key}\\s*=\\s*["']([^"']*)["']`, "i"))?.[1];
      if (v) attrs[key] = v;
    }
    const text = truncate(inner || attrs.alt || attrs["aria-label"] || "");
    if (!text) continue;
    blocks.push({ tag, classAttr, text, attrs, order: blocks.length });
  }
  return blocks;
}

function computePosition(order: number, total: number): "top" | "upper" | "middle" {
  const frac = total <= 1 ? 0 : order / total;
  if (frac <= 0.15) return "top";
  if (frac <= 0.45) return "upper";
  return "middle";
}

function prominence(tag: string, classAttr: string, headingLevel: number): number {
  let p = 1;
  if (tag === "h1") p = 10;
  else if (tag === "h2") p = 8;
  else if (tag === "h3") p = 6;
  else if (tag === "nav") p = 5;
  else if (tag === "button") p = 7;
  else if (tag === "a") p = 4;
  else if (tag === "img") p = 5;
  else if (tag === "form") p = 6;
  else if (tag === "blockquote") p = 3;
  else p = 2;
  if (headingLevel > 0) p += 3;
  if (/btn|cta|primary|action/.test(classAttr)) p += 3;
  if (/hero|banner|jumbotron|masthead/.test(classAttr)) p += 2;
  return p;
}

function headingLevel(tag: string): number {
  if (tag === "h1") return 1;
  if (tag === "h2") return 2;
  if (tag === "h3") return 3;
  return 0;
}

function classify(kind: string, text: string, classAttr: string): string | null {
  switch (kind) {
    case "nav":
      return "nav";
    case "h1":
      return "hero_heading";
    case "h2":
    case "h3":
      return "subheading";
    case "button":
      return "cta";
    case "a":
      if (/btn|cta|primary|button/.test(classAttr)) return "cta";
      return "link";
    case "img":
      return "hero_image";
    case "form":
      return "form";
    case "blockquote":
      return "testimonial";
    default:
      return null;
  }
}

function isTrustish(text: string): boolean {
  const t = text.toLowerCase();
  return (
    /trusted by|used by|backed by| SOC ?2|ISO ?27001|GDPR|HIPAA|customers? in|freelancers|companies|reviews|rating|\b4\.\d\/5\b|\bstars?\b/.test(
      t,
    ) || /logo/.test(t)
  );
}

function buildFirstScreen(html: string) {
  const title = truncate(stripTags(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "")) || "(no title)";
  const metaDesc = truncate(
    stripTags(html.match(/<meta[^>]+name\s*=\s*["']description["'][^>]*content\s*=\s*["']([^"']*)["']/i)?.[1] ?? ""),
  );
  const ogTags: Record<string, string> = {};
  for (const prop of ["og:title", "og:description", "og:image"]) {
    const v = html.match(
      new RegExp(`<meta[^>]+property\\s*=\\s*["']${prop}["'][^>]*content\\s*=\\s*["']([^"']*)["']`, "i"),
    )?.[1];
    if (v) ogTags[prop] = truncate(stripTags(v));
  }

  const raw = extractBlocks(html);
  const blocks: Block[] = [];
  for (const b of raw) {
    let kind = classify(b.tag, b.text, b.classAttr);
    if (!kind) continue;
    if (kind === "link" && !/nav|menu|logo/.test(b.classAttr) && b.order > 20) continue;
    if (kind === "hero_image" && !b.attrs.src) continue;
    if (isTrustish(b.text) && !["nav", "cta", "form", "hero_image"].includes(kind)) kind = "trust";
    if (/(pricing|per month|\/mo|free trial|start at)/i.test(b.text) && kind !== "nav") kind = kind === "cta" ? "cta" : "pricing";
    if (/(SOC ?2|ISO ?27001|GDPR|HIPAA|security|encryption)/i.test(b.text)) kind = "badge";
    blocks.push({
      id: `b${blocks.length + 1}`,
      kind,
      text: truncate(b.text),
      approx_position: computePosition(b.order, raw.length),
      prominence_hint: prominence(b.tag, b.classAttr, headingLevel(b.tag)),
    });
    if (blocks.length >= 12) break;
  }

  const jsOnly =
    !blocks.some((b) => b.kind === "hero_heading" || b.kind === "subheading") &&
    /<div[^>]+id\s*=\s*["'](root|app|__next|app-root)["']/.test(html) &&
    stripTags(html).length < 800;

  const h1 = blocks.find((b) => b.kind === "hero_heading")?.text ?? "";
  const sub = blocks.find((b) => b.kind === "subheading")?.text ?? "";
  const ctas = blocks.filter((b) => b.kind === "cta").map((b) => b.text);
  const trust = blocks.filter((b) => b.kind === "trust" || b.kind === "badge").map((b) => b.text);

  return {
    title,
    meta_description: metaDesc,
    og_tags: ogTags,
    js_only_warning: jsOnly ? "Content rendered only by JS, so the analysis is limited." : null,
    blocks,
    state: {
      title,
      h1,
      sub,
      ctas,
      trust,
      blocks: blocks.map((b) => `${b.kind}: ${b.text}`),
    },
  };
}

function wireframe(blocks: Block[]) {
  return blocks.map((b, i) => ({
    id: b.id,
    kind: b.kind,
    x: 5 + (i % 2) * 4,
    y: Math.min(88, 3 + i * 8),
    w: 90 - (i % 2) * 8,
    h: 6 + (b.prominence_hint / 13) * 4,
    label: truncate(b.text, 48),
    weight_hint: b.prominence_hint / 13,
  }));
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });
  try {
    if (req.method !== "POST") return json({ error: "POST required" }, 405);
    const { url, viewport } = (await req.json()) as { url?: string; viewport?: string };
    if (!url || typeof url !== "string") return json({ error: "url required" }, 400);
    const parsed = normalizeUrl(url);
    if (!parsed) return json({ error: "URL not allowed. http/https, public hosts, standard ports only." }, 400);

    // Daily usage cap (service-role only; fail closed on error)
    const supabaseAdmin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: capResult, error: capError } = await supabaseAdmin.rpc("increment_usage", {
      fn_name: "fetch-page",
      cap: 200,
    });
    if (capError) return json({ error: "Usage counter unavailable." }, 503);
    if (capResult === -1) return json({ error: "Demo daily limit reached - Offline demo still works" }, 429);

    // One analysis per URL per minute (durable across instances via the database)
    const cutoff = new Date(Date.now() - 60_000).toISOString();
    const { data: recent } = await supabaseAdmin
      .from("analyses")
      .select("id, created_at")
      .eq("url", parsed.toString())
      .gte("created_at", cutoff)
      .limit(1);
    if (recent && recent.length > 0) {
      return json({ error: "This URL was analyzed less than a minute ago. Please wait and try again." }, 429);
    }

    const deadline = Date.now() + TIMEOUT_MS;
    const budget = { requests: 0 };
    const res = await fetchWithGuard(parsed, deadline, budget, 0);
    if (!res) return json({ error: "Could not fetch the page within the passive-fetch rules (10 requests, 2MB, 15s)." }, 422);
    if (!res.ok) return json({ error: `Target page returned HTTP ${res.status}.` }, 422);
    const ctype = res.headers.get("content-type") ?? "";
    if (!/text\/html|application\/xhtml/.test(ctype)) {
      return json({ error: "URL did not return an HTML page." }, 422);
    }
    const raw = await res.text();
    if (raw.length > MAX_FILE_BYTES) {
      return json({ error: "Page exceeded the 2 MB size cap." }, 422);
    }

    const first_screen = buildFirstScreen(raw);
    const wf = wireframe(first_screen.blocks);

    // optional screenshot
    let screenshot_path: string | null = null;
    const shotTpl = Deno.env.get("SCREENSHOT_API_URL");
    if (shotTpl) {
      try {
        const w = viewport === "mobile" ? 390 : 1440;
        const h = viewport === "mobile" ? 844 : 900;
        const shotUrl = shotTpl.replace("{url}", encodeURIComponent(parsed.toString())).replace("{w}", String(w)).replace("{h}", String(h));
        budget.requests += 1;
        const shot = await fetch(shotUrl, {
          signal: AbortSignal.timeout(Math.max(0, deadline - Date.now())),
        });
        if (shot.ok) {
          const bytes = new Uint8Array(await shot.arrayBuffer());
          if (bytes.length <= MAX_FILE_BYTES) {
            const path = `screenshots/${crypto.randomUUID()}.png`;
            const { error } = await supabaseAdmin.storage
              .from("firstscreen-screenshots")
              .upload(path, bytes, { contentType: "image/png", upsert: false });
            if (!error) screenshot_path = path;
          }
        }
      } catch {
        // screenshot is optional; fall back to wireframe
      }
    }

    return json({
      final_url: parsed.toString(),
      requests_made: budget.requests,
      first_screen,
      wireframe: wf,
      screenshot_path,
      viewport: viewport === "mobile" ? "mobile" : "desktop",
    });
  } catch (err) {
    if (err instanceof Error && err.message === "blocked-url") {
      return json({ error: "URL blocked by the SSRF guard (private/internal hosts are not allowed)." }, 400);
    }
    return json({ error: err instanceof Error ? err.message : "fetch-page failed" }, 500);
  }
});
