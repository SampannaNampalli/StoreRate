/**
 * Client-side mirror of the server rules in backend/src/validators/index.js.
 * The server stays the source of truth; this only gives immediate feedback.
 */
export const PASSWORD_PATTERN = /^(?=.*[A-Z])(?=.*[!@#$%^&*(),.?":{}|<>_\-+=[\]\\/~`';])\S{8,16}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const validators = {
  name: (value = '') => {
    const trimmed = value.trim();
    if (trimmed.length < 20) return 'Name must be at least 20 characters';
    if (trimmed.length > 60) return 'Name must be at most 60 characters';
    return null;
  },

  email: (value = '') => {
    if (!value.trim()) return 'Email is required';
    if (!EMAIL_PATTERN.test(value.trim())) return 'Enter a valid email address';
    return null;
  },

  address: (value = '') => (value.length > 400 ? 'Address must be at most 400 characters' : null),

  password: (value = '') => {
    if (value.length < 8 || value.length > 16) return 'Password must be 8 to 16 characters';
    if (!PASSWORD_PATTERN.test(value)) {
      return 'Password must include at least one uppercase letter and one special character';
    }
    return null;
  },

  required: (label) => (value = '') => (String(value).trim() ? null : `${label} is required`),
};

/** Runs a `{ field: validatorFn }` map over a form's values. */
export function runValidation(values, schema) {
  const errors = {};
  for (const [field, validate] of Object.entries(schema)) {
    const message = validate(values[field]);
    if (message) errors[field] = message;
  }
  return errors;
}
