/**
 * Sharing a post outside Mahi. `sharePost` sends the post's photo itself (see `shareTarget`) and
 * its link through the iPhone share sheet: the share sheet's "Share to…", and Share itself while
 * the `share-sheet` switch is off. Post links expire within the hour, so the file is fetched to
 * the phone's cache only for the share sheet and deleted as soon as it closes.
 * `sharePostTo` is one round button on Mahi's share sheet.
 */
import { Linking, Platform, Share } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { shareTarget } from '@/lib/contextMenuPreview';
import { useToastStore } from '@/store/toastStore';
import { postShareMessage, postShareUrl } from '@/lib/postShareLink';
import { copyLink } from '@/lib/copyLink';
import { shareAppUrl } from '@/lib/tagSlots';
import type { ShareSheetTarget } from '@/lib/shareSheet';
import { track } from '@/lib/analytics';
import { reportError } from '@/lib/sentry';
import type { FeedPost } from '@/api';

/**
 * One round button on the share sheet, for a post. Copy link copies it; WhatsApp and Messages open
 * with the words and link already written; Snapchat, Instagram and "Share to…" open the phone's
 * share sheet with the photo and link (no Snap or IG kit in this build, decision #156), as does
 * WhatsApp or Messages when that app isn't on the phone. True when it went somewhere for sure
 * (the sheet can close); the phone's own sheet doesn't say, so that reads false.
 */
export async function sharePostTo(post: FeedPost, target: ShareSheetTarget): Promise<boolean> {
  if (target === 'copy') {
    const copied = copyLink(postShareUrl(post.id));
    if (copied) track('post_shared', { post_id: post.id, friends: 0, via: target });
    useToastStore.getState().show(copied ? 'Link copied' : 'Couldn’t copy the link. Try again.');
    return copied;
  }
  track('post_shared', { post_id: post.id, friends: 0, via: target });
  if (target === 'whatsapp' || target === 'messages') {
    try {
      const platform = Platform.OS === 'ios' ? 'ios' : 'android';
      await Linking.openURL(shareAppUrl(target, postShareMessage(post), platform));
      return true;
    } catch {
      // The app isn't on this phone: the phone's own sheet below.
    }
  }
  await sharePost(post);
  return false;
}

export async function sharePost(post: FeedPost): Promise<void> {
  const target = shareTarget(post);
  if (!target) return;
  let temp: string | null = null;
  try {
    let url = target.uri;
    if (!target.local) {
      if (!FileSystem.cacheDirectory) throw new Error('no cache directory');
      temp = `${FileSystem.cacheDirectory}share-${post.id}.${target.ext}`;
      const download = await FileSystem.downloadAsync(target.uri, temp);
      if (download.status !== 200) throw new Error(`download ${download.status}`);
      url = download.uri;
    }
    await Share.share({
      url,
      message: postShareMessage(post),
    });
  } catch (e) {
    reportError(e, {
      flow: 'share',
      action: 'sharePost',
      extra: { postId: post.id, ext: target.ext, local: target.local },
    });
    useToastStore.getState().show('Couldn’t open sharing. Try again.');
  } finally {
    if (temp) FileSystem.deleteAsync(temp, { idempotent: true }).catch(() => {});
  }
}
