import { describe, it, expect } from 'vitest';
import { ratingToStars, starsToRating } from './rating';

describe('star rating conversion', () => {
  it('converts stored 0-100 ratings into 0-5 stars', () => {
    expect(ratingToStars(null)).toBe(0);
    expect(ratingToStars(undefined)).toBe(0);
    expect(ratingToStars(0)).toBe(0);
    expect(ratingToStars(20)).toBe(1);
    expect(ratingToStars(60)).toBe(3);
    expect(ratingToStars(100)).toBe(5);
  });

  it('rounds intermediate ratings to the nearest star', () => {
    expect(ratingToStars(49)).toBe(2);
    expect(ratingToStars(51)).toBe(3);
  });

  it('converts stars back to stored ratings and clears at zero', () => {
    expect(starsToRating(1)).toBe(20);
    expect(starsToRating(4)).toBe(80);
    expect(starsToRating(5)).toBe(100);
    expect(starsToRating(0)).toBeNull();
    expect(starsToRating(-2)).toBeNull();
  });

  it('clamps out-of-range values', () => {
    expect(ratingToStars(180)).toBe(5);
    expect(starsToRating(12)).toBe(100);
  });
});
