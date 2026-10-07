/**
 * Invite links API.
 *
 * An invite fills a tag slot with someone who isn't on Mahi yet. The link and its 6-character
 * code both point at the same invite, and `claim_invite` takes either. Claiming is what starts
 * the 48-hour clock, so it only ever works for an account made in the last day — the server
 * decides that, not the app.
 */

import { supabase } from '@/lib/supabase';
import type { InviteVia, MyInvite } from '@/lib/myInvites';

/** Who sent an invite — shown on the sign-up screen before anyone is signed in. */
export type InvitePreview = {
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  /** Still unclaimed and not expired. */
  open: boolean;
  /** A tag comes with it (false: an invite for a mate). Missing from an older server. */
  tag?: boolean;
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
  /** A tag came with it (false: an invite for a mate). Missing from an older server. */
  tag?: boolean;
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
  if (error) return { data: null, error: new Error(error.message, { cause: error }) };
  return { data: (data as unknown as InvitePreview | null) ?? null, error: null };
}

/** Take the invite: follow each other, and start the tag's 48 hours. */
export async function claimInvite(
  token: string
): Promise<{ data: InviteClaim | null; error: Error | null }> {
  const { data, error } = await supabase.rpc('claim_invite', { p_token: token });
  if (error) return { data: null, error: new Error(error.message, { cause: error }) };
  return { data: data as unknown as InviteClaim, error: null };
}

/** What `resend_invite` and `cancel_invite` hand back: the link as the list now shows it. */
export type ResendResult = { resent: boolean; reason: string | null; invite: MyInvite };
export type CancelResult = { cancelled: boolean; invite: MyInvite };

/** Your invite links from the last 30 days, newest first (server: 20261007210000_my_invites). */
export async function getMyInvites(): Promise<{ data: MyInvite[] | null; error: Error | null }> {
  const { data, error } = await supabase.rpc('get_my_invites');
  if (error) return { data: null, error: new Error(error.message, { cause: error }) };
  return { data: (data ?? []) as unknown as MyInvite[], error: null };
}

/** Send a link again: once a day, at most 3 times. Too soon is not an error: `resent` is false. */
export async function resendInvite(
  token: string
): Promise<{ data: ResendResult | null; error: Error | null }> {
  const { data, error } = await supabase.rpc('resend_invite', { p_token: token });
  if (error) return { data: null, error: new Error(error.message, { cause: error }) };
  return { data: data as unknown as ResendResult, error: null };
}

/** Stop a link nobody has used from working. Cancelling twice gives the same answer. */
export async function cancelInvite(
  token: string
): Promise<{ data: CancelResult | null; error: Error | null }> {
  const { data, error } = await supabase.rpc('cancel_invite', { p_token: token });
  if (error) return { data: null, error: new Error(error.message, { cause: error }) };
  return { data: data as unknown as CancelResult, error: null };
}

/**
 * Say a link went out, and where: how, and to whom when known (server:
 * 20261007290000_invite_sent_to). Your own links only; the same call twice changes nothing more,
 * and it never counts as a resend.
 */
/**
 * Take back a link for a mate that never went anywhere (the share sheet was closed): it is deleted,
 * so it doesn't show in "Your invites" nor count towards the open-invite cap. False when it had
 * already gone out, or isn't yours.
 */
export async function discardUnsentInvite(
  token: string
): Promise<{ discarded: boolean; error: Error | null }> {
  const { data, error } = await supabase.rpc('discard_unsent_invite', { p_token: token });
  return {
    discarded: data === true,
    error: error ? new Error(error.message, { cause: error }) : null,
  };
}

export async function recordInviteSent(
  token: string,
  via: InviteVia,
  toName: string | null = null,
  toPhone: string | null = null
): Promise<{ error: Error | null }> {
  const { error } = await supabase.rpc('record_invite_sent', {
    p_token: token,
    p_via: via,
    p_to_name: toName,
    p_to_phone: toPhone,
  });
  return { error: error ? new Error(error.message, { cause: error }) : null };
}
