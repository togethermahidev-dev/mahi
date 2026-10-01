/**
 * Invite links API.
 *
 * An invite fills a tag slot with someone who isn't on Mahi yet. The link and its 6-character
 * code both point at the same invite, and `claim_invite` takes either. Claiming is what starts
 * the 48-hour clock, so it only ever works for an account made in the last day — the server
 * decides that, not the app.
 */

import { supabase } from '@/lib/supabase';

/** Who sent an invite — shown on the sign-up screen before anyone is signed in. */
export type InvitePreview = {
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  /** Still unclaimed and not expired. */
  open: boolean;
};

export type InviteClaim = {
  claimed: boolean;
  inviter: {
    id: string;
    username: string;
    display_name: string | null;
    avatar_url: string | null;
  };
  /** When the tag this invite carried runs out. */
  expires_at: string | null;
  server_now: string;
};

/** One link, as `create_post` hands it back for the share sheet. */
export type PostInvite = {
  token: string;
  code: string;
  url: string;
  claimed: boolean;
};

/** Who sent this invite. Null for an unknown, used or expired-beyond-recognition token. */
export async function getInvitePreview(
  token: string
): Promise<{ data: InvitePreview | null; error: Error | null }> {
  const { data, error } = await supabase.rpc('get_invite_preview', { p_token: token });
  if (error) return { data: null, error: new Error(error.message) };
  return { data: (data as unknown as InvitePreview | null) ?? null, error: null };
}

/** Take the invite: follow each other, and start the tag's 48 hours. */
export async function claimInvite(
  token: string
): Promise<{ data: InviteClaim | null; error: Error | null }> {
  const { data, error } = await supabase.rpc('claim_invite', { p_token: token });
  if (error) return { data: null, error: new Error(error.message) };
  return { data: data as unknown as InviteClaim, error: null };
}
