import { useState } from 'react';
import Alert from '../components/Alert.jsx';
import FormField from '../components/FormField.jsx';
import PageHeader from '../components/PageHeader.jsx';
import { api, parseApiError, tokenStore } from '../api/client.js';
import { runValidation, validators } from '../utils/validation.js';

const EMPTY = { currentPassword: '', newPassword: '', confirmPassword: '' };

/** Available to all three roles - the spec requires it for each of them. */
export default function UpdatePasswordPage() {
  const [values, setValues] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [success, setSuccess] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const update = (field) => (event) => {
    setValues((current) => ({ ...current, [field]: event.target.value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    const found = runValidation(values, {
      currentPassword: validators.required('Current password'),
      newPassword: validators.password,
    });
    if (values.newPassword !== values.confirmPassword) {
      found.confirmPassword = 'Passwords do not match';
    }

    setErrors(found);
    if (Object.keys(found).length > 0) return;

    setSubmitting(true);
    setFormError('');
    setSuccess('');
    try {
      const { data } = await api.put('/auth/password', {
        currentPassword: values.currentPassword,
        newPassword: values.newPassword,
      });
      // Changing the password revokes every token issued before it, including
      // the one this request was made with. The API returns a replacement so
      // the person who made the change is not signed out by their own action.
      if (data.token) tokenStore.set(data.token);
      setSuccess(`${data.message} Any other device signed in to this account has been signed out.`);
      setValues(EMPTY);
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
      <PageHeader title="Update password" subtitle="Choose a new password for your account." />

      <div className="card card--narrow">
        <Alert onDismiss={() => setFormError('')}>{formError}</Alert>
        <Alert tone="success" onDismiss={() => setSuccess('')}>
          {success}
        </Alert>

        <form onSubmit={handleSubmit} noValidate>
          <FormField label="Current password" error={errors.currentPassword} required>
            {(props) => (
              <input
                {...props}
                type="password"
                className="input"
                autoComplete="current-password"
                value={values.currentPassword}
                onChange={update('currentPassword')}
              />
            )}
          </FormField>

          <FormField
            label="New password"
            error={errors.newPassword}
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
                value={values.newPassword}
                onChange={update('newPassword')}
              />
            )}
          </FormField>

          <FormField label="Confirm new password" error={errors.confirmPassword} required>
            {(props) => (
              <input
                {...props}
                type="password"
                className="input"
                autoComplete="new-password"
                maxLength={16}
                value={values.confirmPassword}
                onChange={update('confirmPassword')}
              />
            )}
          </FormField>

          <button type="submit" className="btn btn--primary" disabled={submitting}>
            {submitting ? 'Updating…' : 'Update password'}
          </button>
        </form>
      </div>
    </>
  );
}
