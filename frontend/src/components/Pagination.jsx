export default function Pagination({ pagination, onChange }) {
  if (!pagination || pagination.total === 0) return null;

  const { page, limit, total, totalPages } = pagination;
  const first = (page - 1) * limit + 1;
  const last = Math.min(page * limit, total);

  return (
    <div className="pagination">
      <span className="pagination__summary">
        Showing <strong>{first}</strong>–<strong>{last}</strong> of <strong>{total}</strong>
      </span>
      <div className="pagination__controls">
        <button
          type="button"
          className="btn btn--ghost btn--sm"
          onClick={() => onChange(page - 1)}
          disabled={page <= 1}
        >
          ← Previous
        </button>
        <span className="pagination__page">
          Page {page} of {totalPages || 1}
        </span>
        <button
          type="button"
          className="btn btn--ghost btn--sm"
          onClick={() => onChange(page + 1)}
          disabled={page >= totalPages}
        >
          Next →
        </button>
      </div>
    </div>
  );
}
