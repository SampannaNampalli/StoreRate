import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Alert from '../../components/Alert.jsx';
import PageHeader from '../../components/PageHeader.jsx';
import Spinner from '../../components/Spinner.jsx';
import { api, parseApiError } from '../../api/client.js';

// The three totals the brief asks this dashboard to display. Two of them lead
// somewhere — there is a listing behind users and behind stores — and the third
// does not, so only those two carry a way onward. The asymmetry is the point:
// it shows which figures you can open.
const CARDS = [
  {
    key: 'totalUsers',
    label: 'Total users',
    hint: 'Admins, normal users and store owners',
    to: '/admin/users',
    go: 'View all users',
  },
  {
    key: 'totalStores',
    label: 'Total stores',
    hint: 'Stores registered on the platform',
    to: '/admin/stores',
    go: 'View all stores',
  },
  { key: 'totalRatings', label: 'Total ratings', hint: 'Ratings submitted across all stores', to: null },
];

export default function AdminDashboard() {
  const [stats, setStats] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .get('/admin/dashboard')
      .then(({ data }) => setStats(data))
      .catch((err) => setError(parseApiError(err).message));
  }, []);

  return (
    <>
      <PageHeader
        title="Administrator dashboard"
        subtitle="Platform totals at a glance."
        actions={
          <>
            <Link to="/admin/users/new" className="btn btn--ghost">
              Add user
            </Link>
            <Link to="/admin/stores/new" className="btn btn--primary">
              Add store
            </Link>
          </>
        }
      />

      <Alert onDismiss={() => setError('')}>{error}</Alert>

      {!stats && !error && <Spinner label="Loading totals" />}

      {stats && (
        <div className="stat-grid stat-grid--hero">
          {CARDS.map((card) => {
            const body = (
              <>
                <span className="stat__value">{stats[card.key].toLocaleString()}</span>
                <span className="stat__label">{card.label}</span>
                <span className="stat__hint">{card.hint}</span>
                {card.go && (
                  <span className="stat__go">
                    {card.go}
                    <span aria-hidden="true">→</span>
                  </span>
                )}
              </>
            );
            return card.to ? (
              <Link key={card.key} to={card.to} className="stat stat--link">
                {body}
              </Link>
            ) : (
              <div key={card.key} className="stat">
                {body}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
