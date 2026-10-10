import type { FirstScreen, JevAnswers, WireframeRect } from "./types";

export interface DemoFixture {
  id: string;
  label: string;
  url: string;
  description: string;
  firstScreen: FirstScreen;
  wireframe: WireframeRect[];
  answers: JevAnswers;
  inputTokens: number;
}

function score(s: number, c: number, probs?: Record<string, number>) {
  return { type: "score" as const, score: s, confidence: c, probabilities: probs };
}
function choice(c: string, conf: number, probs: Record<string, number>) {
  return { type: "choice" as const, choice: c, confidence: conf, probabilities: probs };
}
function noul(v: number) {
  return { type: "noul" as const, noul: v };
}

function mkBlocks(
  defs: { kind: string; text: string; pos: "top" | "upper" | "middle"; prom: number }[],
) {
  return defs.map((d, i) => ({
    id: `b${i + 1}`,
    kind: d.kind,
    text: d.text,
    approx_position: d.pos,
    prominence_hint: d.prom,
  }));
}

function mkWireframe(blocks: { id: string; kind: string; text: string; prominence_hint: number }[]): WireframeRect[] {
  return blocks.map((b, i) => ({
    id: b.id,
    kind: b.kind,
    x: 5 + (i % 2) * 4,
    y: Math.min(88, 3 + i * 8),
    w: 90 - (i % 2) * 8,
    h: 6 + (b.prominence_hint / 13) * 4,
    label: b.text.slice(0, 48),
    weight_hint: b.prominence_hint / 13,
  }));
}

// ---------- Vague SaaS (D/F) ----------
const vagueBlocks = mkBlocks([
  { kind: "nav", text: "Products Solutions Platform Pricing About Contact", pos: "top", prom: 5 },
  { kind: "hero_heading", text: "Synergize Your Digital Transformation Journey", pos: "top", prom: 10 },
  { kind: "subheading", text: "Empowering enterprises with next-generation AI-driven paradigms for the modern world", pos: "top", prom: 8 },
  { kind: "cta", text: "Book a Demo", pos: "upper", prom: 10 },
  { kind: "cta", text: "Learn More", pos: "upper", prom: 9 },
  { kind: "cta", text: "Get Started", pos: "upper", prom: 9 },
  { kind: "hero_image", text: "abstract network graphic", pos: "upper", prom: 5 },
]);

