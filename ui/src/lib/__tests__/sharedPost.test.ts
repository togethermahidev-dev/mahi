import {
  messagePreviewText,
  messageWordsEditable,
  readSharedPost,
  sharedPostUnavailableText,
} from '@/lib/sharedPost';
import { messageHoldActions } from '@/lib/messageReactions';

describe('a post that can’t be shown', () => {
  it('says why, in the owner’s words', () => {
    expect(sharedPostUnavailableText('locked')).toBe('Post your Mahi to see this post.');
    expect(sharedPostUnavailableText('private')).toBe('This post is private.');
    expect(sharedPostUnavailableText('gone')).toBe('This post is no longer available.');
  });

  it('a photo that couldn’t be fetched is not called gone', () => {
    expect(sharedPostUnavailableText('error')).toBe('Couldn’t load this post.');
  });
});

describe('reading the post on a message', () => {
  it('no post: nothing (a plain message, or an older server)', () => {
    expect(readSharedPost(undefined)).toBeNull();
    expect(readSharedPost(null)).toBeNull();
    expect(readSharedPost('x')).toBeNull();
    expect(readSharedPost({})).toBeNull();
  });

  it('a post you can see keeps its feed item', () => {
    const item = { id: 'p1', image_path: 'u/p1_rear.jpg' };
    expect(readSharedPost({ id: 'p1', available: true, item })).toEqual({
      id: 'p1',
      available: true,
      item,
    });
  });

  it('a post you can’t see keeps its reason', () => {
    for (const reason of ['locked', 'private', 'gone'] as const) {
      expect(readSharedPost({ id: 'p1', available: false, reason })).toEqual({
        id: 'p1',
        available: false,
        reason,
      });
    }
  });

  it('a reason this update doesn’t know, or none, reads as gone', () => {
    expect(readSharedPost({ id: 'p1', available: false, reason: 'paused' })).toEqual({
      id: 'p1',
      available: false,
      reason: 'gone',
    });
    expect(readSharedPost({ id: 'p1', available: false })).toEqual({
      id: 'p1',
      available: false,
      reason: 'gone',
    });
  });

  it('"available" with no item reads as gone, never a crash', () => {
    expect(readSharedPost({ id: 'p1', available: true })).toEqual({
      id: 'p1',
      available: false,
      reason: 'gone',
    });
    expect(readSharedPost({ id: 'p1', available: true, item: null })).toEqual({
      id: 'p1',
      available: false,
      reason: 'gone',
    });
  });
});

describe('a post message in words (the inbox line, and a plain bubble with the switch off)', () => {
  it('a post with no note reads "Sent a post"', () => {
    expect(messagePreviewText({ content: '', post_id: 'p1' })).toBe('Sent a post');
  });

  it('a post with a note reads the note', () => {
    expect(messagePreviewText({ content: 'Look at this', post_id: 'p1' })).toBe('Look at this');
  });

  it('a plain message is its words', () => {
    expect(messagePreviewText({ content: 'hi' })).toBe('hi');
    expect(messagePreviewText({ content: 'hi', post_id: null })).toBe('hi');
  });
});

describe('holding a post message', () => {
  it('no note: nothing to edit', () => {
    expect(messageWordsEditable({ content: '', post_id: 'p1' })).toBe(false);
    expect(messageWordsEditable({ content: '   ', post_id: 'p1' })).toBe(false);
  });

  it('a note can be edited, as can a plain message', () => {
    expect(messageWordsEditable({ content: 'Look', post_id: 'p1' })).toBe(true);
    expect(messageWordsEditable({ content: 'hi' })).toBe(true);
  });

  it('Edit is left out of the menu, Unsend stays', () => {
    const post = { content: '', post_id: 'p1' };
    expect(messageHoldActions({ own: true, canEdit: true && messageWordsEditable(post) })).toEqual([
      'unsend',
    ]);
    const noted = { content: 'Look', post_id: 'p1' };
    expect(messageHoldActions({ own: true, canEdit: true && messageWordsEditable(noted) })).toEqual(
      ['edit', 'unsend']
    );
  });
});
