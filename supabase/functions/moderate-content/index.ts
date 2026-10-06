// moderate-content — the AI check of new posts and comments (docs/moderation.md).
//
// Called only by pg_cron (public.invoke_moderate_content) with the shared X-Internal-Secret, once
// a minute while checks are waiting. It claims a batch (claim_moderation_batch), asks OpenAI's
// moderation model about each caption, comment and photo, and records the result
// (complete_moderation_scan): 'flag' or 'block' puts it on the staff list.
//
// Without OPENAI_API_KEY it checks nothing: each claimed row is closed as 'skipped' and the
// function logs that the key is missing. Videos are not sent (the model reads text and images
// only); a video post's caption is still checked.
//
// Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (built in), MODERATE_CONTENT_SECRET (the same
// value as the Vault secret moderate_content_secret), OPENAI_API_KEY (optional; the switch).
// Optional: OPENAI_MODERATION_MODEL (default omni-moderation-latest).
// Deploy with --no-verify-jwt; the secret is the gate.
import { createClient } from "npm:@supabase/supabase-js@2.117.2";
import { mergeScores, parseScores, reasonFor, scoresToDecision } from "../_shared/moderation.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const SECRET = Deno.env.get("MODERATE_CONTENT_SECRET") || "";
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY") || "";
const MODEL = Deno.env.get("OPENAI_MODERATION_MODEL") || "omni-moderation-latest";
const SIGNED_URL_SECONDS = 600;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

type Scan = {
  id: number;
  target_type: "post" | "comment";
  target_id: string;
  body: string | null;
  media: { path: string; type: string }[];
};

function timingSafeEqual(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a);
  const y = new TextEncoder().encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

async function complete(id: number, fields: Record<string, unknown>) {
  const { error } = await supabase.rpc("complete_moderation_scan", { p_scan_id: id, ...fields });
  if (error) throw new Error(`complete_moderation_scan ${id}: ${error.message}`);
}

// One call per input: the model takes text and one image at a time reliably.
async function moderate(input: unknown): Promise<Record<string, number>> {
  const res = await fetch("https://api.openai.com/v1/moderations", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${OPENAI_API_KEY}` },
    body: JSON.stringify({ model: MODEL, input }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return parseScores(await res.json());
}

async function check(scan: Scan): Promise<Record<string, number>[]> {
  const all: Record<string, number>[] = [];
  const text = (scan.body ?? "").trim();
  if (text) all.push(await moderate([{ type: "text", text: text.slice(0, 4000) }]));
  const photos = (scan.media ?? []).filter((m) => m.type !== "video").map((m) => m.path);
  if (photos.length) {
    const { data, error } = await supabase.storage.from("posts").createSignedUrls(photos, SIGNED_URL_SECONDS);
    if (error) throw new Error(`signed urls: ${error.message}`);
    for (const d of data ?? []) {
      if (d.signedUrl) all.push(await moderate([{ type: "image_url", image_url: { url: d.signedUrl } }]));
    }
  }
  return all;
}

async function run() {
  const { data, error } = await supabase.rpc("claim_moderation_batch", { p_limit: 20 });
  if (error) throw new Error(error.message);
  const scans = (data ?? []) as Scan[];
  if (scans.length === 0) return { claimed: 0 };

  if (!OPENAI_API_KEY) {
    console.log(`[moderate-content] OPENAI_API_KEY is not set: ${scans.length} check(s) skipped`);
    for (const s of scans) await complete(s.id, { p_status: "skipped", p_error: "no OPENAI_API_KEY" });
    return { claimed: scans.length, skipped: scans.length };
  }

  const counts = { clean: 0, flag: 0, block: 0, skipped: 0, error: 0 };
  for (const scan of scans) {
    try {
      const results = await check(scan);
      if (results.length === 0) {
        // Deleted already, or a video with no caption: nothing to read.
        await complete(scan.id, { p_status: "skipped", p_error: "nothing to check" });
        counts.skipped++;
        continue;
      }
      const scores = mergeScores(results);
      const { decision, labels } = scoresToDecision(scores);
      await complete(scan.id, {
        p_status: "done",
        p_decision: decision,
        p_labels: labels,
        p_scores: scores,
        p_provider: `openai:${MODEL}`,
        p_reason: reasonFor(labels, scores),
      });
      counts[decision]++;
    } catch (e) {
      // Retried on a later run (up to 3 tries), then closed as 'error'.
      console.error("[moderate-content]", scan.target_type, scan.target_id, e);
      await complete(scan.id, { p_status: "error", p_error: String(e).slice(0, 500) });
      counts.error++;
    }
  }
  return { claimed: scans.length, ...counts };
}

Deno.serve(async (req) => {
  if (
    req.method !== "POST" || !SECRET ||
    !timingSafeEqual(req.headers.get("X-Internal-Secret") ?? "", SECRET)
  ) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });
  }
  try {
    const result = await run();
    return new Response(JSON.stringify(result), { headers: { "Content-Type": "application/json" } });
  } catch (e) {
    console.error("[moderate-content]", e);
    return new Response(JSON.stringify({ error: String(e) }), { status: 500 });
  }
});