const vagueAnswers: JevAnswers = {
  investor__clarity__score: score(1.2, 0.81, { "0": 0.3, "1": 0.45, "2": 0.2, "3": 0.05, "4": 0 }),
  investor__clarity__main_gap: choice("what_it_is", 0.86, { what_it_is: 0.6, who_its_for: 0.22, why_better: 0.1, proof: 0.05, nothing: 0.01, uncertain: 0.02 }),
  investor__clarity__continue: noul(0.12),
  investor__trust__score: score(1.0, 0.77, { "0": 0.4, "1": 0.4, "2": 0.17, "3": 0.03, "4": 0 }),
  investor__trust__main_gap: choice("no_proof", 0.8, { no_proof: 0.62, generic_stock: 0.2, unclear_company: 0.1, no_pricing: 0.04, nothing: 0.02, uncertain: 0.02 }),
  investor__trust__continue: noul(0.1),
  investor__cta__score: score(0.9, 0.83, { "0": 0.5, "1": 0.35, "2": 0.12, "3": 0.03, "4": 0 }),
  investor__cta__main_gap: choice("too_many_ctas", 0.78, { no_cta: 0.05, too_many_ctas: 0.6, vague_label: 0.2, high_friction: 0.08, below_fold: 0.03, nothing: 0.02, uncertain: 0.02 }),
  investor__cta__continue: noul(0.08),
  investor__attention__look: choice("b2", 0.9, { b1: 0.15, b2: 0.62, b3: 0.18, uncertain: 0.05 }),
  investor__attention__click: choice("nothing", 0.7, { b1: 0.1, b2: 0.15, b4: 0.28, b5: 0.22, b6: 0.2, nothing: 0.05 }),

  user__clarity__score: score(1.0, 0.84, { "0": 0.42, "1": 0.4, "2": 0.15, "3": 0.03, "4": 0 }),
  user__clarity__main_gap: choice("what_it_is", 0.9, { what_it_is: 0.7, who_its_for: 0.15, why_better: 0.08, proof: 0.04, nothing: 0.01, uncertain: 0.02 }),
  user__clarity__continue: noul(0.09),
  user__trust__score: score(0.9, 0.79, { "0": 0.5, "1": 0.35, "2": 0.12, "3": 0.03, "4": 0 }),
  user__trust__main_gap: choice("generic_stock", 0.75, { no_proof: 0.3, generic_stock: 0.5, unclear_company: 0.12, no_pricing: 0.04, nothing: 0.02, uncertain: 0.02 }),
  user__trust__continue: noul(0.08),
  user__cta__score: score(0.8, 0.85, { "0": 0.58, "1": 0.3, "2": 0.1, "3": 0.02, "4": 0 }),
  user__cta__main_gap: choice("too_many_ctas", 0.82, { no_cta: 0.04, too_many_ctas: 0.65, vague_label: 0.2, high_friction: 0.06, below_fold: 0.02, nothing: 0.01, uncertain: 0.02 }),
  user__cta__continue: noul(0.07),
  user__attention__look: choice("b2", 0.92, { b1: 0.1, b2: 0.68, b3: 0.17, uncertain: 0.05 }),
  user__attention__click: choice("nothing", 0.65, { b1: 0.08, b2: 0.1, b4: 0.3, b5: 0.25, b6: 0.22, nothing: 0.05 }),

  designer__clarity__score: score(1.4, 0.75, { "0": 0.2, "1": 0.45, "2": 0.25, "3": 0.1, "4": 0 }),
  designer__clarity__main_gap: choice("why_better", 0.7, { what_it_is: 0.35, who_its_for: 0.2, why_better: 0.3, proof: 0.08, nothing: 0.03, uncertain: 0.04 }),
  designer__clarity__continue: noul(0.15),
  designer__trust__score: score(1.1, 0.72, { "0": 0.35, "1": 0.4, "2": 0.2, "3": 0.05, "4": 0 }),
  designer__trust__main_gap: choice("generic_stock", 0.78, { no_proof: 0.25, generic_stock: 0.55, unclear_company: 0.12, no_pricing: 0.03, nothing: 0.02, uncertain: 0.03 }),
  designer__trust__continue: noul(0.12),
  designer__cta__score: score(1.0, 0.8, { "0": 0.45, "1": 0.35, "2": 0.15, "3": 0.05, "4": 0 }),
  designer__cta__main_gap: choice("vague_label", 0.74, { no_cta: 0.05, too_many_ctas: 0.4, vague_label: 0.38, high_friction: 0.08, below_fold: 0.04, nothing: 0.02, uncertain: 0.03 }),
  designer__cta__continue: noul(0.1),
  designer__attention__look: choice("b2", 0.88, { b1: 0.12, b2: 0.6, b3: 0.2, uncertain: 0.08 }),
  designer__attention__click: choice("b4", 0.6, { b1: 0.08, b2: 0.12, b4: 0.35, b5: 0.25, b6: 0.15, nothing: 0.05 }),
};

// ---------- Solid Startup (B) ----------
const solidBlocks = mkBlocks([
  { kind: "nav", text: "Product Pricing Docs Blog Login", pos: "top", prom: 5 },
  { kind: "hero_heading", text: "Get paid 2x faster", pos: "top", prom: 10 },
  { kind: "subheading", text: "Automated invoicing for freelancers — send, track, and collect without the chase", pos: "top", prom: 8 },
  { kind: "cta", text: "Start free", pos: "upper", prom: 10 },
  { kind: "trust", text: "Trusted by 4,000 freelancers", pos: "upper", prom: 4 },
  { kind: "trust", text: "Stripe · PayPal · Wise logos", pos: "upper", prom: 3 },
  { kind: "hero_image", text: "invoice dashboard screenshot", pos: "upper", prom: 5 },
  { kind: "pricing", text: "Free to start, $12/mo after", pos: "upper", prom: 3 },
]);

