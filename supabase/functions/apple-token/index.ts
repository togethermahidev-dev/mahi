// apple-token — keeps Apple's refresh token for a Sign in with Apple account, so deleting the
// account later can revoke the app's access with Apple (App Store guideline 5.1.1(v)).
//
// Body: { code } — the one-time authorizationCode Apple gave the app at sign-in (valid 5 minutes).
// The caller is whoever the Authorization token belongs to (checked with the auth server) and
// must be an Apple account. The code is swapped at https://appleid.apple.com/auth/token for a
// refresh token, which goes in public.apple_tokens (server-only; migration 20261007300000).
// The app never waits on this: any failure is reported there as a warning and sign-in carries on.
// Deploy WITH JWT verification (the default). Secrets: APPLE_TEAM_ID, APPLE_KEY_ID,
// APPLE_PRIVATE_KEY, APPLE_CLIENT_ID (optional); missing → 503.
import { admin, bearerToken, json } from "../_shared/otp.ts";
import { APPLE_TOKEN_URL, appleConfig, clientSecret, postToApple, tokenForm } from "../_shared/apple.ts";

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const token = bearerToken(req);
    if (!token) return json({ error: "Log in again, then try again." }, 401);

    const cfg = appleConfig((k) => Deno.env.get(k));
    if (!cfg) return json({ error: "Apple sign-in is not set up on the server yet." }, 503);

    const body = (await req.json().catch(() => ({}))) as { code?: unknown };
    const code = typeof body.code === "string" ? body.code.trim() : "";
    if (!code) return json({ error: "Missing Apple code." }, 400);

    const db = admin();
    const { data: auth, error: authError } = await db.auth.getUser(token);
    const user = auth?.user;
    if (authError || !user) return json({ error: "Log in again, then try again." }, 401);
    const providers = (user.app_metadata?.providers as string[] | undefined) ?? [];
    if (user.app_metadata?.provider !== "apple" && !providers.includes("apple")) {
      return json({ error: "Not an Apple account." }, 403);
    }

    const apple = await postToApple(APPLE_TOKEN_URL, tokenForm(cfg, await clientSecret(cfg), code));
    const refreshToken = typeof apple.json.refresh_token === "string" ? apple.json.refresh_token : "";
    if (!apple.ok || !refreshToken) {
      // Apple's error code only (e.g. invalid_grant); never the secret or the code.
      console.error("[apple-token] Apple refused the code:", apple.status, apple.json.error ?? "");
      return json({ error: "Apple refused the code." }, 502);
    }

    const { error } = await db
      .from("apple_tokens")
      .upsert({ user_id: user.id, refresh_token: refreshToken, updated_at: new Date().toISOString() });
    if (error) {
      console.error("[apple-token] save failed:", error.message);
      return json({ error: "Couldn't save the Apple token." }, 500);
    }
    return json({ saved: true });
  } catch (err) {
    console.error("[apple-token] error:", err instanceof Error ? err.message : err);
    return json({ error: "Something went wrong." }, 500);
  }
});
