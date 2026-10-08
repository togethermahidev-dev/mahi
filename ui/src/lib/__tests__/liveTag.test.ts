import {
  LIVE_TAG_URL,
  isCameraLink,
  liveActivityAction,
  liveActivityStaleAt,
  liveTagView,
  nextLiveTagChange,
  offView,
  openTagsAt,
  soonestTagId,
  staleTaggerPhotos,
  taggerPhotoFile,
  widgetTimeline,
} from '../liveTag';
import { COLORS } from '@/constants/tokens';

const HOUR = 3600 * 1000;
const MIN = 60 * 1000;
const deviceNow = Date.parse('2026-10-07T12:00:00.000Z');
const iso = (ms: number) => new Date(ms).toISOString();
/** A tag that a mate sent `ago` before now and that ends `left` from now (server = device clock). */
const tag = (id: string, username: string, left: number, ago = HOUR) => ({
  challenge_id: id,
  username,
  created_at: iso(deviceNow - ago),
  expires_at: iso(deviceNow + left),
});

describe('openTagsAt — which tags are still open', () => {
  it('leaves out tags whose time is up and puts the soonest first', () => {
    const tags = [tag('a', 'amy', 30 * HOUR), tag('b', 'ben', -MIN), tag('c', 'cat', 2 * HOUR)];
    expect(openTagsAt(tags, 0, deviceNow).map((t) => t.username)).toEqual(['cat', 'amy']);
  });

  it('reads deadlines on the server clock', () => {
    // The server is 10 minutes ahead of the phone: a tag 5 phone-minutes from its end is over.
    const tags = [tag('a', 'amy', 5 * MIN)];
    expect(openTagsAt(tags, 10 * MIN, deviceNow)).toEqual([]);
    expect(soonestTagId(tags, 10 * MIN, deviceNow)).toBeNull();
  });
});

describe('liveTagView — what the Live Activity and widget show', () => {
  it('names the friend, counts down to the deadline and says any workout answers it', () => {
    const v = liveTagView({
      tags: [tag('a', 'sam', 30 * HOUR)],
      serverOffsetMs: 0,
      deviceNow,
      points: 4,
      best: 9,
    });
    expect(v).toMatchObject({
      kind: 'tag',
      title: '@sam is waiting on you',
      line: 'Answer with any workout',
      more: null,
      deadline: deviceNow + 30 * HOUR,
      start: deviceNow - HOUR,
      warning: false,
    });
  });

  it('shows the soonest of several tags and how many more are waiting', () => {
    const v = liveTagView({
      tags: [tag('a', 'amy', 40 * HOUR), tag('b', 'sam', 20 * HOUR), tag('c', 'cat', 30 * HOUR)],
      serverOffsetMs: 0,
      deviceNow,
      points: 0,
      best: 0,
    });
    expect(v).toMatchObject({
      kind: 'tag',
      title: '@sam is waiting on you',
      more: '2 more waiting',
    });
  });

  it('turns to the warning colour from the 6-hour mark on', () => {
    const at = (left: number) =>
      liveTagView({
        tags: [tag('a', 'sam', left)],
        serverOffsetMs: 0,
        deviceNow,
        points: 0,
        best: 0,
      });
    expect(at(6 * HOUR + 1000)).toMatchObject({ warning: false });
    expect(at(6 * HOUR)).toMatchObject({ warning: true });
    expect(at(6 * HOUR - 1000)).toMatchObject({ warning: true });
  });

  it('counts down on the phone clock so the native timer ends when the server says', () => {
    // Server 10 minutes ahead: the deadline on the phone's clock is 10 minutes earlier.
    const v = liveTagView({
      tags: [tag('a', 'sam', 30 * HOUR)],
      serverOffsetMs: 10 * MIN,
      deviceNow,
      points: 0,
      best: 0,
    });
    expect(v).toMatchObject({ kind: 'tag', deadline: deviceNow + 30 * HOUR - 10 * MIN });
  });

  it('never starts the timer in the future', () => {
    // A phone clock behind the server can put the tag's start after "now".
    const v = liveTagView({
      tags: [tag('a', 'sam', 30 * HOUR, 0)],
      serverOffsetMs: -5 * MIN,
      deviceNow,
      points: 0,
      best: 0,
    });
    expect(v).toMatchObject({ kind: 'tag', start: deviceNow });
  });

  it('with no open tag, waits for a friend and shows the points and best', () => {
    const v = liveTagView({ tags: [], serverOffsetMs: 0, deviceNow, points: 12, best: 20 });
    expect(v).toMatchObject({
      kind: 'waiting',
      title: 'Waiting for a friend to tag you',
      points: '12 Mahi points',
      best: 'Best: 20',
    });
    expect(
      liveTagView({ tags: [], serverOffsetMs: 0, deviceNow, points: 1, best: 1 })
    ).toMatchObject({ points: '1 Mahi point', best: 'Best: 1' });
  });

  // Walkthrough 2026-10-07: a first post needs no tag, so a brand-new person isn't told to wait.
  it('with no open tag and no post yet, says the first workout earns the first point', () => {
    const v = liveTagView({
      tags: [],
      serverOffsetMs: 0,
      deviceNow,
      points: 0,
      best: 0,
      postedBefore: false,
    });
    expect(v).toMatchObject({
      kind: 'waiting',
      title: 'Post your first workout to get your first point',
    });
    expect(
      liveTagView({
        tags: [],
        serverOffsetMs: 0,
        deviceNow,
        points: 0,
        best: 0,
        postedBefore: true,
      })
    ).toMatchObject({ title: 'Waiting for a friend to tag you' });
  });

  it('carries only the username and points, never names, photos or ids', () => {
    const t = { ...tag('secret-id', 'sam', 30 * HOUR), display_name: 'Sam Smith', avatar_url: 'x' };
    const json = JSON.stringify(
      liveTagView({ tags: [t], serverOffsetMs: 0, deviceNow, points: 3, best: 3 })
    );
    expect(json).not.toContain('secret-id');
    expect(json).not.toContain('Sam Smith');
    expect(json).not.toContain('avatar');
  });

  it('is drawn in Mahi’s colours on the dark background', () => {
    const v = liveTagView({ tags: [], serverOffsetMs: 0, deviceNow, points: 0, best: 0 });
    expect(v.look).toMatchObject({
      accent: COLORS.accent,
      warning: COLORS.warning,
      bg: COLORS.bgDark,
      text: COLORS.offWhite,
    });
  });

  it('after sign-out shows nothing personal', () => {
    const v = offView();
    expect(v.kind).toBe('off');
    expect(v.title).toBe('Open Mahi to see your tags');
    expect(JSON.stringify(v)).not.toMatch(/point|@/);
  });
});