const solidAnswers: JevAnswers = {
  investor__clarity__score: score(3.0, 0.78, { "0": 0, "1": 0.08, "2": 0.22, "3": 0.45, "4": 0.25 }),
  investor__clarity__main_gap: choice("proof", 0.7, { what_it_is: 0.1, who_its_for: 0.1, why_better: 0.2, proof: 0.45, nothing: 0.1, uncertain: 0.05 }),
  investor__clarity__continue: noul(0.72),
  investor__trust__score: score(2.8, 0.74, { "0": 0, "1": 0.12, "2": 0.3, "3": 0.4, "4": 0.18 }),
  investor__trust__main_gap: choice("no_pricing", 0.6, { no_proof: 0.2, generic_stock: 0.1, unclear_company: 0.1, no_pricing: 0.4, nothing: 0.15, uncertain: 0.05 }),
  investor__trust__continue: noul(0.7),
  investor__cta__score: score(3.2, 0.8, { "0": 0, "1": 0.06, "2": 0.18, "3": 0.5, "4": 0.26 }),
  investor__cta__main_gap: choice("nothing", 0.75, { no_cta: 0.02, too_many_ctas: 0.05, vague_label: 0.1, high_friction: 0.05, below_fold: 0.03, nothing: 0.7, uncertain: 0.05 }),
  investor__cta__continue: noul(0.75),
  investor__attention__look: choice("b2", 0.88, { b1: 0.12, b2: 0.6, b3: 0.2, uncertain: 0.08 }),
  investor__attention__click: choice("b4", 0.85, { b1: 0.05, b2: 0.08, b4: 0.7, b5: 0.1, b6: 0.04, nothing: 0.03 }),

  user__clarity__score: score(3.4, 0.84, { "0": 0, "1": 0.05, "2": 0.15, "3": 0.5, "4": 0.3 }),
  user__clarity__main_gap: choice("nothing", 0.72, { what_it_is: 0.05, who_its_for: 0.05, why_better: 0.12, proof: 0.08, nothing: 0.65, uncertain: 0.05 }),
  user__clarity__continue: noul(0.82),
  user__trust__score: score(3.0, 0.78, { "0": 0, "1": 0.1, "2": 0.25, "3": 0.45, "4": 0.2 }),
  user__trust__main_gap: choice("no_proof", 0.55, { no_proof: 0.4, generic_stock: 0.1, unclear_company: 0.05, no_pricing: 0.1, nothing: 0.3, uncertain: 0.05 }),
  user__trust__continue: noul(0.78),
  user__cta__score: score(3.6, 0.86, { "0": 0, "1": 0.03, "2": 0.1, "3": 0.45, "4": 0.42 }),
  user__cta__main_gap: choice("nothing", 0.8, { no_cta: 0.02, too_many_ctas: 0.03, vague_label: 0.05, high_friction: 0.05, below_fold: 0.02, nothing: 0.8, uncertain: 0.03 }),
  user__cta__continue: noul(0.85),
  user__attention__look: choice("b2", 0.9, { b1: 0.1, b2: 0.65, b3: 0.2, uncertain: 0.05 }),
  user__attention__click: choice("b4", 0.88, { b1: 0.04, b2: 0.06, b4: 0.75, b5: 0.08, b6: 0.04, nothing: 0.03 }),

  designer__clarity__score: score(3.2, 0.76, { "0": 0, "1": 0.08, "2": 0.2, "3": 0.45, "4": 0.27 }),
  designer__clarity__main_gap: choice("why_better", 0.62, { what_it_is: 0.08, who_its_for: 0.08, why_better: 0.35, proof: 0.15, nothing: 0.3, uncertain: 0.04 }),
  designer__clarity__continue: noul(0.7),
  designer__trust__score: score(3.3, 0.74, { "0": 0, "1": 0.06, "2": 0.18, "3": 0.48, "4": 0.28 }),
  designer__trust__main_gap: choice("no_proof", 0.58, { no_proof: 0.4, generic_stock: 0.08, unclear_company: 0.08, no_pricing: 0.08, nothing: 0.32, uncertain: 0.04 }),
  designer__trust__continue: noul(0.72),
  designer__cta__score: score(3.7, 0.82, { "0": 0, "1": 0.03, "2": 0.08, "3": 0.45, "4": 0.44 }),
  designer__cta__main_gap: choice("nothing", 0.78, { no_cta: 0.02, too_many_ctas: 0.04, vague_label: 0.06, high_friction: 0.04, below_fold: 0.03, nothing: 0.76, uncertain: 0.05 }),
  designer__cta__continue: noul(0.78),
  designer__attention__look: choice("b2", 0.86, { b1: 0.12, b2: 0.58, b3: 0.22, uncertain: 0.08 }),
  designer__attention__click: choice("b4", 0.82, { b1: 0.05, b2: 0.07, b4: 0.72, b5: 0.09, b6: 0.04, nothing: 0.03 }),
};

