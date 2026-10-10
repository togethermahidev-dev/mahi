/**
 * "Invite a friend" (owner, 2026-10-07; "mate" became "friend" on 2026-10-10, the names in the
 * code stay), one flow for every place that offers it (your profile's round button, the camera's
 * no-tag card, the empty "Your invites" list): a link with no tag behind it is made on tap, then
 * the phone's share sheet opens with it. Joining from it makes you follow each other.
 *
 * Every place a link is sent from says where it went once it really went (`noteInviteSent`), so
 * "Your invites" can say who and how ("Sent to Sam", "Shared on WhatsApp").
 */
import { Linking, Platform, Share } from 'react-native';
import { makeMateInvite, type MateInvite } from '@/api/tagSlots';
import { discardUnsentInvite, recordInviteSent } from '@/api/invites';
import { isSlotRefusal, mateInviteErrorText, mateInviteMessage, shareAppUrl } from '@/lib/tagSlots';
import { smsInviteUrl } from '@/lib/contactMatch';
import { copyLink } from '@/lib/copyLink';
import type { ShareSheetTarget } from '@/lib/shareSheet';
import type { InviteVia, ResendPlace } from '@/lib/myInvites';
import { track } from '@/lib/analytics';
import { haptic } from '@/lib/haptics';
import { reportError } from '@/lib/sentry';
import { useToastStore } from '@/store/toastStore';

/** The longest name the server keeps with a link. */
const MAX_NAME = 60;

/**
 * A link went out: tell the server how, and to whom when known. Runs in the background: the
 * share already happened, so a failure is reported and nothing is shown.
 */
export function noteInviteSent(
  token: string | null | undefined,
  via: InviteVia,
  toName: string | null = null,
  toPhone: string | null = null
): void {
  if (!token) return;
  // A contact with no name is listed by its number: that's not a name.
  const name = toName && !/^[+0-9()\s.-]+$/.test(toName) ? toName.trim().slice(0, MAX_NAME) : null;
  void recordInviteSent(token, via, name, toPhone).then(({ error }) => {
    if (error) {
      reportError(error, {
        flow: 'invites',
        action: 'recordInviteSent',
        level: 'warning',
        extra: { rpc: 'record_invite_sent', via },
      });
    }
  });
}

/** Opens the share sheet with a link. True when it went somewhere. Says so when sharing couldn't open. */
export async function shareMateLink(link: MateInvite, action: string): Promise<boolean> {
  try {
    const result = await Share.share({ message: mateInviteMessage(link.url) });
    if (result.action !== Share.sharedAction) return false;
    track('invite_shared', { via: 'more' });
    noteInviteSent(link.token, 'share');
    return true;
  } catch (e) {
    reportError(e, { flow: 'invites', action });
    useToastStore.getState().show('Couldn’t open sharing. Try again.');
    return false;
  }
}

/**
 * Send a link again to the same place it went before: WhatsApp, a text (to the same number when
 * known), or the share sheet. WhatsApp or Messages missing on this phone: the share sheet instead.
 * True when it went somewhere; the send is recorded the way it actually went.
 */
export async function sendLinkTo(
  link: MateInvite,
  place: ResendPlace,
  action: string
): Promise<boolean> {
  const message = mateInviteMessage(link.url);
  const platform = Platform.OS === 'ios' ? 'ios' : 'android';
  if (place.open !== 'share') {
    const url =
      place.open === 'whatsapp'
        ? shareAppUrl('whatsapp', message, platform)
        : place.toPhone
          ? smsInviteUrl(place.toPhone, message, platform)
          : shareAppUrl('messages', message, platform);
    try {
      await Linking.openURL(url);
      track('invite_shared', { via: place.open === 'whatsapp' ? 'whatsapp' : 'messages' });
      noteInviteSent(link.token, place.via, place.toName, place.toPhone);
      return true;
    } catch {
      // The app isn't on this phone: the share sheet below.
    }
  }
  return shareMateLink(link, action);
}

/**
 * One round button on the share sheet, for an invite link. Copy link copies it; WhatsApp and
 * Messages open with the invite already written (the share sheet when that app isn't on the
 * phone); Snapchat, Instagram and "Share to…" open the phone's share sheet (decision #156). True
 * when the link went somewhere; where it went is recorded for "Your invites".
 */
export async function sendMateLinkVia(
  link: MateInvite,
  target: ShareSheetTarget
): Promise<boolean> {
  const action = 'shareMateInvite';
  if (target === 'copy') {
    const copied = copyLink(link.url);
    if (copied) {
      track('invite_shared', { via: 'copy' });
      noteInviteSent(link.token, 'copy');
    }
    useToastStore.getState().show(copied ? 'Link copied' : 'Couldn’t copy the link. Try again.');
    return copied;
  }
  const none = { toName: null, toPhone: null };
  if (target === 'whatsapp') {
    return sendLinkTo(link, { open: 'whatsapp', via: 'whatsapp', ...none }, action);
  }
  if (target === 'messages') {
    return sendLinkTo(link, { open: 'sms', via: 'messages', ...none }, action);
  }
  return shareMateLink(link, action);
}

/**
 * A link made on tap that never went anywhere (the share sheet or the messages app was closed or
 * couldn't open) is taken back on the server, so no "Waiting" invite appears that nobody got
 * (owner, 2026-10-07). Runs in the background; a failure is reported and nothing is shown.
 * Android's share sheet always says it shared, so there the link stays.
 */
export function discardUnsentLink(token: string | null | undefined): void {
  if (!token) return;
  void discardUnsentInvite(token).then(({ error }) => {
    if (error) {
      reportError(error, {
        flow: 'invites',
        action: 'discardUnsentInvite',
        level: 'warning',
        extra: { rpc: 'discard_unsent_invite' },
      });
    }
  });
}

/** Make a link for a mate and share it. True only when it went somewhere. */
export async function inviteAMate(): Promise<boolean> {
  haptic('selection');
  const link = await makeMateLink();
  if (!link) return false;
  const sent = await shareMateLink(link, 'shareMateInvite');
  if (!sent) discardUnsentLink(link.token);
  return sent;
}

/** Make a link for a mate (no tag behind it). Null, with a toast saying why, when it couldn't. */
export async function makeMateLink(): Promise<MateInvite | null> {
  const { data, error } = await makeMateInvite();
  if (error || !data) {
    const message = error?.message ?? '';
    if (!isSlotRefusal(message)) {
      reportError(error ?? new Error('make_mate_invite returned no data'), {
        flow: 'invites',
        action: 'makeMateInvite',
        extra: { rpc: 'make_mate_invite' },
      });
    }
    useToastStore.getState().show(mateInviteErrorText(message));
    return null;
  }
  return data;
}
