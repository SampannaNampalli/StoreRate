import { useState } from 'react';

const VALUES = [1, 2, 3, 4, 5];

/** Fraction of segment `star` that a score of `value` fills, as a percentage. */
function fillFor(value, star) {
  return `${Math.min(Math.max(value - (star - 1), 0), 1) * 100}%`;
}

/**
 * The rating meter: five segments filled in proportion to the score.
 *
 * Read-only display when `onChange` is omitted, otherwise an interactive
 * 1-5 picker used to submit and modify a rating. The picker keeps five
 * discrete targets; only the mark differs from the display form.
 *
 * A partial fill is exact, so 4.14 and 4.80 are visibly different — which
 * is the whole reason this replaced five glyphs.
 */
export default function StarRating({ value = 0, onChange, disabled, size = 'md', label }) {
  const [hovered, setHovered] = useState(0);
  const interactive = Boolean(onChange);
  const shown = hovered || value || 0;

  if (!interactive) {
    return (
      <span
        className={`rating rating--${size}${value ? '' : ' rating--empty'}`}
        title={value ? `${value} out of 5` : 'Not rated'}
      >
        <span className="rating__meter" aria-hidden="true">
          {VALUES.map((star) => (
            <span key={star} className="rating__seg" style={{ '--fill': fillFor(value, star) }} />
          ))}
        </span>
      </span>
    );
  }

  return (
    <span
      className={`rating rating--${size} rating--interactive`}
      role="radiogroup"
      aria-label={label || 'Rating'}
      onMouseLeave={() => setHovered(0)}
    >
      <span className="rating__meter">
        {VALUES.map((star) => (
          <button
            key={star}
            type="button"
            role="radio"
            aria-checked={value === star}
            aria-label={`${star} out of 5`}
            className={`rating__seg${star <= shown ? ' is-on' : ''}`}
            disabled={disabled}
            onMouseEnter={() => setHovered(star)}
            onFocus={() => setHovered(star)}
            onBlur={() => setHovered(0)}
            onClick={() => onChange(star)}
          />
        ))}
      </span>
    </span>
  );
}
