import { useId } from 'react';

/**
 * A labelled control in a filter row.
 *
 * These fields used to carry their name in the placeholder alone, which
 * disappeared the moment anyone typed — leaving a row of filled boxes with
 * nothing to say which column each one narrowed. The label is set like a
 * table heading on purpose: it names the column the filter acts on.
 */
export default function FilterField({ label, children }) {
  const id = useId();

  return (
    <div className="filter-field">
      <label className="filter-field__label" htmlFor={id}>
        {label}
      </label>
      {children({ id })}
    </div>
  );
}
