import {
  MAX_VIDEO_SECONDS,
  VIDEO_RECORDING,
  videoAvailable,
  mediaTypeOrPhoto,
  videoFile,
  postMediaPath,
  postMediaContentType,
  secondsLeft,
  recordingLabel,
  shutterIntent,
  shutterLabel,
  gridTile,
  soundButtonLabel,
  discardTitle,
  shouldPlay,
  mediaTypeArgs,
  HOLD_TO_RECORD_MS,
  recordingFailedText,
  shutterHint,
} from '../videoPosts';

describe('videoAvailable — flag on AND the native video module in this build', () => {
  it('is on only when both are true', () => {
    expect(videoAvailable(true, true)).toBe(true);
  });

  // Build 10 gets OTA updates too but has no video module: that must read as flag off.
  it('is off on a build without the native module, even with the flag on', () => {
    expect(videoAvailable(true, false)).toBe(false);
  });

  it('is off when the flag is off', () => {
    expect(videoAvailable(false, true)).toBe(false);
    expect(videoAvailable(false, false)).toBe(false);
  });
});

describe('mediaTypeOrPhoto — anything but "video" is a photo (older servers send nothing)', () => {
  it('reads video', () => {
    expect(mediaTypeOrPhoto('video')).toBe('video');
  });
  it('falls back to photo', () => {
    expect(mediaTypeOrPhoto('photo')).toBe('photo');
    expect(mediaTypeOrPhoto(null)).toBe('photo');
    expect(mediaTypeOrPhoto(undefined)).toBe('photo');
    expect(mediaTypeOrPhoto('gif')).toBe('photo');
  });
});

describe('videoFile — extension and content type from the recorded file', () => {
  it('reads an iPhone recording as QuickTime', () => {
    expect(videoFile('file:///cache/Camera/ABC.mov')).toEqual({
      ext: 'mov',
      contentType: 'video/quicktime',
    });
    expect(videoFile('file:///x/ABC.MOV')).toEqual({ ext: 'mov', contentType: 'video/quicktime' });
  });
  it('reads anything else as mp4', () => {
    expect(videoFile('file:///x/abc.mp4')).toEqual({ ext: 'mp4', contentType: 'video/mp4' });
    expect(videoFile('file:///x/abc')).toEqual({ ext: 'mp4', contentType: 'video/mp4' });
  });
});

describe('postMediaPath — where each shot goes in the posts bucket', () => {
  it('keeps the photo paths exactly as today', () => {
    expect(postMediaPath('u1', 'c1', 'rear', { kind: 'photo', uri: 'file:///a.jpg' })).toBe(
      'u1/c1_rear.jpg'
    );
    expect(postMediaPath('u1', 'c1', 'pov', { kind: 'photo', uri: 'file:///b.jpg' })).toBe(
      'u1/c1_pov.jpg'
    );
  });
  it('gives a video its own extension', () => {
    expect(postMediaPath('u1', 'c1', 'rear', { kind: 'video', uri: 'file:///a.mov' })).toBe(
      'u1/c1_rear.mov'
    );
    expect(postMediaPath('u1', 'c1', 'pov', { kind: 'video', uri: 'file:///a.mp4' })).toBe(
      'u1/c1_pov.mp4'
    );
  });
  it('content type follows the kind', () => {
    expect(postMediaContentType({ kind: 'photo', uri: 'file:///a.jpg' })).toBe('image/jpeg');
    expect(postMediaContentType({ kind: 'video', uri: 'file:///a.mov' })).toBe('video/quicktime');
  });
});

describe('recording limits', () => {
  it('caps a video at 15 seconds', () => {
    expect(MAX_VIDEO_SECONDS).toBe(15);
    expect(VIDEO_RECORDING.maxDuration).toBe(15);
  });

  it('records full-screen sharp but small: 1080p, about 5 Mbit/s, H.264, under 10 MB for 15 s', () => {
    expect(VIDEO_RECORDING.quality).toBe('1080p');
    expect(VIDEO_RECORDING.codec).toBe('avc1');
    // 15 s at this rate is ~8.9 MB; the file cap is well under the bucket's 50 MB.
    expect((VIDEO_RECORDING.bitrate * MAX_VIDEO_SECONDS) / 8).toBeLessThan(10 * 1024 * 1024);
    expect(VIDEO_RECORDING.maxFileSize).toBeLessThan(50 * 1024 * 1024);
  });

  it('steadies handheld clips with standard stabilisation (no extra crop or start-up lag)', () => {
    expect(VIDEO_RECORDING.stabilization).toBe('standard');
  });
});

