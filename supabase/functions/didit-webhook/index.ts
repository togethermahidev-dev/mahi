// didit-webhook — receives Didit's identity check results (app flag identity-verification).
// NOT deployed yet.
//
// Didit calls this URL (set in the Didit console) on every status change. Steps:
//   1. check the signature: a fresh X-Timestamp (5 minutes) and X-Signature (HMAC-SHA256 of the
//      raw body) or X-Signature-V2 (of the canonical JSON) with DIDIT_WEBHOOK_SECRET → else 401
//   2. ignore (200) anything but status.updated / data.updated, and statuses we don't know
//   3. record_identity_verification: idempotent, and an older event arriving late changes nothing.
//      A session belongs to whoever didit-session stored it for; for a session we never stored,
//      vendor_data (the user id we sent) must be an existing account, else it's ignored.
// Answers 200 once handled so Didit stops retrying; 500 on a database error so it retries.
// Only statuses are kept (minimalDecision), never personal details.
// Deploy with --no-verify-jwt (Didit sends no Supabase token; the signature is the check).
// Secrets: DIDIT_WEBHOOK_SECRET, plus the built-in SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY.
import { admin, json } from "../_shared/otp.ts";
import { isUuid, mapDiditStatus, minimalDecision, verifyDiditWebhook } from "../_shared/didit.ts";

const HANDLED_TYPES = new Set(["status.updated", "data.updated"]);

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const secret = Deno.env.get("DIDIT_WEBHOOK_SECRET") ?? "";
  if (!secret) {
    console.error("[didit-webhook] DIDIT_WEBHOOK_SECRET not set");
    return json({ error: "Not configured" }, 503);
  }

  try {
    const rawBody = new Uint8Array(await req.arrayBuffer());
    const ok = await verifyDiditWebhook({
      rawBody,
      signature: req.headers.get("x-signature"),
      signatureV2: req.headers.get("x-signature-v2"),
      timestamp: req.headers.get("x-timestamp"),
      secret,
      nowSec: Math.floor(Date.now() / 1000),
    });
    if (!ok) return json({ error: "Invalid signature" }, 401);

    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(new TextDecoder().decode(rawBody));
    } catch {
      return json({ error: "Invalid body" }, 400);
    }

    const type = typeof payload.webhook_type === "string" ? payload.webhook_type : "";
    if (!HANDLED_TYPES.has(type)) return json({ ignored: "type" });

    const sessionId = typeof payload.session_id === "string" ? payload.session_id : null;
    const status = mapDiditStatus(payload.status);
    if (!sessionId || !status) {
      console.log("[didit-webhook] ignored status:", payload.status);
      return json({ ignored: "status" });
    }

    // Didit's event time (seconds); fall back to now.
    const eventSec = typeof payload.timestamp === "number" ? payload.timestamp : Date.now() / 1000;
    const vendorUser = isUuid(payload.vendor_data) ? payload.vendor_data : null;

    const { data: result, error } = await admin().rpc("record_identity_verification", {
      p_session_id: sessionId,
      p_user_id: vendorUser,
      p_status: status,
      p_didit_status: typeof payload.status === "string" ? payload.status : null,
      p_decision: minimalDecision(payload),
      p_event_at: new Date(eventSec * 1000).toISOString(),
    });
    if (error) {
      console.error("[didit-webhook] save failed:", error);
      return json({ error: "Try again" }, 500);
    }
    if (result !== "saved") console.log("[didit-webhook]", result, "for session", sessionId);
    return json({ result });
  } catch (err) {
    console.error("[didit-webhook] error:", err);
    return json({ error: "Try again" }, 500);
  }
});
