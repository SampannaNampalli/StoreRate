import { useState } from 'react';
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
  password: validators.password,
};

const EMPTY = { name: '', email: '', address: '', password: '', role: 'USER' };

export default function AddUserPage() {
  const navigate = useNavigate();
  const [values, setValues] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

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
      const { data } = await api.post('/admin/users', values);
      navigate(`/admin/users/${data.user.id}`, { replace: true });
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
      <PageHeader title="Add user" subtitle={<Link to="/admin/users">← Back to all users</Link>} />

      <div className="card card--narrow">
        <Alert onDismiss={() => setFormError('')}>{formError}</Alert>

        <form onSubmit={handleSubmit} noValidate>
          <FormField
            label="Full name"
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

          <FormField label="Email" error={errors.email} required>
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
            label="Password"
            error={errors.password}
            hint="8–16 characters, with at least one uppercase letter and one special character"
            required
          >
            {(props) => (
              <input
                {...props}
                type="password"
                className="input"
                autoComplete="new-password"
                maxLength={16}
                value={values.password}
                onChange={update('password')}
              />
            )}
          </FormField>

          <FormField label="Role" error={errors.role} required>
            {(props) => (
              <select {...props} className="input" value={values.role} onChange={update('role')}>
                <option value="USER">Normal User</option>
                <option value="OWNER">Store Owner</option>
                <option value="ADMIN">System Administrator</option>
              </select>
            )}
          </FormField>

          <div className="form-actions">
            <button type="submit" className="btn btn--primary" disabled={submitting}>
              {submitting ? 'Creating…' : 'Create user'}
            </button>
            <button type="button" className="btn btn--ghost" onClick={() => navigate('/admin/users')}>
              Cancel
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
