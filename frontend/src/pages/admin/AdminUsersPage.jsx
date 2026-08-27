import { Link, useNavigate } from 'react-router-dom';
import Alert from '../../components/Alert.jsx';
import DataTable from '../../components/DataTable.jsx';
import FilterField from '../../components/FilterField.jsx';
import Pagination from '../../components/Pagination.jsx';
import PageHeader from '../../components/PageHeader.jsx';
import { useListing } from '../../hooks/useListing.js';
import { ROLE_LABEL } from '../../utils/labels.js';

const INITIAL_FILTERS = { name: '', email: '', address: '', role: '' };

export default function AdminUsersPage() {
  const navigate = useNavigate();
  const listing = useListing('/admin/users', { filters: INITIAL_FILTERS, sortBy: 'name' });

  const columns = [
    { key: 'name', label: 'Name' },
    { key: 'email', label: 'Email' },
    {
      key: 'address',
      label: 'Address',
      render: (row) => <span className="cell-clamp">{row.address || '—'}</span>,
    },
    {
      key: 'role',
      label: 'Role',
      render: (row) => <span className={`badge badge--${row.role.toLowerCase()}`}>{ROLE_LABEL[row.role]}</span>,
    },
    {
      key: 'rating',
      label: 'Rating',
      sortable: false,
      align: 'right',
      render: (row) => (row.rating === null || row.rating === undefined ? '—' : row.rating.toFixed(2)),
    },
  ];

  return (
    <>
      <PageHeader
        title="Users"
        subtitle="Every normal user, store owner and administrator on the platform."
        actions={
          <Link to="/admin/users/new" className="btn btn--primary">
            Add user
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
        <FilterField label="Role">
          {(props) => (
            <select
              {...props}
              className="input"
              value={listing.filters.role}
              onChange={(e) => listing.setFilter('role', e.target.value)}
            >
              <option value="">All roles</option>
              <option value="ADMIN">System Administrator</option>
              <option value="USER">Normal User</option>
              <option value="OWNER">Store Owner</option>
            </select>
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
          emptyMessage="No users match these filters."
          onRowClick={(row) => navigate(`/admin/users/${row.id}`)}
        />
        <Pagination pagination={listing.pagination} onChange={listing.setPage} />
      </div>
    </>
  );
}
