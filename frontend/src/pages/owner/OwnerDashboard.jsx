import { useCallback, useEffect, useState } from 'react';
import Alert from '../../components/Alert.jsx';
import DataTable from '../../components/DataTable.jsx';
import PageHeader from '../../components/PageHeader.jsx';
import Pagination from '../../components/Pagination.jsx';
import Spinner from '../../components/Spinner.jsx';
import StarRating from '../../components/StarRating.jsx';
import { api, parseApiError } from '../../api/client.js';
import { formatDate, formatRating } from '../../utils/labels.js';

export default function OwnerDashboard() {
  const [payload, setPayload] = useState(null);
  const [storeId, setStoreId] = useState('');
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState({ sortBy: 'ratedAt', sortOrder: 'desc' });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    api
      .get('/owner/dashboard', {
        params: { ...sort, page, ...(storeId ? { storeId } : {}) },
        signal: controller.signal,
      })
      .then(({ data }) => {
        setPayload(data);
        setError('');
      })
      .catch((err) => {
        if (controller.signal.aborted || err.code === 'ERR_CANCELED') return;
        setError(parseApiError(err).message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [sort, storeId, page]);

  // Sorting or switching store re-orders the whole rater set, so the page the
  // user was on no longer means anything - go back to the first one.
  const toggleSort = useCallback((key) => {
    setPage(1);
    setSort((current) =>
      current.sortBy === key
        ? { sortBy: key, sortOrder: current.sortOrder === 'asc' ? 'desc' : 'asc' }
        : { sortBy: key, sortOrder: 'asc' },
    );
  }, []);

  const columns = [
    { key: 'name', label: 'User' },
    { key: 'email', label: 'Email' },
    {
      key: 'address',
      label: 'Address',
      render: (row) => <span className="cell-clamp">{row.address || '—'}</span>,
    },
    { key: 'store', label: 'Store', sortable: false, render: (row) => row.store_name },
    {
      key: 'rating',
      label: 'Rating',
      align: 'right',
      render: (row) => (
        <span className="rating-cell">
          <StarRating value={row.rating} size="sm" />
          <strong>{row.rating}/5</strong>
        </span>
      ),
    },
    { key: 'ratedAt', label: 'Rated on', align: 'right', render: (row) => formatDate(row.rated_at) },
  ];

  if (!payload && loading) return <Spinner label="Loading your dashboard" />;

  return (
    <>
      <PageHeader
        title="Store owner dashboard"
        subtitle="Your average rating and everyone who has rated your stores."
      />

      <Alert>{error}</Alert>

      {payload && (
        <>
          <div className="stat-grid">
            <div className="stat stat--feature">
              <span className="stat__value">{formatRating(payload.overall.average_rating)}</span>
              <span className="stat__label">Average rating</span>
              <StarRating value={Number(payload.overall.average_rating) || 0} />
            </div>
            <div className="stat">
              <span className="stat__value">{payload.overall.rating_count}</span>
              <span className="stat__label">Ratings received</span>
              <span className="stat__hint">Across every store you own</span>
            </div>
            <div className="stat">
              <span className="stat__value">{payload.stores.length}</span>
              <span className="stat__label">Stores owned</span>
              <span className="stat__hint">Assigned to you by an administrator</span>
            </div>
          </div>

          {payload.stores.length === 0 ? (
            <div className="card">
              <p className="muted">
                No stores are assigned to your account yet. An administrator needs to create a store
                and set you as its owner.
              </p>
            </div>
          ) : (
            <>
              <div className="card">
                <h2 className="card__title">Your stores</h2>
                <ul className="store-list">
                  {payload.stores.map((store) => (
                    <li key={store.id} className="store-list__item">
                      <div>
                        <p className="store-list__name">{store.name}</p>
                        <p className="muted">{store.address || '—'}</p>
                      </div>
                      <div className="store-list__rating">
                        <StarRating value={Number(store.average_rating) || 0} size="sm" />
                        <span>
                          <strong>{formatRating(store.average_rating)}</strong>{' '}
                          <span className="muted">({store.rating_count} ratings)</span>
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="card card--flush">
                <div className="card__header">
                  <h2 className="card__title">Users who rated your stores</h2>
                  {payload.stores.length > 1 && (
                    <select
                      className="input input--compact"
                      value={storeId}
                      onChange={(e) => {
                        setPage(1);
                        setStoreId(e.target.value);
                      }}
                      aria-label="Filter by store"
                    >
                      <option value="">All stores</option>
                      {payload.stores.map((store) => (
                        <option key={store.id} value={store.id}>
                          {store.name}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
                <DataTable
                  columns={columns}
                  rows={payload.raters}
                  sort={sort}
                  onSort={toggleSort}
                  loading={loading}
                  rowKey={(row) => `${row.store_id}-${row.user_id}`}
                  emptyMessage="No one has rated your stores yet."
                />
                <Pagination pagination={payload.pagination} onChange={setPage} />
              </div>
            </>
          )}
        </>
      )}
    </>
  );
}
