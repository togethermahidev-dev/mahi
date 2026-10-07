// delete-account — deletes the signed-in person's account for good (flag account-delete;
// Apple requires in-app deletion).
//
// No body. The caller is whoever the Authorization token belongs to (checked with the auth
// server, not just decoded). Steps:
//   1. remove their files: posts/{id}/* (post photos) and avatars/{id}/* (profile photo)
//   2. if they signed in with Apple and the app kept Apple's refresh token (apple-token), revoke
//      it at https://appleid.apple.com/auth/revoke (App Store guideline 5.1.1(v)). A failed or
//      impossible revoke is logged and reported back as `apple`, and never stops the deletion
//   3. delete their auth user with the admin API; ON DELETE CASCADE then removes the profile,
//      posts, likes, comments, tags, follows, chats and messages, notifications, push
//      tokens, points and invites (supabase/tests/account_delete_test.sql)
// If step 1 fails nothing else happens, so the app can simply try again.
// Deploy WITH JWT verification (the default). Secrets: the built-in SUPABASE_URL /
// SUPABASE_SERVICE_ROLE_KEY; for step 2 APPLE_TEAM_ID, APPLE_KEY_ID, APPLE_PRIVATE_KEY,
// APPLE_CLIENT_ID (optional) — when missing, a kept token can't be revoked (`apple: "not_configured"`).
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.117.2";
import { admin, bearerToken, json } from "../_shared/otp.ts";
import { APPLE_REVOKE_URL, appleConfig, clientSecret, postToApple, revokeForm, revokePlan } from "../_shared/apple.ts";

const BUCKETS = ["posts", "avatars"];
const PAGE = 1000;

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const token = bearerToken(req);
    if (!token) return json({ error: "Log in again, then try again." }, 401);
    const db = admin();

    const { data: auth, error: authError } = await db.auth.getUser(token);
    const userId = auth?.user?.id;
    if (authError || !userId) return json({ error: "Log in again, then try again." }, 401);

    for (const bucket of BUCKETS) {
      if (!(await removeFolder(db, bucket, userId))) {
        return json({ error: "Couldn't delete your photos. Please try again." }, 500);
      }
    }

    const apple = await revokeApple(db, userId);

    const { error } = await db.auth.admin.deleteUser(userId);
    if (error) {
      console.error("[delete-account] deleteUser failed:", error);
      return json({ error: "Couldn't delete your account. Please try again." }, 500);
    }
    return json({ deleted: true, apple });
  } catch (err) {
    console.error("[delete-account] error:", err);
    return json({ error: "Something went wrong. Please try again." }, 500);
  }
});

// Removes every file directly in {bucket}/{userId}/ (the app never makes deeper folders).
// Lists from the start each round because removed files drop out of the listing.
async function removeFolder(db: SupabaseClient, bucket: string, userId: string): Promise<boolean> {
  for (;;) {
    const { data: files, error } = await db.storage.from(bucket).list(userId, { limit: PAGE });
    if (error) {
      console.error(`[delete-account] list ${bucket} failed:`, error);
      return false;
    }
    const paths = (files ?? []).filter((f) => f.id).map((f) => `${userId}/${f.name}`);
    if (paths.length === 0) return true;
    const { error: removeError } = await db.storage.from(bucket).remove(paths);
    if (removeError) {
      console.error(`[delete-account] remove ${bucket} failed:`, removeError);
      return false;
    }
  }
}

// Revokes the kept Apple refresh token, if any. Never throws: the deletion goes ahead whatever
// happens, and the result ("revoked" | "skip" | "not_configured" | "failed") goes back to the app,
// which reports anything but revoked/skip. The row itself goes with the account (cascade).
async function revokeApple(db: SupabaseClient, userId: string): Promise<string> {
  try {
    const { data, error } = await db.from("apple_tokens").select("refresh_token").eq("user_id", userId)
      .maybeSingle();
    if (error) {
      console.error("[delete-account] apple_tokens read failed:", error.message);
      return "failed";
    }
    const cfg = appleConfig((k) => Deno.env.get(k));
    const refreshToken = (data?.refresh_token as string | undefined) ?? null;
    const plan = revokePlan({ refreshToken, configured: cfg !== null });
    if (plan === "not_configured") console.error("[delete-account] Apple secrets missing; token not revoked");
    if (plan !== "revoke" || !cfg || !refreshToken) return plan;

    const res = await postToApple(APPLE_REVOKE_URL, revokeForm(cfg, await clientSecret(cfg), refreshToken));
    if (res.ok) return "revoked";
    console.error("[delete-account] Apple revoke refused:", res.status, res.json.error ?? "");
    return "failed";
  } catch (err) {
    console.error("[delete-account] Apple revoke error:", err instanceof Error ? err.message : err);
    return "failed";
  }
}