describe('liveActivityStaleAt — when the Live Activity turns to the warning colour by itself', () => {
  it('is the 6-hour mark while that is still ahead, else the deadline', () => {
    expect(liveActivityStaleAt(deviceNow + 30 * HOUR, deviceNow)).toBe(deviceNow + 24 * HOUR);
    expect(liveActivityStaleAt(deviceNow + 2 * HOUR, deviceNow)).toBe(deviceNow + 2 * HOUR);
  });

  // Walkthrough 2026-10-07: at 0:00 the activity must stop saying "@sam is waiting on you". The
  // layout swaps to `timeUp` when it is stale and `warning` is set, because a warning view is
  // always given the deadline as its stale date.
  it('carries the time-up words, and a warning view always goes stale at the deadline', () => {
    for (const left of [30 * HOUR, 6 * HOUR + 1000, 6 * HOUR, 2 * HOUR, MIN]) {
      const v = liveTagView({
        tags: [tag('a', 'sam', left)],
        serverOffsetMs: 0,
        deviceNow,
        points: 0,
        best: 0,
      });
      if (v.kind !== 'tag') throw new Error('expected a tag view');
      expect(v.timeUp).toBe('Time’s up · open Mahi');
      expect(liveActivityStaleAt(v.deadline, deviceNow) === v.deadline).toBe(v.warning);
    }
  });
});

describe('widgetTimeline — the widget changes on time without the app', () => {
  it('starts now, turns to the warning colour at 6 hours and waits once the tag is over', () => {
    const entries = widgetTimeline({
      tags: [tag('a', 'sam', 30 * HOUR)],
      serverOffsetMs: 0,
      deviceNow,
      points: 4,
      best: 9,
    });
    expect(entries.map((e) => e.date)).toEqual([
      deviceNow,
      deviceNow + 24 * HOUR,
      deviceNow + 30 * HOUR,
    ]);
    expect(entries[0].props).toMatchObject({ kind: 'tag', warning: false });
    expect(entries[1].props).toMatchObject({ kind: 'tag', warning: true });
    // A tag left unanswered puts the points back to 0; the best stays.
    expect(entries[2].props).toMatchObject({
      kind: 'waiting',
      points: '0 Mahi points',
      best: 'Best: 9',
    });
  });

  it('moves on to the next tag when the soonest ends', () => {
    const entries = widgetTimeline({
      tags: [tag('a', 'amy', 2 * HOUR), tag('b', 'ben', 20 * HOUR)],
      serverOffsetMs: 0,
      deviceNow,
      points: 4,
      best: 9,
    });
    expect(entries.map((e) => [e.date - deviceNow, e.props.title])).toEqual([
      [0, '@amy is waiting on you'],
      [2 * HOUR, '@ben is waiting on you'],
      [14 * HOUR, '@ben is waiting on you'],
      [20 * HOUR, 'Waiting for a friend to tag you'],
    ]);
    expect(entries[0].props).toMatchObject({ more: '1 more waiting', warning: true });
    expect(entries[1].props).toMatchObject({ more: null, warning: false });
    expect(entries[2].props).toMatchObject({ warning: true });
  });

  it('with no tag is one entry: waiting, with the points', () => {
    const entries = widgetTimeline({ tags: [], serverOffsetMs: 0, deviceNow, points: 4, best: 9 });
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ date: deviceNow, props: { points: '4 Mahi points' } });
  });
});

