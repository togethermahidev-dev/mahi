import {
  PIP_H,
  PIP_W,
  appHeaderHeight,
  cameraCornerTop,
  clampToZone,
  measuredTextTop,
  openTagsTop,
  pipPlacement,
  sameTextTop,
  snapToCorner,
  textTopFromParts,
  withTextPart,
  type PipZone,
} from '../pip';

describe('draggable photo-in-photo', () => {
  const card = { width: 400, height: 800 };
  /** The highest it normally goes, and the highest it may be squeezed to (just under the header). */
  const top = 228;
  const minTop = 108;
  const place = (textTop: number | null) => pipPlacement(card, top, minTop, textTop);
  const zoneAt = (textTop: number): PipZone => {
    const placed = place(textTop);
    if (!placed) throw new Error(`no room at ${textTop}`);
    return placed.zone;
  };

  it('the app header is the top inset plus its row and bottom padding', () => {
    expect(appHeaderHeight(60)).toBe(108);
    expect(appHeaderHeight(0)).toBe(48);
  });

  it('the camera corner items sit just under the header', () => {
    expect(cameraCornerTop(60)).toBe(108);
  });

  it('the open-tags pill starts below the points counter, never on top of it', () => {
    // Counter: 8+8 padding, a 24pt line, 1pt borders = 42 tall; then an 8pt gap.
    expect(openTagsTop(60, 1)).toBe(60 + 48 + 42 + 8);
    // Larger text grows the counter up to its cap (1.35x), and the pill moves down with it.
    expect(openTagsTop(60, 1.35)).toBe(60 + 48 + 51 + 8);
    expect(openTagsTop(60, 3)).toBe(openTagsTop(60, 1.35));
    expect(openTagsTop(60, 0.8)).toBe(openTagsTop(60, 1));
  });

  // Owner, 2026-10-10: "When you scroll sometimes the front camera overlaps the name — make sure
  // it never does on all posts." A list cell is reused for the next post, whose name row sits
  // somewhere else: a measurement belongs to the post it was taken on, and to no other.
  describe('where this post’s name row starts', () => {
    it('uses a measurement taken on this post', () => {
      expect(measuredTextTop({ postId: 'a', textTop: 612 }, 'a')).toBe(612);
    });

    it('never uses the last post’s measurement (a reused list cell)', () => {
      expect(measuredTextTop({ postId: 'a', textTop: 612 }, 'b')).toBeNull();
    });

    it('is unknown until measured', () => {
      expect(measuredTextTop(null, 'a')).toBeNull();
    });

    it('adds the shade’s place on the post to the name row’s place in the shade', () => {
      expect(textTopFromParts({ postId: 'a', shadeY: 500, rowY: 112 }, 'a')).toBe(612);
    });

    it('waits for both parts, and for this post’s own', () => {
      expect(textTopFromParts({ postId: 'a', shadeY: 500, rowY: null }, 'a')).toBeNull();
      expect(textTopFromParts({ postId: 'a', shadeY: null, rowY: 112 }, 'a')).toBeNull();
      expect(textTopFromParts({ postId: 'a', shadeY: 500, rowY: 112 }, 'b')).toBeNull();
    });

    it('gathers the two parts as they are reported, in either order', () => {
      const first = withTextPart({ postId: 'a', shadeY: null, rowY: null }, 'a', 'rowY', 112);
      expect(first).toEqual({ postId: 'a', shadeY: null, rowY: 112 });
      expect(withTextPart(first, 'a', 'shadeY', 500)).toEqual({
        postId: 'a',
        shadeY: 500,
        rowY: 112,
      });
    });

    it('starts again on the next post: nothing of the last post’s is carried over', () => {
      const last = { postId: 'a', shadeY: 500, rowY: 112 };
      const next = withTextPart(last, 'b', 'shadeY', 430);
      expect(next).toEqual({ postId: 'b', shadeY: 430, rowY: null });
      expect(textTopFromParts(next, 'b')).toBeNull();
    });

    it('a re-measure that lands on the same spot changes nothing', () => {
      expect(sameTextTop({ postId: 'a', textTop: 612 }, 'a', 612.2)).toBe(true);
      expect(sameTextTop({ postId: 'a', textTop: 612 }, 'a', 613)).toBe(false);
      expect(sameTextTop({ postId: 'a', textTop: 612 }, 'b', 612)).toBe(false);
      expect(sameTextTop(null, 'a', 612)).toBe(false);
    });
  });

  describe('where it may sit', () => {
    it('is not drawn until this post’s name row has been measured', () => {
      expect(place(null)).toBeNull();
    });

    it('keeps clear of the side buttons and the left edge', () => {
      expect(zoneAt(600)).toMatchObject({ left: 8, right: 400 - PIP_W - 70, top: 228 });
    });

    // Owner, 2026-10-09: "make sure the pip window doesn't cover the users name row".
    it('sits a gap above the measured name row, wherever the text puts it', () => {
      expect(zoneAt(600).bottom).toBe(600 - 12 - PIP_H);
      // Large text or a long caption pushes the name row up: the small photo moves up with it.
      expect(zoneAt(480).bottom).toBe(480 - 12 - PIP_H);
      // A short caption lets it sit lower.
      expect(zoneAt(700).bottom).toBe(700 - 12 - PIP_H);
    });

    it('moves up past its usual top when the text runs high, staying under the header', () => {
      // Name row at 300: its lowest spot (168) is above the usual top (228) but under the header.
      expect(zoneAt(300)).toMatchObject({ top: 300 - 12 - PIP_H, bottom: 300 - 12 - PIP_H });
    });

    it('is not drawn at all when there is no room above the text', () => {
      // Name row at 200: the small photo would have to start at 68, over the header.
      expect(place(200)).toBeNull();
    });

    it('never trusts a name row measured below the post', () => {
      expect(zoneAt(5000).bottom).toBe(800 - 12 - PIP_H);
    });

    it('never covers the name row, in any corner, on any post', () => {
      for (let textTop = 0; textTop <= card.height; textTop += 7) {
        const placed = place(textTop);
        if (!placed) continue;
        const { zone } = placed;
        expect(zone.top).toBeGreaterThanOrEqual(minTop);
        expect(zone.top).toBeLessThanOrEqual(zone.bottom);
        for (const y of [zone.top, zone.bottom]) {
          // Its lower edge ends a gap above the name row.
          expect(y + PIP_H).toBeLessThanOrEqual(textTop - 12);
        }
      }
    });
  });

  // The window is drawn inside a fence that ends above the name row: even if its position is a
  // frame behind a change, the part past the fence is cut off rather than drawn over the name.
  describe('the fence', () => {
    it('ends above the name row', () => {
      for (const textTop of [300, 480, 600, 700]) {
        expect(place(textTop)!.fence).toBeLessThan(textTop);
      }
    });

    it('holds the whole window where it rests, with room for its lift', () => {
      for (const textTop of [300, 480, 600, 700]) {
        const { zone, fence } = place(textTop)!;
        expect(fence).toBeGreaterThan(zone.bottom + PIP_H);
      }
    });
  });

  describe('dragging', () => {
    const zone = zoneAt(600);

    it('a drag stays inside the safe zone', () => {
      expect(clampToZone(-50, 5000, zone)).toEqual({ x: zone.left, y: zone.bottom });
      expect(clampToZone(9999, -10, zone)).toEqual({ x: zone.right, y: zone.top });
      expect(clampToZone(100, 300, zone)).toEqual({ x: 100, y: 300 });
    });

    it('on release it snaps to the nearest corner', () => {
      expect(snapToCorner(zone.left + 1, zone.top + 1, zone)).toEqual({
        x: zone.left,
        y: zone.top,
      });
      expect(snapToCorner(zone.right - 1, zone.bottom - 1, zone)).toEqual({
        x: zone.right,
        y: zone.bottom,
      });
      expect(snapToCorner(zone.right - 1, zone.top + 1, zone)).toEqual({
        x: zone.right,
        y: zone.top,
      });
    });

    it('a drag can’t end over the name, the line under it or the caption', () => {
      const textTop = 600;
      // Dropped anywhere on the post, even right on the caption…
      for (const [x, y] of [
        [0, 0],
        [200, 650],
        [400, 800],
        [-80, 9999],
      ]) {
        const held = clampToZone(x, y, zone);
        const rest = snapToCorner(held.x, held.y, zone);
        // …it is never over the text while held, and rests a gap above it.
        expect(held.y + PIP_H).toBeLessThanOrEqual(textTop - 12);
        expect(rest.y + PIP_H).toBeLessThanOrEqual(textTop - 12);
      }
    });

    it('squeezed to one row, every drop rests on that row', () => {
      const tight = zoneAt(300);
      expect(snapToCorner(10, 0, tight).y).toBe(tight.bottom);
      expect(snapToCorner(10, 700, tight).y).toBe(tight.bottom);
    });
  });
});
