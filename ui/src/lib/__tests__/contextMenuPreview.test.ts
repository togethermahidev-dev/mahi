import {
  contextMenuAvailable,
  gridMenuItems,
  messagesMenuItems,
  postMenuItems,
  menuA11yActions,
  isMenuAction,
  previewMessages,
  previewStill,
  shareTarget,
  previewSize,
  PREVIEW_MESSAGE_COUNT,
} from '../contextMenuPreview';

const labels = (items: { label: string }[]) => items.map((i) => i.label);

describe('contextMenuAvailable — iPhone, build 11 (the native module) and the flag', () => {
  it('is on only on iOS, with the native module, with the flag on', () => {
    expect(contextMenuAvailable({ platform: 'ios', nativeModulePresent: true, flagOn: true })).toBe(
      true
    );
  });

  // Build 10 gets OTA updates too but has no @expo/ui native module: it must behave as flag off.
  it('is off on a build without the native module, even with the flag on', () => {
    expect(
      contextMenuAvailable({ platform: 'ios', nativeModulePresent: false, flagOn: true })
    ).toBe(false);
  });

  it('is off on Android', () => {
    expect(
      contextMenuAvailable({ platform: 'android', nativeModulePresent: true, flagOn: true })
    ).toBe(false);
  });

  it('is off when the flag is off', () => {
    expect(
      contextMenuAvailable({ platform: 'ios', nativeModulePresent: true, flagOn: false })
    ).toBe(false);
  });
});

describe('gridMenuItems — a profile grid square: Open, Like / Unlike, Share', () => {
  it('a post you have not liked', () => {
    expect(labels(gridMenuItems({ liked: false, canShare: true }))).toEqual([
      'Open',
      'Like',
      'Share',
    ]);
  });

  it('a post you liked offers Unlike', () => {
    const items = gridMenuItems({ liked: true, canShare: true });
    expect(labels(items)).toEqual(['Open', 'Unlike', 'Share']);
    expect(items[1].action).toBe('unlike');
  });

  it('no Share when there is nothing to send', () => {
    expect(labels(gridMenuItems({ liked: false, canShare: false }))).toEqual(['Open', 'Like']);
  });
});

describe('messagesMenuItems — a chat row: Open, and Mark as read while it is unread', () => {
  it('an unread chat', () => {
    const items = messagesMenuItems({ unread: true });
    expect(labels(items)).toEqual(['Open', 'Mark as read']);
    expect(items[1].action).toBe('mark-read');
  });

  it('a read chat has nothing to mark', () => {
    expect(labels(messagesMenuItems({ unread: false }))).toEqual(['Open']);
  });

  // No mute on the server today: the menu must not offer one.
  it('never offers mute', () => {
    for (const unread of [true, false]) {
      expect(labels(messagesMenuItems({ unread })).join(' ')).not.toMatch(/mute/i);
    }
  });
});

describe('postMenuItems — a feed post: Like / Unlike, Comment, Share, View profile', () => {
  it('a post you have not liked', () => {
    expect(labels(postMenuItems({ liked: false, canShare: true }))).toEqual([
      'Like',
      'Comment',
      'Share',
      'View profile',
    ]);
  });

  it('a liked post offers Unlike', () => {
    expect(labels(postMenuItems({ liked: true, canShare: true }))[0]).toBe('Unlike');
  });

  it('no Share when there is nothing to send', () => {
    expect(labels(postMenuItems({ liked: false, canShare: false }))).toEqual([
      'Like',
      'Comment',
      'View profile',
    ]);
  });
});

describe('menu wording', () => {
  it('every label is sentence case and every item has an Apple icon name', () => {
    const all = [
      ...gridMenuItems({ liked: false, canShare: true }),
      ...gridMenuItems({ liked: true, canShare: true }),
      ...messagesMenuItems({ unread: true }),
      ...postMenuItems({ liked: false, canShare: true }),
    ];
    for (const item of all) {
      expect(item.label).not.toBe(item.label.toUpperCase());
      expect(item.label.slice(1)).toBe(item.label.slice(1).toLowerCase());
      expect(item.systemImage.length).toBeGreaterThan(0);
    }
  });
});

describe('menuA11yActions — the same choices for VoiceOver', () => {
  it('lists each item as a named action, leaving out the ones a tap already does', () => {
    const items = gridMenuItems({ liked: false, canShare: true });
    expect(menuA11yActions(items, ['open'])).toEqual([
      { name: 'like', label: 'Like' },
      { name: 'share', label: 'Share' },
    ]);
  });

  it('keeps everything when nothing is skipped', () => {
    expect(menuA11yActions(messagesMenuItems({ unread: true }))).toEqual([
      { name: 'open', label: 'Open' },
      { name: 'mark-read', label: 'Mark as read' },
    ]);
  });

  it('isMenuAction tells our actions from VoiceOver’s own (activate, escape…)', () => {
    expect(isMenuAction('like')).toBe(true);
    expect(isMenuAction('mark-read')).toBe(true);
    expect(isMenuAction('activate')).toBe(false);
    expect(isMenuAction('magicTap')).toBe(false);
  });
});

