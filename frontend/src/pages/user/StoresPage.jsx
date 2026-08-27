import { useState } from 'react';
import Alert from '../../components/Alert.jsx';
import DataTable from '../../components/DataTable.jsx';
import FilterField from '../../components/FilterField.jsx';
import Pagination from '../../components/Pagination.jsx';
import PageHeader from '../../components/PageHeader.jsx';
import StarRating from '../../components/StarRating.jsx';
import { api, parseApiError } from '../../api/client.js';
import { useListing } from '../../hooks/useListing.js';
import { formatRating } from '../../utils/labels.js';

const INITIAL_FILTERS = { name: '', address: '' };

export default function StoresPage() {
  const listing = useListing('/stores', { filters: INITIAL_FILTERS, sortBy: 'name' });

  // Ratings just submitted, merged over the fetched rows so the table updates
  // instantly instead of waiting on a full refetch.
  const [overrides, setOverrides] = useState({});
  const [pendingId, setPendingId] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const rows = listing.data.map((store) => ({ ...store, ...(overrides[store.id] || {}) }));

  const submitRating = async (store, value) => {
    setPendingId(store.id);
    setError('');
    try {
      const { data } = await api.put(`/stores/${store.id}/rating`, { rating: value });
      setOverrides((current) => ({
        ...current,
        [store.id]: {
          my_rating: data.rating.value,
          average_rating: data.store.average_rating,
          rating_count: data.store.rating_count,
        },
      }));
      setNotice(
        store.my_rating
          ? `Your rating for ${store.name} was updated to ${value}.`
          : `Thanks! You rated ${store.name} ${value} out of 5.`,
      );
    } catch (err) {
      setError(parseApiError(err).message);
    } finally {
      setPendingId(null);
    }
  };

  const clearRating = async (store) => {
    setPendingId(store.id);
    setError('');
    try {
      await api.delete(`/stores/${store.id}/rating`);
      listing.refresh();
      setOverrides((current) => {
        const next = { ...current };
        delete next[store.id];
        return next;
      });
      setNotice(`Your rating for ${store.name} was removed.`);
    } catch (err) {
      setError(parseApiError(err).message);
    } finally {
      setPendingId(null);
    }
  };

  const columns = [
    {
      key: 'name',
      label: 'Store name',
      render: (row) => <span className="store-name">{row.name}</span>,
    },
    {
      key: 'address',
      label: 'Address',
      render: (row) => <span className="cell-clamp">{row.address || '—'}</span>,
    },
    {
      key: 'rating',
      label: 'Overall rating',
      render: (row) => (
        <span className="rating-cell">
          <StarRating value={Number(row.average_rating) || 0} size="sm" />
          <strong>{formatRating(row.average_rating)}</strong>
          <span className="rating-cell__count">({row.rating_count})</span>
        </span>
      ),
    },
    {
      key: 'myRating',
      label: 'Your rating',
      render: (row) => (
        <div className="my-rating">
          <StarRating
            value={row.my_rating || 0}
            onChange={(value) => submitRating(row, value)}
            disabled={pendingId === row.id}
            label={`Rate ${row.name}`}
          />
          <span className="my-rating__meta">
            {row.my_rating ? (
              <>
                <strong>{row.my_rating}/5</strong>
                <button type="button" className="link-btn" onClick={() => clearRating(row)}>
                  Remove
                </button>
              </>
            ) : (
              <span className="muted">Not rated yet</span>
            )}
          </span>
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Stores"
        subtitle="Browse registered stores, then submit or change your rating out of 5."
      />

      <div className="filters">
        <FilterField label="Store name">
          {(props) => (
            <input
              {...props}
              className="input"
              value={listing.filters.name}
              onChange={(e) => listing.setFilter('name', e.target.value)}
            />
          )}
        </FilterField>
        <FilterField label="Address">
          {(props) => (
            <input
              {...props}
              className="input"
              value={listing.filters.address}
              onChange={(e) => listing.setFilter('address', e.target.value)}
            />
          )}
        </FilterField>
        <button
          type="button"
          className="btn btn--ghost"
          onClick={listing.resetFilters}
          disabled={!listing.hasActiveFilters}
        >
          Clear
        </button>
      </div>

      <Alert onDismiss={() => setError('')}>{error || listing.error}</Alert>
      <Alert tone="success" onDismiss={() => setNotice('')}>
        {notice}
      </Alert>

      <div className="card card--flush">
        <DataTable
          columns={columns}
          rows={rows}
          sort={listing.sort}
          onSort={listing.toggleSort}
          loading={listing.loading}
          emptyMessage="No stores match your search."
        />
        <Pagination pagination={listing.pagination} onChange={listing.setPage} />
      </div>
    </>
  );
}
