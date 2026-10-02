// didit-session — starts a Didit identity check for the signed-in person (app flag
// identity-verification). NOT deployed yet.
//
// No body. The caller is whoever the Authorization token belongs to (checked with the auth
// server, not just decoded). Steps:
//   1. already approved → { alreadyApproved: true } (no new paid session)
//   2. more than MAX_SESSIONS_PER_DAY sessions in 24 hours → 429
//   3. POST https://verification.didit.me/v3/session/ with x-api-key, the workflow and
//      vendor_data = the user id
//   4. store a 'pending' row (record_identity_verification, event time epoch, so every webhook
//      overrides it) and return { alreadyApproved: false, sessionId, sessionToken }
// The app opens Didit's native screens with the token. The result arrives at didit-webhook.
// Deploy WITH JWT verification (the default). Secrets: DIDIT_API_KEY, DIDIT_WORKFLOW_ID, plus the
// built-in SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY.
import { admin, bearerToken, json } from "../_shared/otp.ts";
import { DIDIT_SESSION_URL, MAX_SESSIONS_PER_DAY, sessionRequestBody } from "../_shared/didit.ts";

const TRY_AGAIN = "Couldn't start the identity check. Please try again.";

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const apiKey = Deno.env.get("DIDIT_API_KEY");
  const workflowId = Deno.env.get("DIDIT_WORKFLOW_ID");
  if (!apiKey || !workflowId) {
    console.error("[didit-session] DIDIT_API_KEY or DIDIT_WORKFLOW_ID not set");
    return json({ error: "Identity checks aren't available yet." }, 503);
  }

  try {
    const token = bearerToken(req);
    if (!token) return json({ error: "Log in again, then try again." }, 401);
    const db = admin();

    const { data: auth, error: authError } = await db.auth.getUser(token);
    const userId = auth?.user?.id;
    if (authError || !userId) return json({ error: "Log in again, then try again." }, 401);

    const { data: rows, error: readError } = await db
      .from("identity_verifications")
      .select("status, created_at")
      .eq("user_id", userId);
    if (readError) {
      console.error("[didit-session] read failed:", readError);
      return json({ error: TRY_AGAIN }, 500);
    }
    if ((rows ?? []).some((r) => r.status === "approved")) return json({ alreadyApproved: true });

    const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
    const recent = (rows ?? []).filter((r) => new Date(r.created_at).getTime() > dayAgo).length;
    if (recent >= MAX_SESSIONS_PER_DAY) {
      return json({ error: "Too many tries today. Please try again tomorrow." }, 429);
    }

    const res = await fetch(DIDIT_SESSION_URL, {
      method: "POST",
      headers: { "x-api-key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify(sessionRequestBody(workflowId, userId)),
    });
    if (!res.ok) {
      console.error("[didit-session] Didit refused:", res.status, await res.text().catch(() => ""));
      return json({ error: TRY_AGAIN }, 502);
    }
    const session = (await res.json()) as { session_id?: string; session_token?: string };
    if (!session.session_id || !session.session_token) {
      console.error("[didit-session] Didit answer without session_id / session_token");
      return json({ error: TRY_AGAIN }, 502);
    }

    const { data: saved, error: saveError } = await db.rpc("record_identity_verification", {
      p_session_id: session.session_id,
      p_user_id: userId,
      p_status: "pending",
      p_didit_status: "Not Started",
      p_decision: {},
      p_event_at: new Date(0).toISOString(),
    });
    if (saveError || saved !== "saved") {
      console.error("[didit-session] save failed:", saveError ?? saved);
      return json({ error: TRY_AGAIN }, 500);
    }

    return json({
      alreadyApproved: false,
      sessionId: session.session_id,
      sessionToken: session.session_token,
    });
  } catch (err) {
    console.error("[didit-session] error:", err);
    return json({ error: "Something went wrong. Please try again." }, 500);
  }
});
