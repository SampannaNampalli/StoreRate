import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import Alert from '../components/Alert.jsx';
import AuthShell from '../components/AuthShell.jsx';
import FormField from '../components/FormField.jsx';
import { parseApiError } from '../api/client.js';
import { HOME_ROUTE, useAuth } from '../context/AuthContext.jsx';
import { runValidation, validators } from '../utils/validation.js';

const SCHEMA = {
  email: validators.email,
  password: validators.required('Password'),
};

export default function LoginPage() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [values, setValues] = useState({ email: '', password: '' });
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
      const signedIn = await login(values);
      navigate(HOME_ROUTE[signedIn.role], { replace: true });
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
      lede="Every store, scored out of five."
      note="StoreRate keeps one public number for each registered store, and every number is somebody's rating."
    >
      <>
        <div className="auth-card__head">
          <h1>Sign in</h1>
          <p>Use the email address you registered with.</p>
        </div>

        <Alert onDismiss={() => setFormError('')}>{formError}</Alert>

        <form onSubmit={handleSubmit} noValidate>
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

          <FormField label="Password" error={errors.password} required>
            {(props) => (
              <input
                {...props}
                type="password"
                className="input"
                autoComplete="current-password"
                value={values.password}
                onChange={update('password')}
              />
            )}
          </FormField>

          <button type="submit" className="btn btn--primary btn--block" disabled={submitting}>
            {submitting ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p className="auth-card__foot">
          New here? <Link to="/register">Create an account</Link>
        </p>
      </>
    </AuthShell>
  );
}
