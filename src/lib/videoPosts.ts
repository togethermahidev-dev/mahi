/**
 * Video posts (flag `video-posts`, default off): each of a post's two shots can be a photo or a
 * video of up to 15 seconds. Pure rules, unit-tested; the camera, preview, feed, post detail and
 * profile grid read these. The native side (is the video module in this build?) lives in
 * `src/lib/videoModule.ts`, kept apart so these stay testable under node.
 */

export type MediaType = 'photo' | 'video';

/** One captured shot, before it is uploaded. */
export type CapturedMediaRef = { kind: MediaType; uri: string };

/** Owner, 2026-10-02: a video is at most 15 seconds. */
export const MAX_VIDEO_SECONDS = 15;

/**
 * Recording settings: 720p H.264 at ~3.5 Mbit/s keeps 15 s near 7 MB (fast to upload, well under
 * the bucket's 50 MB limit). iOS only honours the bitrate when the codec is named.
 */
export const VIDEO_RECORDING = {
  quality: '720p',
  codec: 'avc1',
  bitrate: 3_500_000,
  maxDuration: MAX_VIDEO_SECONDS,
  maxFileSize: 40 * 1024 * 1024,
} as const;

/** How long the shutter must be held before it records instead of taking a photo. */
export const HOLD_TO_RECORD_MS = 300;

/**
 * Video is offered only with the flag on AND the native video module in this build. OTA updates
 * also reach build 10, which has no video module: there it must behave exactly as flag off.
 */
export function videoAvailable(flagOn: boolean, nativeModulePresent: boolean): boolean {
  return flagOn && nativeModulePresent;
}

/** A shot's media type as the server sent it; anything else (older servers: nothing) is a photo. */
export function mediaTypeOrPhoto(value: unknown): MediaType {
  return value === 'video' ? 'video' : 'photo';
}

/** iPhones record QuickTime (.mov); Android records mp4. */
export function videoFile(uri: string): {
  ext: 'mov' | 'mp4';
  contentType: 'video/quicktime' | 'video/mp4';
} {
  return /\.mov$/i.test(uri)
    ? { ext: 'mov', contentType: 'video/quicktime' }
    : { ext: 'mp4', contentType: 'video/mp4' };
}

/** Where a shot goes in the `posts` bucket. Photos keep today's paths. */
export function postMediaPath(
  userId: string,
  clientId: string,
  side: 'rear' | 'pov',
  shot: CapturedMediaRef
): string {
  const ext = shot.kind === 'video' ? videoFile(shot.uri).ext : 'jpg';
  return `${userId}/${clientId}_${side}.${ext}`;
}

export function postMediaContentType(shot: CapturedMediaRef): string {
  return shot.kind === 'video' ? videoFile(shot.uri).contentType : 'image/jpeg';
}

/** Whole seconds left of a recording that started at `startedAt` (ms). */
export function secondsLeft(startedAt: number, now: number): number {
  const left = MAX_VIDEO_SECONDS - Math.floor((now - startedAt) / 1000);
  return Math.max(0, Math.min(MAX_VIDEO_SECONDS, left));
}

/** The camera's status line while recording. */
export function recordingLabel(left: number): string {
  return `Recording… ${left} s left`;
}

export type ShutterPress = 'tap' | 'hold' | 'release';
export type ShutterIntent = 'photo' | 'start-video' | 'stop-video' | 'none';

/**
 * What a press on the shutter does. Flag off (or no video module) is today exactly: a tap takes a
 * photo and nothing records. With video: the Photo / Video switch picks what a tap does; holding
 * always records, and letting go (or 15 s) stops.
 */
export function shutterIntent(input: {
  videoOn: boolean;
  mode: MediaType;
  recording: boolean;
  press: ShutterPress;
}): ShutterIntent {
  const { videoOn, mode, recording, press } = input;
  if (!videoOn) return press === 'tap' ? 'photo' : 'none';
  if (recording) return press === 'hold' ? 'none' : 'stop-video';
  if (press === 'release') return 'none';
  if (press === 'hold') return 'start-video';
  return mode === 'video' ? 'start-video' : 'photo';
}

/** The shutter's VoiceOver label. */
export function shutterLabel(input: {
  videoOn: boolean;
  mode: MediaType;
  recording: boolean;
  /** Waiting for the second shot. */
  second: boolean;
}): string {
  const { videoOn, mode, recording, second } = input;
  if (videoOn && recording) return 'Stop recording';
  if (videoOn && mode === 'video') return second ? 'Record second video' : 'Record video';
  const photo = second ? 'Take second photo' : 'Take photo';
  return videoOn ? `${photo}, or hold to record a video` : photo;
}

/**
 * A profile grid square: the post's still photo (rear first, then the selfie) and whether it
 * carries a video. No still (two videos, or a locked post) → null.
 */
export function gridTile(post: {
  image_url: string;
  pov_image_url: string | null;
  rear_media_type?: string | null;
  front_media_type?: string | null;
}): { uri: string | null; video: boolean } {
  const rear = mediaTypeOrPhoto(post.rear_media_type);
  const front = mediaTypeOrPhoto(post.front_media_type);
  const video = !!post.image_url && (rear === 'video' || front === 'video');
  if (rear === 'photo' && post.image_url) return { uri: post.image_url, video };
  if (front === 'photo' && post.pov_image_url) return { uri: post.pov_image_url, video };
  return { uri: null, video };
}

/** The mute button says what a tap does. */
export function soundButtonLabel(muted: boolean): string {
  return muted ? 'Turn sound on' : 'Turn sound off';
}

/** The preview's "discard?" question. Two photos keep today's wording. */
export function discardTitle(rear: MediaType, front: MediaType): string {
  if (rear === 'photo' && front === 'photo') return 'Discard photos?';
  if (rear === 'video' && front === 'video') return 'Discard videos?';
  return 'Discard photo and video?';
}

/**
 * The media arguments for create_post: none for two photos, so a photo post makes exactly
 * today's call (and works before the video migration is pushed); both when either is a video.
 */
export function mediaTypeArgs(
  rear: MediaType,
  front: MediaType
): { p_rear_media_type?: MediaType; p_front_media_type?: MediaType } {
  if (rear === 'photo' && front === 'photo') return {};
  return { p_rear_media_type: rear, p_front_media_type: front };
}

/** A video plays (muted, looping) only while its screen is showing and the post is in view. */
export function shouldPlay(input: { screenActive: boolean; inView: boolean }): boolean {
  return input.screenActive && input.inView;
}