// ---------- Polished Product (A) ----------
const polishedBlocks = mkBlocks([
  { kind: "nav", text: "Features Pricing Customers Docs Sign in", pos: "top", prom: 5 },
  { kind: "hero_heading", text: "Ship customer support that answers itself", pos: "top", prom: 10 },
  { kind: "subheading", text: "Resolve 70% of support tickets automatically with AI trained on your docs", pos: "top", prom: 8 },
  { kind: "cta", text: "Try free for 14 days", pos: "upper", prom: 10 },
  { kind: "trust", text: "SOC2 Type II certified", pos: "upper", prom: 3 },
  { kind: "trust", text: "Backed by Sequoia · loved by 12,000 teams", pos: "upper", prom: 4 },
  { kind: "trust", text: "★★★★★ 4.9/5 on G2", pos: "upper", prom: 3 },
  { kind: "hero_image", text: "product screenshot with real conversation", pos: "upper", prom: 5 },
]);

const polishedAnswers: JevAnswers = {
  investor__clarity__score: score(4.0, 0.9, { "0": 0, "1": 0, "2": 0.02, "3": 0.28, "4": 0.7 }),
  investor__clarity__main_gap: choice("nothing", 0.85, { what_it_is: 0.02, who_its_for: 0.03, why_better: 0.06, proof: 0.04, nothing: 0.82, uncertain: 0.03 }),
  investor__clarity__continue: noul(0.93),
  investor__trust__score: score(3.9, 0.87, { "0": 0, "1": 0.01, "2": 0.05, "3": 0.3, "4": 0.64 }),
  investor__trust__main_gap: choice("nothing", 0.82, { no_proof: 0.05, generic_stock: 0.02, unclear_company: 0.03, no_pricing: 0.06, nothing: 0.8, uncertain: 0.04 }),
  investor__trust__continue: noul(0.92),
  investor__cta__score: score(3.8, 0.88, { "0": 0, "1": 0.02, "2": 0.06, "3": 0.35, "4": 0.57 }),
  investor__cta__main_gap: choice("nothing", 0.8, { no_cta: 0.02, too_many_ctas: 0.03, vague_label: 0.05, high_friction: 0.04, below_fold: 0.03, nothing: 0.78, uncertain: 0.05 }),
  investor__cta__continue: noul(0.9),
  investor__attention__look: choice("b2", 0.92, { b1: 0.08, b2: 0.66, b3: 0.2, uncertain: 0.06 }),
  investor__attention__click: choice("b4", 0.9, { b1: 0.03, b2: 0.05, b4: 0.8, b5: 0.06, b6: 0.03, nothing: 0.03 }),

  user__clarity__score: score(4.0, 0.92, { "0": 0, "1": 0, "2": 0.02, "3": 0.25, "4": 0.73 }),
  user__clarity__main_gap: choice("nothing", 0.88, { what_it_is: 0.02, who_its_for: 0.02, why_better: 0.04, proof: 0.03, nothing: 0.86, uncertain: 0.03 }),
  user__clarity__continue: noul(0.95),
  user__trust__score: score(4.0, 0.9, { "0": 0, "1": 0, "2": 0.03, "3": 0.27, "4": 0.7 }),
  user__trust__main_gap: choice("nothing", 0.85, { no_proof: 0.04, generic_stock: 0.02, unclear_company: 0.02, no_pricing: 0.04, nothing: 0.84, uncertain: 0.04 }),
  user__trust__continue: noul(0.94),
  user__cta__score: score(4.0, 0.91, { "0": 0, "1": 0, "2": 0.03, "3": 0.28, "4": 0.69 }),
  user__cta__main_gap: choice("nothing", 0.86, { no_cta: 0.01, too_many_ctas: 0.02, vague_label: 0.03, high_friction: 0.03, below_fold: 0.02, nothing: 0.86, uncertain: 0.03 }),
  user__cta__continue: noul(0.95),
  user__attention__look: choice("b2", 0.94, { b1: 0.06, b2: 0.7, b3: 0.18, uncertain: 0.06 }),
  user__attention__click: choice("b4", 0.92, { b1: 0.02, b2: 0.04, b4: 0.84, b5: 0.05, b6: 0.02, nothing: 0.03 }),

  designer__clarity__score: score(3.9, 0.85, { "0": 0, "1": 0.01, "2": 0.04, "3": 0.35, "4": 0.6 }),
  designer__clarity__main_gap: choice("nothing", 0.8, { what_it_is: 0.03, who_its_for: 0.03, why_better: 0.06, proof: 0.05, nothing: 0.79, uncertain: 0.04 }),
  designer__clarity__continue: noul(0.9),
  designer__trust__score: score(3.8, 0.83, { "0": 0, "1": 0.02, "2": 0.06, "3": 0.32, "4": 0.6 }),
  designer__trust__main_gap: choice("nothing", 0.78, { no_proof: 0.06, generic_stock: 0.03, unclear_company: 0.03, no_pricing: 0.05, nothing: 0.78, uncertain: 0.05 }),
  designer__trust__continue: noul(0.88),
  designer__cta__score: score(3.9, 0.86, { "0": 0, "1": 0.01, "2": 0.05, "3": 0.3, "4": 0.64 }),
  designer__cta__main_gap: choice("nothing", 0.82, { no_cta: 0.02, too_many_ctas: 0.02, vague_label: 0.04, high_friction: 0.03, below_fold: 0.04, nothing: 0.8, uncertain: 0.05 }),
  designer__cta__continue: noul(0.9),
  designer__attention__look: choice("b2", 0.9, { b1: 0.08, b2: 0.62, b3: 0.22, uncertain: 0.08 }),
  designer__attention__click: choice("b4", 0.88, { b1: 0.03, b2: 0.05, b4: 0.78, b5: 0.07, b6: 0.04, nothing: 0.03 }),
};