describe('nextLiveTagChange — when the open app must look again', () => {
  it('is the next 6-hour mark or deadline, whichever comes first', () => {
    const tags = [tag('a', 'amy', 30 * HOUR), tag('b', 'ben', 3 * HOUR)];
    expect(nextLiveTagChange(tags, 0, deviceNow)).toBe(deviceNow + 3 * HOUR);
    expect(nextLiveTagChange([tag('a', 'amy', 30 * HOUR)], 0, deviceNow)).toBe(
      deviceNow + 24 * HOUR
    );
    expect(nextLiveTagChange([], 0, deviceNow)).toBeNull();
  });
});

describe('liveActivityAction — start, update or end the one Live Activity', () => {
  const base = { enabled: true, signedIn: true, loaded: true, running: false, shownFor: null };

  it('starts for an open tag when none is running', () => {
    expect(liveActivityAction({ ...base, soonestTagId: 'a' })).toBe('start');
  });

  it('updates the running one instead of starting a second', () => {
    expect(liveActivityAction({ ...base, running: true, soonestTagId: 'b', shownFor: 'a' })).toBe(
      'update'
    );
  });

  it('ends when the tags are answered or over', () => {
    expect(liveActivityAction({ ...base, running: true, soonestTagId: null })).toBe('end');
    expect(liveActivityAction({ ...base, running: false, soonestTagId: null })).toBe('none');
  });

  it('ends on sign-out or when the switch is off', () => {
    expect(liveActivityAction({ ...base, running: true, signedIn: false, soonestTagId: 'a' })).toBe(
      'end'
    );
    expect(liveActivityAction({ ...base, running: true, enabled: false, soonestTagId: 'a' })).toBe(
      'end'
    );
    expect(liveActivityAction({ ...base, enabled: false, soonestTagId: 'a' })).toBe('none');
  });

  it('does nothing until this session has read the tags', () => {
    expect(liveActivityAction({ ...base, loaded: false, soonestTagId: null, running: true })).toBe(
      'none'
    );
  });

  it('does not bring back one the person swiped away for the same tag', () => {
    expect(liveActivityAction({ ...base, soonestTagId: 'a', shownFor: 'a' })).toBe('none');
    // A different tag becoming the soonest is news: show it again.
    expect(liveActivityAction({ ...base, soonestTagId: 'b', shownFor: 'a' })).toBe('start');
  });
});

describe('isCameraLink — a tap on the Live Activity or widget opens the camera', () => {
  it('knows its own link and nothing else', () => {
    expect(LIVE_TAG_URL).toBe('mahi://camera');
    expect(isCameraLink('mahi://camera')).toBe(true);
    expect(isCameraLink('mahi:///camera')).toBe(true);
    expect(isCameraLink('mahi://camera?from=widget')).toBe(true);
    expect(isCameraLink('mahi://i/abc')).toBe(false);
    expect(isCameraLink('https://togethermahi.com/camera')).toBe(false);
    expect(isCameraLink(null)).toBe(false);
  });
});

describe('the tagger’s photo on the Live Activity and widget (owner, 2026-10-07, #117)', () => {
  it('shows the soonest tagger’s saved photo', () => {
    const v = liveTagView({
      tags: [tag('a', 'amy', 40 * HOUR), tag('b', 'sam', 20 * HOUR)],
      serverOffsetMs: 0,
      deviceNow,
      points: 0,
      best: 0,
      photos: { sam: 'file:///group/ExpoWidgets/tagger-sam.jpg', amy: 'file:///x/amy.jpg' },
    });
    expect(v).toMatchObject({ kind: 'tag', photo: 'file:///group/ExpoWidgets/tagger-sam.jpg' });
  });
  it('shows no photo when none is saved, or the switch is off (no photos passed)', () => {
    const v = liveTagView({
      tags: [tag('b', 'sam', 20 * HOUR)],
      serverOffsetMs: 0,
      deviceNow,
      points: 0,
      best: 0,
    });
    expect(v).toMatchObject({ kind: 'tag', photo: null });
  });
  it('names the saved file after the friend, in the shared folder', () => {
    expect(taggerPhotoFile('file:///group/ExpoWidgets/', 'sam_1')).toBe(
      'file:///group/ExpoWidgets/tagger-sam_1.jpg'
    );
    expect(taggerPhotoFile('file:///group/ExpoWidgets', 'Sam.B')).toBe(
      'file:///group/ExpoWidgets/tagger-sam.b.jpg'
    );
    expect(taggerPhotoFile('file:///g/', '../x')).toBe('file:///g/tagger-x.jpg');
  });
  it('deletes the saved photos of mates with no open tag, and only tagger photos', () => {
    const files = ['tagger-sam.jpg', 'tagger-sam.b.jpg', 'tagger-ali.jpg', 'other.json', 'x.jpg'];
    expect(staleTaggerPhotos(files, ['sam', 'Sam.B'])).toEqual(['tagger-ali.jpg']);
  });
  it('deletes every tagger photo when nobody is kept (signed out or switched off)', () => {
    expect(staleTaggerPhotos(['tagger-sam.jpg', 'tagger-ali.jpg', 'widget.json'], [])).toEqual([
      'tagger-sam.jpg',
      'tagger-ali.jpg',
    ]);
  });
});
