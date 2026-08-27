export const ROLE_LABEL = {
  ADMIN: 'System Administrator',
  USER: 'Normal User',
  OWNER: 'Store Owner',
};

export function formatRating(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number === 0) return '—';
  return number.toFixed(2);
}

export function formatDate(value) {
  if (!value) return '—';
  return new Date(value).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}