describe('previewMessages — the latest messages in a chat, oldest first', () => {
  const msgs = Array.from({ length: 20 }, (_, i) => ({ id: `m${i}` }));

  it('keeps the newest few, still oldest first', () => {
    const out = previewMessages(msgs);
    expect(out).toHaveLength(PREVIEW_MESSAGE_COUNT);
    expect(out[out.length - 1].id).toBe('m19');
    expect(out[0].id).toBe(`m${20 - PREVIEW_MESSAGE_COUNT}`);
  });

  it('a short chat shows everything', () => {
    expect(previewMessages(msgs.slice(0, 2))).toEqual([{ id: 'm0' }, { id: 'm1' }]);
    expect(previewMessages([])).toEqual([]);
  });
});

describe('previewStill — the photo a preview shows', () => {
  it('the shot on screen when it is a photo', () => {
    expect(
      previewStill([
        { uri: 'a', kind: 'photo' },
        { uri: 'b', kind: 'photo' },
      ])
    ).toBe('a');
  });

  it('skips a video to the other shot’s photo', () => {
    expect(
      previewStill([
        { uri: 'a', kind: 'video' },
        { uri: 'b', kind: 'photo' },
      ])
    ).toBe('b');
  });

  it('two videos or no photo: nothing', () => {
    expect(
      previewStill([
        { uri: 'a', kind: 'video' },
        { uri: 'b', kind: 'video' },
      ])
    ).toBeNull();
    expect(
      previewStill([
        { uri: '', kind: 'photo' },
        { uri: null, kind: 'photo' },
      ])
    ).toBeNull();
  });
});

describe('shareTarget — what Share sends', () => {
  const post = {
    image_url: 'https://x/signed/rear?token=1',
    pov_image_url: 'https://x/signed/pov?token=2',
    image_path: 'u/c_rear.jpg',
    pov_image_path: 'u/c_pov.jpg',
  };

  it('the main photo', () => {
    expect(shareTarget(post)).toEqual({ uri: post.image_url, ext: 'jpg', local: false });
  });

  it('the selfie when the main shot is a video', () => {
    expect(
      shareTarget({
        ...post,
        image_path: 'u/c_rear.mov',
        rear_media_type: 'video',
        front_media_type: 'photo',
      })
    ).toEqual({ uri: post.pov_image_url, ext: 'jpg', local: false });
  });

  it('two videos: the main video, with its own file type', () => {
    expect(
      shareTarget({
        ...post,
        image_path: 'u/c_rear.mov',
        pov_image_path: 'u/c_pov.mov',
        rear_media_type: 'video',
        front_media_type: 'video',
      })
    ).toEqual({ uri: post.image_url, ext: 'mov', local: false });
    expect(
      shareTarget({
        ...post,
        image_path: 'u/c_rear.mp4',
        rear_media_type: 'video',
        front_media_type: 'video',
      })
    ).toMatchObject({ ext: 'mp4' });
  });

  it('a post still uploading shares the file on the phone as it is', () => {
    expect(shareTarget({ ...post, image_url: 'file:///cache/a.jpg' })).toEqual({
      uri: 'file:///cache/a.jpg',
      ext: 'jpg',
      local: true,
    });
  });

  it('a locked post (no links) has nothing to share', () => {
    expect(
      shareTarget({ image_url: '', pov_image_url: null, image_path: null, pov_image_path: null })
    ).toBeNull();
  });
});

describe('previewSize — the pop-up fits on the screen', () => {
  const phone = { width: 390, height: 844 };

  it('a post is a portrait photo narrower than the screen', () => {
    const s = previewSize(phone, 'post');
    expect(s.width).toBeLessThan(phone.width);
    expect(s.height).toBeGreaterThan(s.width);
    // Room is left below for the menu.
    expect(s.height).toBeLessThan(phone.height * 0.7);
  });

  it('a short, wide screen still fits the post', () => {
    const s = previewSize({ width: 1024, height: 700 }, 'post');
    expect(s.height).toBeLessThan(700 * 0.7);
    expect(s.width).toBeLessThan(1024);
  });

  it('a chat is narrower than the screen and leaves room for the menu', () => {
    const s = previewSize(phone, 'chat');
    expect(s.width).toBeLessThan(phone.width);
    expect(s.height).toBeLessThan(phone.height * 0.7);
  });

  it('whole points only', () => {
    for (const kind of ['post', 'chat'] as const) {
      const s = previewSize({ width: 393, height: 852 }, kind);
      expect(Number.isInteger(s.width)).toBe(true);
      expect(Number.isInteger(s.height)).toBe(true);
    }
  });
});
