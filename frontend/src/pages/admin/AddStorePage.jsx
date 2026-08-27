import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Alert from '../../components/Alert.jsx';
import FormField from '../../components/FormField.jsx';
import PageHeader from '../../components/PageHeader.jsx';
import { api, parseApiError } from '../../api/client.js';
import { runValidation, validators } from '../../utils/validation.js';

const SCHEMA = {
  name: validators.name,
  email: validators.email,
  address: validators.address,
};

const EMPTY = { name: '', email: '', address: '', ownerId: '' };

export default function AddStorePage() {
  const navigate = useNavigate();
  const [values, setValues] = useState(EMPTY);
  const [owners, setOwners] = useState([]);
  const [ownersTotal, setOwnersTotal] = useState(0);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // The owners endpoint is paginated and caps `limit` at 100 — ask for more and
  // the request is rejected outright, which left this form claiming no owners
  // existed. Take the maximum page, and keep the total so the hint below can say
  // when the list has been cut short instead of silently hiding accounts.
  useEffect(() => {
    api
      .get('/admin/owners', { params: { limit: 100 } })
      .then(({ data }) => {
        setOwners(data.data);
        setOwnersTotal(data.pagination?.total ?? data.data.length);
      })
      .catch(() => {
        setOwners([]);
        setOwnersTotal(0);
      });
  }, []);

  const update = (field) => (event) => {
    setValues((current) => ({ ...current, [field]: event.target.value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const found = runValidation(values, SCHEMA);
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    setSubmitting(true);
    setFormError('');
    try {
      await api.post('/admin/stores', { ...values, ownerId: values.ownerId || null });
      navigate('/admin/stores', { replace: true });
    } catch (err) {
      const { message, fieldErrors } = parseApiError(err);
      setFormError(message);
      setErrors(fieldErrors);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <PageHeader title="Add store" subtitle={<Link to="/admin/stores">← Back to all stores</Link>} />

      <div className="card card--narrow">
        <Alert onDismiss={() => setFormError('')}>{formError}</Alert>

        <form onSubmit={handleSubmit} noValidate>
          <FormField
            label="Store name"
            error={errors.name}
            hint={`Between 20 and 60 characters — ${values.name.trim().length}/60 used`}
            required
          >
            {(props) => (
              <input
                {...props}
                type="text"
                className="input"
                maxLength={60}
                value={values.name}
                onChange={update('name')}
              />
            )}
          </FormField>

          <FormField label="Store email" error={errors.email} required>
            {(props) => (
              <input {...props} type="email" className="input" value={values.email} onChange={update('email')} />
            )}
          </FormField>

          <FormField
            label="Address"
            error={errors.address}
            hint={`Up to 400 characters — ${values.address.length}/400 used`}
          >
            {(props) => (
              <textarea
                {...props}
                className="input input--textarea"
                rows={3}
                maxLength={400}
                value={values.address}
                onChange={update('address')}
              />
            )}
          </FormField>

          <FormField
            label="Store owner"
            error={errors.ownerId}
            hint={
              ownersTotal > owners.length
                ? `Showing ${owners.length} of ${ownersTotal} store owners. Create the store, then reassign it if the one you need is missing.`
                : owners.length
                  ? 'Assigning an owner lets them see this store on their dashboard.'
                  : 'No store owners exist yet — create one from Add user first.'
            }
          >
            {(props) => (
              <select {...props} className="input" value={values.ownerId} onChange={update('ownerId')}>
                <option value="">Unassigned</option>
                {owners.map((owner) => (
                  <option key={owner.id} value={owner.id}>
                    {owner.name} ({owner.email})
                  </option>
                ))}
              </select>
            )}
          </FormField>

          <div className="form-actions">
            <button type="submit" className="btn btn--primary" disabled={submitting}>
              {submitting ? 'Creating…' : 'Create store'}
            </button>
            <button type="button" className="btn btn--ghost" onClick={() => navigate('/admin/stores')}>
              Cancel
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
