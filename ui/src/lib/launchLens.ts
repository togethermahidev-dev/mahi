/** Six tessellating blades around a twisting hexagonal aperture. SVG drawing coordinates. */
export function lensBladePath(index: number, aperture: number, extent: number): string {
  'worklet';
  const step = Math.PI / 3;
  const twist = ((1 - aperture / extent) * Math.PI) / 5;
  const a = index * step + twist;
  const b = a + step;
  const sweep = step * 0.8;
  const point = (r: number, angle: number) => `${r * Math.cos(angle)},${r * Math.sin(angle)}`;
  // The outer arc is beyond every screen corner; shared inner edges avoid gaps.
  return `M${point(aperture, a)} L${point(extent, a + sweep)} A${extent},${extent} 0 0 1 ${point(extent, b + sweep)} L${point(aperture, b)} Z`;
}
