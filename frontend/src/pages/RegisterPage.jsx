import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import Alert from '../components/Alert.jsx';
import AuthShell from '../components/AuthShell.jsx';
import FormField from '../components/FormField.jsx';
import { parseApiError } from '../api/client.js';
import { HOME_ROUTE, useAuth } from '../context/AuthContext.jsx';
import { runValidation, validators } from '../utils/validation.js';

const SCHEMA = {
  name: validators.name,
  email: validators.email,
  address: validators.address,
  password: validators.password,
};

const EMPTY = { name: '', email: '', address: '', password: '' };

export default function RegisterPage() {
  const { user, register } = useAuth();
  const navigate = useNavigate();
  const [values, setValues] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (user) return <Navigate to={HOME_ROUTE[user.role]} replace />;

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
      const created = await register(values);
      navigate(HOME_ROUTE[created.role], { replace: true });
    } catch (err) {
      const { message, fieldErrors } = parseApiError(err);
      setFormError(message);
      setErrors(fieldErrors);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthShell
      wide
      lede="Rate the shops you actually use."
      note="A normal-user account lets you browse every registered store and score it out of five. Change your rating whenever you like."
    >
      <>
        <div className="auth-card__head">
          <h1>Create your account</h1>
          <p>Sign up as a normal user.</p>
        </div>

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
                autoComplete="name"
                maxLength={60}
                value={values.name}
                onChange={update('name')}
              />
            )}
          </FormField>

          <FormField label="Email" error={errors.email} required>
            {(props) => (
              <input
                {...props}
                type="email"
                className="input"
                autoComplete="email"
                value={values.email}
                onChange={update('email')}
              />
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

          <button type="submit" className="btn btn--primary btn--block" disabled={submitting}>
            {submitting ? 'Creating account…' : 'Create account'}
          </button>
        </form>

        <p className="auth-card__foot">
          Already registered? <Link to="/login">Sign in</Link>
        </p>
      </>
    </AuthShell>
  );
}
