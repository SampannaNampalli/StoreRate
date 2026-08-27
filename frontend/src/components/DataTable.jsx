import Spinner from './Spinner.jsx';

/**
 * Sortable table shared by every listing screen.
 *
 * columns: [{ key, label, sortable, align, width, render(row) }]
 *
 * `width` is a CSS width applied to the header cell. Left to itself the browser
 * splits the table by content, which lets one long column squeeze its
 * neighbours into wrapping and makes row heights jump for no reason a reader
 * can see. Setting widths keeps wrapping confined to the column that earns it.
 * sort:    { sortBy, sortOrder }
 * onSort:  (key) => void  - toggles asc/desc for the clicked column
 */
export default function DataTable({
  columns,
  rows,
  sort,
  onSort,
  loading,
  emptyMessage = 'Nothing to show yet.',
  rowKey = (row) => row.id,
  onRowClick,
}) {
  // A drawn caret rather than a text arrow: the glyphs sat off-baseline and
  // changed size with the font. Neutral columns show the same caret, dimmed.
  const indicatorClass = (key) => {
    const ascending = sort?.sortBy === key && sort.sortOrder !== 'desc';
    return `th-sort__icon${ascending ? ' th-sort__icon--asc' : ''}`;
  };

  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            {columns.map((column) => {
              const sortable = column.sortable !== false && Boolean(onSort);
              const active = sort?.sortBy === column.key;
              return (
                <th
                  key={column.key}
                  className={column.align === 'right' ? 'is-right' : undefined}
                  style={column.width ? { width: column.width } : undefined}
                  aria-sort={active ? (sort.sortOrder === 'desc' ? 'descending' : 'ascending') : 'none'}
                >
                  {sortable ? (
                    <button
                      type="button"
                      className={`th-sort${active ? ' is-active' : ''}`}
                      onClick={() => onSort(column.key)}
                    >
                      {column.label}
                      <span className={indicatorClass(column.key)} aria-hidden="true" />
                    </button>
                  ) : (
                    column.label
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {loading && (
            <tr>
              <td colSpan={columns.length} className="table__state">
                <Spinner />
              </td>
            </tr>
          )}

          {!loading && rows.length === 0 && (
            <tr>
              <td colSpan={columns.length} className="table__state">
                {emptyMessage}
              </td>
            </tr>
          )}

          {!loading &&
            rows.map((row) => (
              <tr
                key={rowKey(row)}
                className={onRowClick ? 'is-clickable' : undefined}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
              >
                {columns.map((column) => (
                  <td key={column.key} className={column.align === 'right' ? 'is-right' : undefined}>
                    {column.render ? column.render(row) : row[column.key]}
                  </td>
                ))}
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  );
}
