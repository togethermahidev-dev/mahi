import { useEffect } from 'react';
import * as FileSystem from 'expo-file-system/legacy';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import {
  LIVE_TAG_URL,
  TAGGER_PHOTO,
  taggerPhotoFile,
  liveActivityAction,
  liveActivityStaleAt,
  liveTagView,
  nextLiveTagChange,
  offView,
  soonestTagId,
  widgetTimeline,
} from '@/lib/liveTag';
import { loadLiveTagWidgets, type LiveTagWidgetsModule } from '@/lib/widgetsModule';
import { reportError } from '@/lib/sentry';
import { useAuthStore, useTagStore, useUserStore } from '@/store';
import { useFeatureFlag } from '@/hooks/useFeatureFlag';

/** The tag a Live Activity was last started for this session (see `liveActivityAction`). */
let shownFor: string | null = null;
/** What the widget and the running Live Activity were last sent, so unchanged content isn't re-sent. */
let lastWidget = '';
let lastActivity = '';

/** The server offset to the second: a new read moves it by milliseconds, which isn't news. */
const ONE_SECOND = 1000;

/**
 * Taggers' photos saved for the widget and Live Activity this session, by username (owner,
 * 2026-10-07, #117). Widgets can't fetch, so the app saves a small copy in expo-widgets' shared
 * folder first; the files are overwritten on each save, so a changed photo is picked up.
 */
let photos: Record<string, string> = {};
const saving = new Set<string>();

/** Saves the photos of the open tags' mates that aren't saved yet; `done` runs after each. */
function savePhotos(
  widgets: LiveTagWidgetsModule,
  tags: { username: string; avatar_url: string | null }[],
  done: () => void
) {
  const dir = widgets.widgetsDirectory;
  if (!dir) return;
  for (const t of tags) {
    if (!t.avatar_url || photos[t.username] || saving.has(t.username)) continue;
    saving.add(t.username);
    const name = t.username;
    const target = taggerPhotoFile(dir, name);
    const temp = `${FileSystem.cacheDirectory ?? ''}tagger-download-${Date.now()}.img`;
    FileSystem.downloadAsync(t.avatar_url, temp)
      .then(({ uri }) =>
        manipulateAsync(uri, [{ resize: { width: TAGGER_PHOTO.px, height: TAGGER_PHOTO.px } }], {
          compress: TAGGER_PHOTO.quality,
          format: SaveFormat.JPEG,
        })
      )
      .then(async (small) => {
        await FileSystem.deleteAsync(target, { idempotent: true });
        await FileSystem.copyAsync({ from: small.uri, to: target });
        photos = { ...photos, [name]: target };
        done();
      })
      .catch((err) => reportError(err, { flow: 'tags', action: 'liveTagPhoto', level: 'warning' }))
      .finally(() => {
        saving.delete(name);
        FileSystem.deleteAsync(temp, { idempotent: true }).catch(() => {});
      });
  }
}

function setWidget(
  widgets: LiveTagWidgetsModule,
  key: string,
  entries: () => ReturnType<typeof widgetTimeline>
) {
  if (key === lastWidget) return;
  widgets.tagWidget.updateTimeline(
    entries().map((e) => ({ date: new Date(e.date), props: e.props }))
  );
  lastWidget = key;
}

/**
 * Brings the widget and the one Live Activity in line with the open tags, the points and who is
 * signed in. Safe to call often: nothing is sent when nothing changed. Returns when it next needs
 * to look again by itself (a 6-hour mark or a deadline), or null.
 */
