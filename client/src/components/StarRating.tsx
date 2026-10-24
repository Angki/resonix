import React, { useState } from 'react';
import { Star } from 'lucide-react';
import { ratingToStars, starsToRating } from '../utils/rating';

interface StarRatingProps {
  rating?: number | null;
  onChange?: (rating: number | null) => void;
  size?: number;
  readOnly?: boolean;
  className?: string;
}

export const StarRating: React.FC<StarRatingProps> = ({
  rating,
  onChange,
  size = 14,
  readOnly = false,
  className = '',
}) => {
  const [hovered, setHovered] = useState<number | null>(null);
  const currentStars = ratingToStars(rating);
  const displayStars = hovered ?? currentStars;

  return (
    <div
      className={`flex items-center space-x-0.5 ${className}`}
      onMouseLeave={() => setHovered(null)}
      role="group"
      aria-label={`Rating: ${currentStars} of 5 stars`}
    >
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          disabled={readOnly}
          onClick={(event) => {
            event.stopPropagation();
            if (readOnly || !onChange) return;
            onChange(star === currentStars ? null : starsToRating(star));
          }}
          onMouseEnter={() => {
            if (!readOnly) setHovered(star);
          }}
          className={`p-0.5 transition ${readOnly ? 'cursor-default' : 'cursor-pointer hover:scale-110'}`}
          aria-label={star === currentStars ? `Clear rating (${star} stars)` : `Rate ${star} stars`}
          title={readOnly ? `${currentStars} / 5` : `Rate ${star} / 5`}
        >
          <Star
            size={size}
            className={
              star <= displayStars
                ? 'text-amber-400 fill-amber-400'
                : 'text-zinc-600 hover:text-amber-300'
            }
          />
        </button>
      ))}
    </div>
  );
};
