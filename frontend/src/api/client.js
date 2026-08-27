import axios from 'axios';

const TOKEN_KEY = 'storerate.token';

export const tokenStore = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (token) => localStorage.setItem(TOKEN_KEY, token),
  clear: () => localStorage.removeItem(TOKEN_KEY),
};

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
});

api.interceptors.request.use((config) => {
  const token = tokenStore.get();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

/** Notifies AuthContext when the server rejects our token so the UI can log out. */
let onUnauthorized = () => {};
export const setUnauthorizedHandler = (fn) => {
  onUnauthorized = fn;
};

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 && tokenStore.get()) {
      tokenStore.clear();
      onUnauthorized();
    }
    return Promise.reject(error);
  },
);

/**
 * Flattens an axios error into `{ message, fieldErrors }`, matching the shape
 * the API returns for validation failures.
 */
export function parseApiError(error) {
  const data = error?.response?.data;
  const fieldErrors = {};

  if (Array.isArray(data?.errors)) {
    for (const item of data.errors) {
      if (item.field && !fieldErrors[item.field]) fieldErrors[item.field] = item.message;
    }
  }

  return {
    message: data?.message || error?.message || 'Something went wrong. Please try again.',
    fieldErrors,
  };
}
