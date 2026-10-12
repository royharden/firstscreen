import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.57.4";
// verify_jwt = true — callers must send the anon key

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const MAX_REQUESTS = 10;
const MAX_FILE_BYTES = 2 * 1024 * 1024;
const MAX_REDIRECTS = 3;
const TIMEOUT_MS = 15_000;
const DNS_TIMEOUT_MS = 3_000;
const MAX_BODY_BYTES = 8 * 1024;
const MAX_URL_CHARS = 2048;
const DEFAULT_DAILY_LIMIT = 200;
const DAILY_LIMIT_MESSAGE = "Demo daily limit reached - Offline demo still works";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

class InputError extends Error {
  constructor(readonly status: 400 | 413 | 422, message: string) {
    super(message);
  }
}

function dailyLimit(): number {
  const raw = (Deno.env.get("DAILY_CALL_LIMIT") ?? "").trim();
  const n = /^\d+$/.test(raw) ? Number(raw) : NaN;
  return Number.isSafeInteger(n) && n > 0 ? n : DEFAULT_DAILY_LIMIT;
}

function adminClient(): SupabaseClient | null {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

// Reserve one unit of today's cap. Fails closed: an RPC error or a missing /
// non-integer result is never treated as OK.
async function reserveUsage(supabase: SupabaseClient, fnName: string): Promise<{ ok: true } | { ok: false; status: 429 | 503 }> {
  try {
    const { data, error } = await supabase.rpc("increment_usage_by", { fn_name: fnName, units: 1, cap: dailyLimit() });
    if (error) {
      console.error("increment_usage_by failed", error.message);
      return { ok: false, status: 503 };
    }
    if (typeof data !== "number" || !Number.isInteger(data)) return { ok: false, status: 503 };
    if (data === -1) return { ok: false, status: 429 };
    if (data < 1) return { ok: false, status: 503 };
    return { ok: true };
  } catch (err) {
    console.error("increment_usage_by threw", err instanceof Error ? err.message : err);
    return { ok: false, status: 503 };
  }
}

// Read a body stream, giving up (null) as soon as it exceeds maxBytes.
async function readCapped(body: ReadableStream<Uint8Array> | null, declaredLength: string | null, maxBytes: number): Promise<Uint8Array | null> {
  if (Number(declaredLength ?? "0") > maxBytes) {
    await body?.cancel();
    return null;
  }
  if (!body) return new Uint8Array(0);
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    bytes.set(c, offset);
    offset += c.byteLength;
  }
  return bytes;
}

async function readJsonBody(req: Request, maxBytes: number): Promise<unknown> {
  const bytes = await readCapped(req.body, req.headers.get("content-length"), maxBytes);
  if (!bytes) throw new InputError(413, "Request body too large.");
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new InputError(400, "Invalid JSON body");
  }
}

function normalizeHost(host: string): string {
  return host.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.+$/, "");
}

function parseIPv4(host: string): number[] | null {
  const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return null;
  const octets = m.slice(1).map(Number);
  return octets.every((o) => o <= 255) ? octets : null;
}