export const FIXTURES: DemoFixture[] = [
  {
    id: "vague",
    label: "Vague SaaS",
    url: "https://demo.firstscreen.app/synergy",
    description: "Buzzword h1, three competing CTAs, no proof — lands in D/F territory.",
    firstScreen: {
      title: "SynergySoft — Digital Transformation",
      meta_description: "",
      og_tags: {},
      js_only_warning: null,
      blocks: vagueBlocks,
      state: {
        title: "SynergySoft — Digital Transformation",
        h1: "Synergize Your Digital Transformation Journey",
        sub: "Empowering enterprises with next-generation AI-driven paradigms for the modern world",
        ctas: ["Book a Demo", "Learn More", "Get Started"],
        trust: [],
        blocks: vagueBlocks.map((b) => `${b.kind}: ${b.text}`),
      },
    },
    wireframe: mkWireframe(vagueBlocks),
    answers: vagueAnswers,
    inputTokens: 2410,
  },
  {
    id: "solid",
    label: "Solid Startup",
    url: "https://demo.firstscreen.app/invoicer",
    description: "Clear h1, one CTA, logo strip — a solid B.",
    firstScreen: {
      title: "Invoicer — Get paid 2x faster",
      meta_description: "Automated invoicing for freelancers.",
      og_tags: {},
      js_only_warning: null,
      blocks: solidBlocks,
      state: {
        title: "Invoicer — Get paid 2x faster",
        h1: "Get paid 2x faster",
        sub: "Automated invoicing for freelancers — send, track, and collect without the chase",
        ctas: ["Start free"],
        trust: ["Trusted by 4,000 freelancers", "Stripe · PayPal · Wise logos"],
        blocks: solidBlocks.map((b) => `${b.kind}: ${b.text}`),
      },
    },
    wireframe: mkWireframe(solidBlocks),
    answers: solidAnswers,
    inputTokens: 2380,
  },
  {
    id: "polished",
    label: "Polished Product",
    url: "https://demo.firstscreen.app/supportai",
    description: "Clear message, proof everywhere, one obvious action — an A.",
    firstScreen: {
      title: "SupportAI — Support that answers itself",
      meta_description: "Resolve 70% of support tickets automatically.",
      og_tags: {},
      js_only_warning: null,
      blocks: polishedBlocks,
      state: {
        title: "SupportAI — Support that answers itself",
        h1: "Ship customer support that answers itself",
        sub: "Resolve 70% of support tickets automatically with AI trained on your docs",
        ctas: ["Try free for 14 days"],
        trust: ["SOC2 Type II certified", "Backed by Sequoia · loved by 12,000 teams", "★★★★★ 4.9/5 on G2"],
        blocks: polishedBlocks.map((b) => `${b.kind}: ${b.text}`),
      },
    },
    wireframe: mkWireframe(polishedBlocks),
    answers: polishedAnswers,
    inputTokens: 2455,
  },
];
