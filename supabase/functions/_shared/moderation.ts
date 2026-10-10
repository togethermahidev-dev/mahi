// The AI check's rules, kept free of network calls so they can be tested (moderation_test.ts).
// We read OpenAI's per-category scores
// (0–1), not its yes/no "flagged", so Mahi owns the thresholds. A score at or above `block` is a
// 'block', at or above `flag` a 'flag'; the worst category wins.
// 'flag' and 'block' both put the post or comment on the staff list. A 'block' also hides it
// straight away only when app_config.ai_auto_hide is on (it starts off).

export type Decision = "clean" | "flag" | "block";

export const THRESHOLDS: Record<string, { flag: number; block: number }> = {
  sexual: { flag: 0.3, block: 0.5 },
  "sexual/minors": { flag: 0.2, block: 0.3 },
  violence: { flag: 0.7, block: 0.92 },
  "violence/graphic": { flag: 0.6, block: 0.85 },
  "self-harm": { flag: 0.5, block: 0.85 },
  "self-harm/intent": { flag: 0.4, block: 0.7 },
  "self-harm/instructions": { flag: 0.4, block: 0.7 },
  harassment: { flag: 0.7, block: 0.9 },
  "harassment/threatening": { flag: 0.6, block: 0.85 },
  hate: { flag: 0.6, block: 0.85 },
  "hate/threatening": { flag: 0.5, block: 0.8 },
  illicit: { flag: 0.7, block: 0.92 },
  "illicit/violent": { flag: 0.6, block: 0.85 },
};
export const DEFAULT_THRESHOLD = { flag: 0.8, block: 0.95 };

const SEVERITY: Record<Decision, number> = { clean: 0, flag: 1, block: 2 };

/** A decision and the categories that crossed a line, from one set of scores. */
export function scoresToDecision(scores: Record<string, number>): { decision: Decision; labels: string[] } {
  let decision: Decision = "clean";
  const labels: string[] = [];
  for (const [category, raw] of Object.entries(scores ?? {})) {
    const score = typeof raw === "number" && Number.isFinite(raw) ? raw : 0;
    const t = THRESHOLDS[category] ?? DEFAULT_THRESHOLD;
    const d: Decision = score >= t.block ? "block" : score >= t.flag ? "flag" : "clean";
    if (d !== "clean") labels.push(category);
    if (SEVERITY[d] > SEVERITY[decision]) decision = d;
  }
  return { decision, labels };
}

/** Highest score per category across several checks (a caption and each photo). */
export function mergeScores(all: Record<string, number>[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const scores of all) {
    for (const [k, v] of Object.entries(scores)) {
      if (typeof v === "number" && Number.isFinite(v)) out[k] = Math.max(out[k] ?? 0, v);
    }
  }
  return out;
}

/** category_scores from an OpenAI moderations response; {} for anything malformed. */
export function parseScores(json: unknown): Record<string, number> {
  const results = (json as { results?: unknown })?.results;
  if (!Array.isArray(results) || results.length === 0) return {};
  const scores = (results[0] as { category_scores?: unknown })?.category_scores;
  if (!scores || typeof scores !== "object") return {};
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(scores as Record<string, unknown>)) {
    if (typeof v === "number" && Number.isFinite(v)) out[k] = v;
  }
  return out;
}

/** The report reason staff see for an AI flag: the label with the highest score. */
export function reasonFor(labels: string[], scores: Record<string, number>): string {
  const top = [...labels].sort((a, b) => (scores[b] ?? 0) - (scores[a] ?? 0))[0] ?? "";
  if (top === "sexual/minors") return "underage";
  if (top.startsWith("sexual")) return "sexual_content";
  if (top.startsWith("hate")) return "hate_speech";
  if (top.startsWith("harassment")) return "harassment";
  if (top.startsWith("violence")) return "violence";
  if (top.startsWith("self-harm")) return "self_harm";
  return "other";
}
