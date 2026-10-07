/**
 * "Invite a mate" (owner, 2026-10-07), one flow for every place that offers it (the camera's
 * no-tag card, the empty "Your invites" list): a link with no tag behind it is made on tap, then
 * the phone's share sheet opens with it. Joining from it makes you follow each other.
 */
import { Share } from 'react-native';
import { makeMateInvite } from '@/api/tagSlots';
import { isSlotRefusal, mateInviteErrorText, mateInviteMessage } from '@/lib/tagSlots';
import { track } from '@/lib/analytics';
import { haptic } from '@/lib/haptics';
import { reportError } from '@/lib/sentry';
import { useToastStore } from '@/store/toastStore';

/** Opens the share sheet with a link. Says so when sharing couldn't open. */
export async function shareMateLink(url: string, action: string): Promise<void> {
  try {
    const result = await Share.share({ message: mateInviteMessage(url) });
    if (result.action === Share.sharedAction) track('invite_shared', {});
  } catch (e) {
    reportError(e, { flow: 'invites', action });
    useToastStore.getState().show('Couldn’t open sharing. Try again.');
  }
}

/** Make a link for a mate and share it. True when a link was made (whether or not it was sent). */
export async function inviteAMate(): Promise<boolean> {
  haptic('selection');
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
    return false;
  }
  await shareMateLink(data.url, 'shareMateInvite');
  return true;
}
