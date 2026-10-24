export function ratingToStars(rating?: number | null): number {
  if (!rating || rating <= 0) return 0;
  return Math.max(1, Math.min(5, Math.round(rating / 20)));
}

export function starsToRating(stars: number): number | null {
  if (!Number.isFinite(stars) || stars <= 0) return null;
  return Math.max(1, Math.min(5, Math.round(stars))) * 20;
}
