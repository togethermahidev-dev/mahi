import {
  MAX_SHARED_PHOTOS,
  SHARED_PHOTO_MAX_EDGE,
  isShareLink,
  sharedFilePaths,
  sharedPhotoResize,
  sharedPhotos,
} from '../sharedPhoto';

/** What the share extension hands the app on iPhone: a JSON string. */
const ios = (files: object[]) => JSON.stringify({ files, type: 'media' });
const jpeg = (path: string, width = 3024, height = 4032) => ({
  path,
  mimeType: 'image/jpeg',
  fileName: 'IMG.jpg',
  width,
  height,
  type: '0',
});

describe('isShareLink', () => {
  it('knows the share extension’s link', () => {
    expect(isShareLink('mahi://dataUrl=mahiShareKey?nonce=1#media')).toBe(true);
  });

  it('leaves every other link alone', () => {
    expect(isShareLink('mahi://camera')).toBe(false);
    expect(isShareLink('mahi://i/abc')).toBe(false);
    expect(isShareLink('https://togethermahi.com/p/1')).toBe(false);
    expect(isShareLink(null)).toBe(false);
  });
});

describe('sharedPhotos', () => {
  it('takes one photo', () => {
    expect(sharedPhotos(ios([jpeg('/group/a.jpg')]))).toEqual({
      ok: true,
      photos: [{ uri: 'file:///group/a.jpg', width: 3024, height: 4032 }],
    });
  });

  it('takes two photos, in the order they were picked', () => {
    const v = sharedPhotos(ios([jpeg('/group/a.jpg'), jpeg('file:///group/b.heic')]));
    expect(v.ok && v.photos.map((p) => p.uri)).toEqual([
      'file:///group/a.jpg',
      'file:///group/b.heic',
    ]);
  });

  it('accepts what Android sends (an object), too', () => {
    const v = sharedPhotos({ files: [{ filePath: '/data/a.png', mimeType: 'image/png' }] });
    expect(v).toEqual({
      ok: true,
      photos: [{ uri: 'file:///data/a.png', width: null, height: null }],
    });
  });

  it('refuses more than two', () => {
    expect(MAX_SHARED_PHOTOS).toBe(2);
    const three = ios([jpeg('/a.jpg'), jpeg('/b.jpg'), jpeg('/c.jpg')]);
    expect(sharedPhotos(three)).toEqual({ ok: false, reason: 'too-many' });
  });

  it('refuses videos and other files: photos only', () => {
    expect(sharedPhotos(ios([{ path: '/a.mov', mimeType: 'video/quicktime' }]))).toEqual({
      ok: false,
      reason: 'not-photo',
    });
    expect(
      sharedPhotos(ios([jpeg('/a.jpg'), { path: '/b.pdf', mimeType: 'application/pdf' }]))
    ).toEqual({ ok: false, reason: 'not-photo' });
  });

  it('treats nothing usable as nothing shared', () => {
    expect(sharedPhotos(null)).toEqual({ ok: false, reason: 'none' });
    expect(sharedPhotos('not json')).toEqual({ ok: false, reason: 'none' });
    expect(sharedPhotos(ios([]))).toEqual({ ok: false, reason: 'none' });
    expect(sharedPhotos(JSON.stringify({ text: 'hello', type: 'text' }))).toEqual({
      ok: false,
      reason: 'none',
    });
  });
});

describe('sharedFilePaths', () => {
  it('lists every file the extension copied, photo or not, so all can be deleted', () => {
    expect(
      sharedFilePaths(ios([jpeg('/a.jpg'), { path: '/b.mov', mimeType: 'video/quicktime' }]))
    ).toEqual(['file:///a.jpg', 'file:///b.mov']);
    expect(sharedFilePaths(null)).toEqual([]);
  });
});

describe('sharedPhotoResize', () => {
  it('leaves a phone-sized photo as it is', () => {
    expect(sharedPhotoResize(3024, 4032)).toEqual([]);
    expect(sharedPhotoResize(null, null)).toEqual([]);
  });

  it('brings a huge photo down to the camera’s own size, long edge first', () => {
    expect(SHARED_PHOTO_MAX_EDGE).toBe(4032);
    expect(sharedPhotoResize(6048, 8064)).toEqual([{ resize: { height: 4032 } }]);
    expect(sharedPhotoResize(8064, 6048)).toEqual([{ resize: { width: 4032 } }]);
  });
});
