/**
 * "Invite a mate" (owner, 2026-10-07), one flow for every place that offers it (the camera's
 * no-tag card, the empty "Your invites" list): a link with no tag behind it is made on tap, then
 * the phone's share sheet opens with it. Joining from it makes you follow each other.
 *
 * Every place a link is sent from says where it went once it really went (`noteInviteSent`), so
 * "Your invites" can say who and how ("Sent to Sam", "Shared on WhatsApp").
 */
import { Linking, Platform, Share } from 'react-native';
import { makeMateInvite, type MateInvite } from '@/api/tagSlots';
import { recordInviteSent } from '@/api/invites';
import { isSlotRefusal, mateInviteErrorText, mateInviteMessage, shareAppUrl } from '@/lib/tagSlots';
import { smsInviteUrl } from '@/lib/contactMatch';
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

/** Make a link for a mate and share it. True when a link was made (whether or not it was sent). */
export async function inviteAMate(): Promise<boolean> {
  haptic('selection');
  const link = await makeMateLink();
  if (!link) return false;
  await shareMateLink(link, 'shareMateInvite');
  return true;
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
