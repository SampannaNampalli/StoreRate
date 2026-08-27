import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import Alert from '../../components/Alert.jsx';
import PageHeader from '../../components/PageHeader.jsx';
import Spinner from '../../components/Spinner.jsx';
import StarRating from '../../components/StarRating.jsx';
import { api, parseApiError } from '../../api/client.js';
import { formatDate, formatRating, ROLE_LABEL } from '../../utils/labels.js';

export default function AdminUserDetailPage() {
  const { id } = useParams();
  const [user, setUser] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .get(`/admin/users/${id}`)
      .then(({ data }) => setUser(data.user))
      .catch((err) => setError(parseApiError(err).message));
  }, [id]);

  return (
    <>
      <PageHeader
        title="User details"
        subtitle={<Link to="/admin/users">← Back to all users</Link>}
      />

      <Alert>{error}</Alert>
      {!user && !error && <Spinner label="Loading user" />}

      {user && (
        <>
          <div className="card">
            <dl className="detail-grid">
              <div>
                <dt>Name</dt>
                <dd>{user.name}</dd>
              </div>
              <div>
                <dt>Email</dt>
                <dd>{user.email}</dd>
              </div>
              <div>
                <dt>Role</dt>
                <dd>
                  <span className={`badge badge--${user.role.toLowerCase()}`}>{ROLE_LABEL[user.role]}</span>
                </dd>
              </div>
              <div>
                <dt>Member since</dt>
                <dd>{formatDate(user.created_at)}</dd>
              </div>
              <div className="detail-grid__wide">
                <dt>Address</dt>
                <dd>{user.address || '—'}</dd>
              </div>

              {/* Spec: a Store Owner's rating is shown alongside the usual fields. */}
              {user.role === 'OWNER' && (
                <div className="detail-grid__wide">
                  <dt>Rating</dt>
                  <dd className="detail-rating">
                    <StarRating value={Number(user.rating) || 0} />
                    <strong>{formatRating(user.rating)}</strong>
                    <span className="muted">average across owned stores</span>
                  </dd>
                </div>
              )}
            </dl>
          </div>

          {user.role === 'OWNER' && (
            <div className="card">
              <h2 className="card__title">Stores owned</h2>
              {user.stores?.length ? (
                <ul className="store-list">
                  {user.stores.map((store) => (
                    <li key={store.id} className="store-list__item">
                      <div>
                        <p className="store-list__name">{store.name}</p>
                        <p className="muted">{store.address || '—'}</p>
                      </div>
                      <div className="store-list__rating">
                        <StarRating value={Number(store.average_rating) || 0} size="sm" />
                        <span>
                          <strong>{formatRating(store.average_rating)}</strong>{' '}
                          <span className="muted">({store.rating_count})</span>
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="muted">This owner has no stores assigned yet.</p>
              )}
            </div>
          )}
        </>
      )}
    </>
  );
}
