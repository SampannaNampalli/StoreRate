import { Link } from 'react-router-dom';
import Alert from '../../components/Alert.jsx';
import DataTable from '../../components/DataTable.jsx';
import FilterField from '../../components/FilterField.jsx';
import Pagination from '../../components/Pagination.jsx';
import PageHeader from '../../components/PageHeader.jsx';
import StarRating from '../../components/StarRating.jsx';
import { useListing } from '../../hooks/useListing.js';
import { formatRating } from '../../utils/labels.js';

const INITIAL_FILTERS = { name: '', email: '', address: '' };

export default function AdminStoresPage() {
  const listing = useListing('/admin/stores', { filters: INITIAL_FILTERS, sortBy: 'name' });

  const columns = [
    // Widths sized so a store name, an email and an owner name each sit on one
    // line. Address is the only column allowed to wrap, so a taller row always
    // means one thing: a long address.
    { key: 'name', label: 'Name', width: '24%' },
    { key: 'email', label: 'Email', width: '23%' },
    {
      key: 'address',
      label: 'Address',
      width: '21%',
      render: (row) => <span className="cell-clamp">{row.address || '—'}</span>,
    },
    {
      key: 'owner',
      label: 'Owner',
      sortable: false,
      width: '22%',
      render: (row) => row.owner_name || <span className="muted">Unassigned</span>,
    },
    {
      key: 'rating',
      label: 'Rating',
      align: 'right',
      width: '10%',
      render: (row) => (
        <span className="rating-cell">
          <StarRating value={Number(row.average_rating) || 0} size="sm" />
          <strong>{formatRating(row.average_rating)}</strong>
          <span className="rating-cell__count">({row.rating_count})</span>
        </span>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Stores"
        subtitle="All registered stores with their overall rating."
        actions={
          <Link to="/admin/stores/new" className="btn btn--primary">
            Add store
          </Link>
        }
      />

      <div className="filters">
        <FilterField label="Name">
          {(props) => (
            <input
              {...props}
              className="input"
              value={listing.filters.name}
              onChange={(e) => listing.setFilter('name', e.target.value)}
            />
          )}
        </FilterField>
        <FilterField label="Email">
          {(props) => (
            <input
              {...props}
              className="input"
              value={listing.filters.email}
              onChange={(e) => listing.setFilter('email', e.target.value)}
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

      <Alert>{listing.error}</Alert>

      <div className="card card--flush">
        <DataTable
          columns={columns}
          rows={listing.data}
          sort={listing.sort}
          onSort={listing.toggleSort}
          loading={listing.loading}
          emptyMessage="No stores match these filters."
        />
        <Pagination pagination={listing.pagination} onChange={listing.setPage} />
      </div>
    </>
  );
}
