/**
 * Share from the hold-to-preview menu: sends the post's photo itself (see `shareTarget`) through
 * the iPhone share sheet. Post links expire within the hour, so the file is fetched to the
 * phone's cache only for the share sheet and deleted as soon as it closes.
 */
import { Share } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { shareTarget } from '@/lib/contextMenuPreview';
import { useToastStore } from '@/store/toastStore';
import { postShareMessage } from '@/lib/postShareLink';
import type { FeedPost } from '@/api';

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
  } catch {
    useToastStore.getState().show('Couldn’t open sharing. Try again.');
  } finally {
    if (temp) FileSystem.deleteAsync(temp, { idempotent: true }).catch(() => {});
  }
}