describe('secondsLeft / recordingLabel', () => {
  it('counts down from 15 and never below 0', () => {
    expect(secondsLeft(1000, 1000)).toBe(15);
    expect(secondsLeft(1000, 1000 + 4200)).toBe(11);
    expect(secondsLeft(1000, 1000 + 15_000)).toBe(0);
    expect(secondsLeft(1000, 1000 + 99_000)).toBe(0);
  });

  it('says it is recording and how long is left, in sentence case', () => {
    expect(recordingLabel(12)).toBe('Recording · 12 seconds left');
    expect(recordingLabel(1)).toBe('Recording · 1 second left');
    const label = recordingLabel(3);
    expect(label).not.toBe(label.toUpperCase());
  });
});

describe('shutterIntent — what a tap or a hold on the shutter does', () => {
  const base = { videoOn: true, recording: false };

  it('flag off: a tap is a photo and a hold does nothing extra (today exactly)', () => {
    expect(shutterIntent({ ...base, videoOn: false, mode: 'photo', press: 'tap' })).toBe('photo');
    expect(shutterIntent({ ...base, videoOn: false, mode: 'photo', press: 'hold' })).toBe('none');
    // A stale video switch can't record with the flag off.
    expect(shutterIntent({ ...base, videoOn: false, mode: 'video', press: 'tap' })).toBe('photo');
  });

  it('photo switch: tap = photo, hold = record', () => {
    expect(shutterIntent({ ...base, mode: 'photo', press: 'tap' })).toBe('photo');
    expect(shutterIntent({ ...base, mode: 'photo', press: 'hold' })).toBe('start-video');
  });

  it('video switch: tap starts, tap again stops; hold records too', () => {
    expect(shutterIntent({ ...base, mode: 'video', press: 'tap' })).toBe('start-video');
    expect(shutterIntent({ ...base, mode: 'video', recording: true, press: 'tap' })).toBe(
      'stop-video'
    );
    expect(shutterIntent({ ...base, mode: 'video', press: 'hold' })).toBe('start-video');
  });

  it('while recording, holding the shutter stops too (a long press sends no tap)', () => {
    expect(shutterIntent({ ...base, mode: 'video', recording: true, press: 'hold' })).toBe(
      'stop-video'
    );
  });

  it('letting go stops a held recording; it never takes a photo while recording', () => {
    expect(shutterIntent({ ...base, mode: 'photo', recording: true, press: 'release' })).toBe(
      'stop-video'
    );
    expect(shutterIntent({ ...base, mode: 'photo', recording: true, press: 'tap' })).toBe(
      'stop-video'
    );
    expect(shutterIntent({ ...base, mode: 'photo', recording: false, press: 'release' })).toBe(
      'none'
    );
  });
});

describe('shutterLabel — VoiceOver', () => {
  it('flag off: today’s labels', () => {
    expect(shutterLabel({ videoOn: false, mode: 'photo', recording: false, second: false })).toBe(
      'Take photo'
    );
    expect(shutterLabel({ videoOn: false, mode: 'photo', recording: false, second: true })).toBe(
      'Take second photo'
    );
  });
  it('photo switch: says hold to record', () => {
    expect(shutterLabel({ videoOn: true, mode: 'photo', recording: false, second: false })).toBe(
      'Take photo, or hold to record a video'
    );
  });
  it('video switch and recording', () => {
    expect(shutterLabel({ videoOn: true, mode: 'video', recording: false, second: true })).toBe(
      'Record second video'
    );
    expect(shutterLabel({ videoOn: true, mode: 'video', recording: true, second: false })).toBe(
      'Stop recording'
    );
  });
});