function parseIPv6(host: string): number[] | null {
  let s = host;
  const v4Tail = s.match(/^(.*:)(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (v4Tail) {
    const v4 = parseIPv4(v4Tail[2]);
    if (!v4) return null;
    s = `${v4Tail[1]}${((v4[0] << 8) | v4[1]).toString(16)}:${((v4[2] << 8) | v4[3]).toString(16)}`;
  }
  const halves = s.split("::");
  if (halves.length > 2) return null;
  const groups = (part: string): number[] | null => {
    if (part === "") return [];
    const out: number[] = [];
    for (const g of part.split(":")) {
      if (!/^[0-9a-f]{1,4}$/.test(g)) return null;
      out.push(parseInt(g, 16));
    }
    return out;
  };
  const head = groups(halves[0]);
  const tail = halves.length === 2 ? groups(halves[1]) : [];
  if (!head || !tail) return null;
  if (halves.length === 1) return head.length === 8 ? head : null;
  const missing = 8 - head.length - tail.length;
  if (missing < 1) return null;
  return [...head, ...new Array(missing).fill(0), ...tail];
}

function isPrivateIPv4([a, b, c]: number[]): boolean {
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true; // link-local incl. 169.254.169.254
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  if (a === 192 && b === 0 && (c === 0 || c === 2)) return true; // 192.0.0.0/24 IETF, 192.0.2.0/24 TEST-NET-1
  if (a === 192 && b === 88 && c === 99) return true; // 6to4 relay anycast
  if (a === 198 && (b === 18 || b === 19)) return true; // 198.18.0.0/15 benchmarking
  if (a === 198 && b === 51 && c === 100) return true; // TEST-NET-2
  if (a === 203 && b === 0 && c === 113) return true; // TEST-NET-3
  if (a >= 224) return true; // multicast / reserved / broadcast
  return false;
}

function isPrivateIPv6(g: number[]): boolean {
  if (g.every((x) => x === 0)) return true; // ::
  if (g.slice(0, 7).every((x) => x === 0) && g[7] === 1) return true; // ::1
  if (g.slice(0, 5).every((x) => x === 0) && g[5] === 0xffff) return true; // ::ffff:0:0/96 (IPv4-mapped)
  if ((g[0] & 0xfe00) === 0xfc00) return true; // fc00::/7 unique-local
  if ((g[0] & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
  if ((g[0] & 0xff00) === 0xff00) return true; // ff00::/8 multicast
  // Anything outside global unicast 2000::/3 is reserved (::/96 IPv4-compatible,
  // 64:ff9b::/96 NAT64, 100::/64 discard, fec0::/10 site-local, ...).
  if ((g[0] & 0xe000) !== 0x2000) return true;
  if (g[0] === 0x2001 && g[1] < 0x0200) return true; // 2001::/23 IETF special-purpose (Teredo, ...)
  if (g[0] === 0x2001 && g[1] === 0x0db8) return true; // documentation
  if (g[0] === 0x2002) return true; // 6to4 (can embed private IPv4)
  if (g[0] === 0x3fff && g[1] < 0x1000) return true; // 3fff::/20 documentation
  return false;
}

// True when the host (name or IP literal) must not be fetched.
function isPrivateIp(rawHost: string): boolean {
  const host = normalizeHost(rawHost);
  if (!host) return true;
  const v4 = parseIPv4(host);
  if (v4) return isPrivateIPv4(v4);
  if (host.includes(":")) {
    const v6 = parseIPv6(host);
    return v6 ? isPrivateIPv6(v6) : true;
  }
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".internal") ||
    host.endsWith(".local") ||
    host.endsWith(".localdomain") ||
    host.endsWith(".home.arpa") ||
    host === "metadata" ||
    !host.includes(".") // single-label names only resolve on internal networks
  ) {
    return true;
  }
  return false;
}

function isIpLiteral(rawHost: string): boolean {
  const host = normalizeHost(rawHost);
  return parseIPv4(host) !== null || host.includes(":");
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("dns-timeout")), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

// Resolve A and AAAA and require every address to be public. Fails closed:
// any DNS error, timeout, or an empty answer rejects the host.
async function resolvesToPublic(rawHost: string, deadline: number): Promise<boolean> {
  const host = normalizeHost(rawHost);
  if (isPrivateIp(host)) return false;
  if (isIpLiteral(host)) return true;
  if (typeof Deno.resolveDns !== "function") {
    console.error("Deno.resolveDns unavailable; refusing to fetch");
    return false;
  }
  const ms = Math.min(DNS_TIMEOUT_MS, deadline - Date.now());
  if (ms <= 0) return false;
  const lookup = (type: "A" | "AAAA") =>
    withTimeout(Deno.resolveDns(host, type, { signal: AbortSignal.timeout(ms) }), ms).catch((err) => {
      // "No records of this type" is fine as long as the other family has some.
      if (err instanceof Deno.errors.NotFound) return [] as string[];
      throw err;
    });
  try {
    const [a, aaaa] = await Promise.all([lookup("A"), lookup("AAAA")]);
    const addrs = [...a, ...aaaa];
    if (addrs.length === 0) return false;
    return addrs.every((ip) => !isPrivateIp(ip));
  } catch (err) {
    console.error("dns lookup failed", host, err instanceof Error ? err.message : err);
    return false;
  }
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
  // Re-resolve on every hop so a redirect (or DNS answer) can't point at an internal address.
  if (!(await resolvesToPublic(checked.hostname, deadline))) throw new Error("blocked-url");
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
    await res.body?.cancel();
    if (!loc) return null;
    let next: URL;
    try {
      next = new URL(loc, checked);
    } catch {
      return null;
    }
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
    const body = await readJsonBody(req, MAX_BODY_BYTES);
    if (typeof body !== "object" || body === null || Array.isArray(body)) return json({ error: "url required" }, 400);
    const { url, viewport } = body as { url?: unknown; viewport?: unknown };
    if (!url || typeof url !== "string") return json({ error: "url required" }, 400);
    if (url.length > MAX_URL_CHARS) return json({ error: `URL exceeds ${MAX_URL_CHARS} characters.` }, 422);
    const parsed = normalizeUrl(url);
    if (!parsed) return json({ error: "URL not allowed. http/https, public hosts, standard ports only." }, 400);

    // Daily usage cap (service-role only; fail closed on error)
    const supabaseAdmin = adminClient();
    if (!supabaseAdmin) return json({ error: "Server not configured." }, 503);
    const reservation = await reserveUsage(supabaseAdmin, "fetch-page");
    if (!reservation.ok) {
      return reservation.status === 429
        ? json({ error: DAILY_LIMIT_MESSAGE, code: "daily_limit" }, 429)
        : json({ error: "Usage counter unavailable." }, 503);
    }

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
    if (!res.ok) {
      await res.body?.cancel();
      return json({ error: `Target page returned HTTP ${res.status}.` }, 422);
    }
    const ctype = res.headers.get("content-type") ?? "";
    if (!/text\/html|application\/xhtml/.test(ctype)) {
      await res.body?.cancel();
      return json({ error: "URL did not return an HTML page." }, 422);
    }
    // Check content-length up front, then stream and stop as soon as 2 MB is exceeded.
    const bytes = await readCapped(res.body, res.headers.get("content-length"), MAX_FILE_BYTES);
    if (!bytes) {
      return json({ error: "Page exceeded the 2 MB size cap." }, 422);
    }
    const raw = new TextDecoder().decode(bytes);

    const first_screen = buildFirstScreen(raw);
    const wf = wireframe(first_screen.blocks);

    // optional screenshot
    let screenshot_path: string | null = null;
    const shotTpl = Deno.env.get("SCREENSHOT_API_URL");
    if (shotTpl) {
      try {
        // The screenshot service may be paid: reserve a unit right before calling it; skip on limit/error.
        const shotReservation = await reserveUsage(supabaseAdmin, "fetch-page-screenshot");
        if (shotReservation.ok) {
          const w = viewport === "mobile" ? 390 : 1440;
          const h = viewport === "mobile" ? 844 : 900;
          const shotUrl = shotTpl.replace("{url}", encodeURIComponent(parsed.toString())).replace("{w}", String(w)).replace("{h}", String(h));
          budget.requests += 1;
          const shot = await fetch(shotUrl, {
            signal: AbortSignal.timeout(Math.max(0, deadline - Date.now())),
          });
          if (shot.ok) {
            const shotBytes = await readCapped(shot.body, shot.headers.get("content-length"), MAX_FILE_BYTES);
            if (shotBytes) {
              const path = `screenshots/${crypto.randomUUID()}.png`;
              const { error } = await supabaseAdmin.storage
                .from("firstscreen-screenshots")
                .upload(path, shotBytes, { contentType: "image/png", upsert: false });
              if (!error) screenshot_path = path;
            }
          } else {
            await shot.body?.cancel();
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
    if (err instanceof InputError) return json({ error: err.message }, err.status);
    if (err instanceof Error && err.message === "blocked-url") {
      return json({ error: "URL blocked by the SSRF guard (private/internal hosts are not allowed)." }, 400);
    }
    // Raw fetch/DNS error text stays in the server log only.
    console.error("fetch-page failed:", err instanceof Error ? err.message : err);
    return json({ error: "fetch-page failed" }, 500);
  }
});
