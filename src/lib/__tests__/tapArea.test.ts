import { tapSlop, TAP_AREA } from '@/lib/tapArea';

describe('tap areas', () => {
  it('Apple wants 44 points, Google 48', () => {
    expect(TAP_AREA.ios).toBe(44);
    expect(TAP_AREA.android).toBe(48);
  });

  it('grows a 36-point pill to 44 with 4 on every side', () => {
    expect(tapSlop(36, 44)).toEqual({ top: 4, bottom: 4, left: 4, right: 4 });
  });

  it('grows a 22-point icon to 44 with 11 on every side', () => {
    expect(tapSlop(22, 44)).toEqual({ top: 11, bottom: 11, left: 11, right: 11 });
  });

  it('adds nothing to something already big enough', () => {
    expect(tapSlop(52, 44)).toEqual({ top: 0, bottom: 0, left: 0, right: 0 });
  });
});
