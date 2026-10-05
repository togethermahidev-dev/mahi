import { PIP_H, PIP_W, appHeaderHeight, clampToZone, pipZone, snapToCorner } from '../pip';

describe('draggable photo-in-photo', () => {
  const screen = { width: 400, height: 800 };

  it('the app header is the top inset plus its row and bottom padding', () => {
    expect(appHeaderHeight(60)).toBe(108);
    expect(appHeaderHeight(0)).toBe(48);
  });

  it('the safe zone keeps the small photo clear of the side buttons and the caption', () => {
    const zone = pipZone(screen, 228);
    expect(zone).toEqual({
      left: 8,
      right: 400 - PIP_W - 70,
      top: 228,
      bottom: 800 - 200 - PIP_H,
    });
  });

  it('a drag stays inside the safe zone', () => {
    const zone = pipZone(screen, 228);
    expect(clampToZone(-50, 5000, zone)).toEqual({ x: zone.left, y: zone.bottom });
    expect(clampToZone(9999, -10, zone)).toEqual({ x: zone.right, y: zone.top });
    expect(clampToZone(100, 300, zone)).toEqual({ x: 100, y: 300 });
  });

  it('on release it snaps to the nearest corner', () => {
    const zone = pipZone(screen, 228);
    expect(snapToCorner(zone.left + 1, zone.top + 1, zone)).toEqual({ x: zone.left, y: zone.top });
    expect(snapToCorner(zone.right - 1, zone.bottom - 1, zone)).toEqual({
      x: zone.right,
      y: zone.bottom,
    });
    expect(snapToCorner(zone.right - 1, zone.top + 1, zone)).toEqual({
      x: zone.right,
      y: zone.top,
    });
  });
});
