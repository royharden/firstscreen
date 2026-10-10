export type Viewport = "desktop" | "mobile";

export interface ScreenBlock {
  id: string;
  kind: string;
  text: string;
  approx_position: "top" | "upper" | "middle";
  prominence_hint: number;
}

export interface FirstScreen {
  title: string;
  meta_description?: string;
  og_tags?: Record<string, string>;
  js_only_warning?: string | null;
  blocks: ScreenBlock[];
  state?: {
    title: string;
    h1: string;
    sub: string;
    ctas: string[];
    trust: string[];
    blocks: string[];
  };
}

export interface WireframeRect {
  id: string;
  kind: string;
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
  weight_hint: number;
}

export interface JevScoreAnswer {
  type: "score";
  score: number;
  confidence: number;
  probabilities?: Record<string, number>;
}

export interface JevChoiceAnswer {
  type: "choice";
  choice: string;
  confidence: number;
  probabilities: Record<string, number>;
}

export interface JevNoulAnswer {
  type: "noul";
  noul: number;
}

export type JevAnswer = JevScoreAnswer | JevChoiceAnswer | JevNoulAnswer;

export type JevAnswers = Record<string, JevAnswer>;

export const PERSONAS = ["investor", "user", "designer"] as const;
export type Persona = (typeof PERSONAS)[number];
export const RUBRICS = ["clarity", "trust", "cta"] as const;
export type Rubric = (typeof RUBRICS)[number];

export interface CellResult {
  persona: Persona;
  rubric: Rubric;
  display: number; // 0-100
  raw: number; // 0-4
  confidence: number;
  low_confidence: boolean;
  gap: string | null;
  gap_confidence: number;
  gap_probabilities: Record<string, number>;
  score_probabilities: Record<string, number>;
  continue_prob: number | null; // noul value
}

export interface Aggregate {
  cells: Record<string, CellResult>;
  rubricScores: Record<Rubric, number>;
  personaScores: Record<Persona, number>;
  overall: number;
  grade: "A" | "B" | "C" | "D" | "F";
  bounceRisk: Record<Persona, number>;
  priorityFixes: { rubric: Rubric; persona: Persona; gap: string; priority: number }[];
  attention: {
    blocks: { id: string; weight: number; look: number; click: number }[];
    topLook: { persona: Persona; id: string }[];
    topClick: { persona: Persona; id: string }[];
    ctaNotNoticed?: boolean;
  };
}

export interface Summary {
  verdict: string;
  per_persona: { persona: string; take: string }[];
  top_fixes: { rubric: string; fix: string; why: string }[];
  rewrites: { h1_options: string[]; sub_options: string[]; cta_options: string[] };
  mock?: boolean;
}

export interface AnalysisResult {
  firstScreen: FirstScreen;
  wireframe: WireframeRect[];
  screenshotPath: string | null;
  answers: JevAnswers;
  jevMeta: {
    scope: string;
    question_count: number;
    latency_ms: number;
    input_tokens: number;
    cost_usd: number;
    model: string;
    fallback?: boolean;
  } | null;
  aggregate: Aggregate;
  summary: Summary | null;
  flagged: boolean;
}

export type ViewportMode = Viewport;

export interface RunOptions {
  url: string;
  viewport: Viewport;
  writerMode: "live" | "mock";
}

export interface RunResult {
  firstScreen: FirstScreen;
  wireframe: WireframeRect[];
  screenshotPath: string | null;
  answers: JevAnswers;
  jevMeta: AnalysisResult["jevMeta"];
  aggregate: Aggregate;
  summary: Summary | null;
  flagged: boolean;
}