export function syncLiveTag(
  enabled: boolean,
  photosOn: boolean,
  again: () => void = () => {}
): number | null {
  const widgets = loadLiveTagWidgets();
  if (!widgets) return null;
  const signedIn = !!useAuthStore.getState().user;
  const { openTags, serverOffsetMs: rawOffset, openTagsLoaded } = useTagStore.getState();
  const profile = useUserStore.getState().profile;
  const serverOffsetMs = Math.round(rawOffset / ONE_SECOND) * ONE_SECOND;
  const loaded = openTagsLoaded && profile != null;
  const now = Date.now();
  const input = profile && {
    tags: openTags,
    serverOffsetMs,
    deviceNow: now,
    points: profile.streak_current,
    best: profile.streak_highest,
    photos: photosOn ? photos : {},
    postedBefore: profile.has_posted_before !== false,
  };
  if (enabled && signedIn && photosOn && loaded) savePhotos(widgets, openTags, again);

  // The widget: nothing personal when signed out or switched off; nothing until this session's
  // first read, so it never shows a guess.
  try {
    if (!enabled || !signedIn) {
      setWidget(widgets, 'off', () => [{ date: now, props: offView() }]);
    } else if (loaded && input) {
      const key = JSON.stringify([
        openTags.map((t) => [t.challenge_id, t.username, t.created_at, t.expires_at]),
        serverOffsetMs,
        input.points,
        input.best,
        input.photos,
        input.postedBefore,
      ]);
      setWidget(widgets, key, () => widgetTimeline(input));
    }
  } catch (err) {
    reportError(err, { flow: 'tags', action: 'liveTagWidget', level: 'warning' });
  }

  // The Live Activity: only ever one.
  let running: ReturnType<LiveTagWidgetsModule['tagActivity']['getInstances']> = [];
  try {
    running = widgets.tagActivity.getInstances();
  } catch {
    running = []; // Older than iOS 16.2: no Live Activities.
  }
  for (const extra of running.slice(1)) void extra.end('immediate').catch(() => {});
  const current = running[0];
  const soonest = loaded ? soonestTagId(openTags, serverOffsetMs, now) : null;
  const action = liveActivityAction({
    enabled,
    signedIn,
    loaded,
    running: !!current,
    soonestTagId: soonest,
    shownFor,
  });

  if (action === 'end' && current) {
    lastActivity = '';
    void current
      .end('immediate')
      .catch((err) => reportError(err, { flow: 'tags', action: 'liveTagEnd', level: 'warning' }));
  } else if ((action === 'start' || action === 'update') && input) {
    const view = liveTagView(input);
    if (view.kind === 'tag') {
      const props = JSON.stringify(view);
      const staleAt = new Date(liveActivityStaleAt(view.deadline, now));
      shownFor = soonest;
      if (action === 'start') {
        try {
          widgets.tagActivity.start(view, LIVE_TAG_URL, staleAt);
          lastActivity = props;
        } catch (err) {
          // Live Activities switched off for Mahi in Settings: nothing to show, nothing to report.
          console.log('[liveTag] could not start', err);
        }
      } else if (current && props !== lastActivity) {
        lastActivity = props;
        void current
          .update(view, staleAt)
          .catch((err) =>
            reportError(err, { flow: 'tags', action: 'liveTagUpdate', level: 'warning' })
          );
      }
    }
  }
  if (!signedIn) shownFor = null;

  return enabled && signedIn && loaded ? nextLiveTagChange(openTags, serverOffsetMs, now) : null;
}

/**
 * Keeps a mate's tag in view without opening Mahi (build 13+, on for everyone; switch `live-activity` turns it off): the Live
 * Activity on the lock screen and Dynamic Island, and the home-screen widget. Watches the open
 * tags, the points and sign-in; while Mahi is open it also looks again at each 6-hour mark and
 * deadline. With Mahi closed the widget's timeline and the activity's own timer carry on. Does
 * nothing on builds without expo-widgets. Mounted once, in App.tsx.
 */
export function useLiveTag(): void {
  // On for everyone on a build that has it; `live-activity` is the owner's off switch (2026-10-07).
  const enabled = useFeatureFlag('live-activity');
  // The tagger's photo on the widget and Live Activity (kill switch, on for everyone).
  const photosOn = useFeatureFlag('widget-tagger-photo');

  useEffect(() => {
    if (!loadLiveTagWidgets()) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const run = () => {
      if (timer) clearTimeout(timer);
      timer = undefined;
      const next = syncLiveTag(enabled, photosOn, run);
      if (next !== null) timer = setTimeout(run, Math.max(0, next - Date.now()));
    };
    run();
    const unsubscribe = [
      useTagStore.subscribe(run),
      useUserStore.subscribe(run),
      useAuthStore.subscribe(run),
    ];
    return () => {
      if (timer) clearTimeout(timer);
      unsubscribe.forEach((u) => u());
    };
  }, [enabled, photosOn]);
}
