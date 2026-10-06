import { carouselIndex, carouselPositionLabel } from '@/lib/carousel';

describe('carousel', () => {
  it('picks the nearest card using its width and gap', () => {
    expect(carouselIndex(0, 300, 12, 3)).toBe(0);
    expect(carouselIndex(156, 300, 12, 3)).toBe(1);
    expect(carouselIndex(312, 300, 12, 3)).toBe(1);
    expect(carouselIndex(624, 300, 12, 3)).toBe(2);
  });

  it('keeps overscroll and invalid measurements inside the carousel', () => {
    expect(carouselIndex(-80, 300, 12, 3)).toBe(0);
    expect(carouselIndex(900, 300, 12, 3)).toBe(2);
    expect(carouselIndex(100, 0, 12, 3)).toBe(0);
    expect(carouselIndex(100, 300, 12, 0)).toBe(0);
  });

  it('describes the selected card in plain words', () => {
    expect(carouselPositionLabel(1, 3)).toBe('Card 2 of 3');
  });
});