describe('gridTile — what a profile square shows', () => {
  it('a photo post shows its rear photo, no icon (today)', () => {
    expect(
      gridTile({
        image_url: 'r',
        pov_image_url: 'f',
        rear_media_type: 'photo',
        front_media_type: 'photo',
      })
    ).toEqual({ uri: 'r', video: false });
  });
  it('an old post with no media types is a photo post', () => {
    expect(gridTile({ image_url: 'r', pov_image_url: null })).toEqual({ uri: 'r', video: false });
  });
  it('rear video, front photo: shows the photo, with the video icon', () => {
    expect(
      gridTile({
        image_url: 'r',
        pov_image_url: 'f',
        rear_media_type: 'video',
        front_media_type: 'photo',
      })
    ).toEqual({ uri: 'f', video: true });
  });
  it('two videos: no still to show, just the video icon', () => {
    expect(
      gridTile({
        image_url: 'r',
        pov_image_url: 'f',
        rear_media_type: 'video',
        front_media_type: 'video',
      })
    ).toEqual({ uri: null, video: true });
  });
  it('a locked post (no URLs) shows nothing', () => {
    expect(gridTile({ image_url: '', pov_image_url: null })).toEqual({ uri: null, video: false });
  });
});

describe('soundButtonLabel', () => {
  it('says what tapping does, in sentence case', () => {
    expect(soundButtonLabel(true)).toBe('Turn sound on');
    expect(soundButtonLabel(false)).toBe('Turn sound off');
  });
});

describe('discardTitle', () => {
  it('keeps today’s wording for two photos', () => {
    expect(discardTitle('photo', 'photo')).toBe('Discard photos?');
  });
  it('names videos', () => {
    expect(discardTitle('video', 'video')).toBe('Discard videos?');
    expect(discardTitle('video', 'photo')).toBe('Discard photo and video?');
    expect(discardTitle('photo', 'video')).toBe('Discard photo and video?');
  });
});

describe('mediaTypeArgs — what create_post is told about media', () => {
  // A photo post must make exactly today's call, so it works before the migration is pushed.
  it('says nothing for two photos', () => {
    expect(mediaTypeArgs('photo', 'photo')).toEqual({});
  });
  it('names both shots when either is a video', () => {
    expect(mediaTypeArgs('video', 'photo')).toEqual({
      p_rear_media_type: 'video',
      p_front_media_type: 'photo',
    });
    expect(mediaTypeArgs('photo', 'video')).toEqual({
      p_rear_media_type: 'photo',
      p_front_media_type: 'video',
    });
  });
});

describe('shouldPlay — a video plays only while it is on screen', () => {
  it('plays when its screen is showing and the post is the one in view', () => {
    expect(shouldPlay({ screenActive: true, inView: true })).toBe(true);
  });
  it('pauses off screen', () => {
    expect(shouldPlay({ screenActive: false, inView: true })).toBe(false);
    expect(shouldPlay({ screenActive: true, inView: false })).toBe(false);
  });
});

describe('HOLD_TO_RECORD_MS', () => {
  // A slow tap (older hands, gloves, a firm press) must stay a photo: iOS's own long press is 500 ms.
  it('is half a second, so a slow tap is still a photo', () => {
    expect(HOLD_TO_RECORD_MS).toBe(500);
  });
});

describe('recordingFailedText — a video that did not save', () => {
  it('too short from a hold: says how to hold, without blaming', () => {
    expect(recordingFailedText({ press: 'hold', seconds: 0.4 })).toBe(
      'That video was too short to save. Hold the shutter a little longer.'
    );
  });

  it('too short from a tap in Video mode: says to tap stop later, not to hold', () => {
    expect(recordingFailedText({ press: 'tap', seconds: 0.4 })).toBe(
      'That video was too short to save. Tap stop after a second or two.'
    );
  });

  it('a longer recording that failed is the phone, not the person', () => {
    expect(recordingFailedText({ press: 'hold', seconds: 4 })).toBe(
      'Couldn’t save that video. Try again.'
    );
  });

  it('no em dashes, always a full stop', () => {
    for (const press of ['hold', 'tap'] as const) {
      for (const seconds of [0, 5]) {
        const text = recordingFailedText({ press, seconds });
        expect(text).not.toMatch(/—/);
        expect(text.endsWith('.')).toBe(true);
      }
    }
  });
});

describe('shutterHint — the first-time line that says you can hold to record', () => {
  it('says nothing with video off', () => {
    expect(shutterHint({ videoOn: false, mode: 'photo' })).toBeNull();
  });

  it('Photo: tap for a photo, hold for a video', () => {
    expect(shutterHint({ videoOn: true, mode: 'photo' })).toBe(
      'Tap for a photo · hold for a video'
    );
  });

  it('Video: tap to start and stop, and how to film yourself', () => {
    expect(shutterHint({ videoOn: true, mode: 'video' })).toBe(
      'Tap to start, tap to stop · up to 15 seconds. Prop your phone up to film yourself.'
    );
  });
});
