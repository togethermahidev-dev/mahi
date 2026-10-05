// delete-account — deletes the signed-in person's account for good (flag account-delete;
// Apple requires in-app deletion).
//
// No body. The caller is whoever the Authorization token belongs to (checked with the auth
// server, not just decoded). Steps:
//   1. remove their files: posts/{id}/* (post photos) and avatars/{id}/* (profile photo)
//   2. delete their auth user with the admin API; ON DELETE CASCADE then removes the profile,
//      posts, likes, comments, tags, follows, chats and messages, notifications, push
//      tokens, points and invites (supabase/tests/account_delete_test.sql)
// If step 1 fails nothing else happens, so the app can simply try again.
// Deploy WITH JWT verification (the default). Secrets: the built-in SUPABASE_URL /
// SUPABASE_SERVICE_ROLE_KEY.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.117.2";
import { admin, bearerToken, json } from "../_shared/otp.ts";

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

    const { error } = await db.auth.admin.deleteUser(userId);
    if (error) {
      console.error("[delete-account] deleteUser failed:", error);
      return json({ error: "Couldn't delete your account. Please try again." }, 500);
    }
    return json({ deleted: true });
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
