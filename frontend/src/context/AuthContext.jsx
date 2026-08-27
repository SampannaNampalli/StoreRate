import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, setUnauthorizedHandler, tokenStore } from '../api/client.js';

export const ROLES = { ADMIN: 'ADMIN', USER: 'USER', OWNER: 'OWNER' };

/** Where each role lands after signing in. */
export const HOME_ROUTE = {
  [ROLES.ADMIN]: '/admin',
  [ROLES.USER]: '/stores',
  [ROLES.OWNER]: '/owner',
};

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const logout = useCallback(() => {
    tokenStore.clear();
    setUser(null);
  }, []);

  // A 401 from any request means the token is gone or stale - drop the session.
  useEffect(() => {
    setUnauthorizedHandler(() => setUser(null));
  }, []);

  // Restore the session on a hard reload.
  useEffect(() => {
    const token = tokenStore.get();
    if (!token) {
      setLoading(false);
      return;
    }
    api
      .get('/auth/me')
      .then(({ data }) => setUser(data.user))
      .catch(() => tokenStore.clear())
      .finally(() => setLoading(false));
  }, []);

  const authenticate = useCallback(async (path, payload) => {
    const { data } = await api.post(path, payload);
    tokenStore.set(data.token);
    setUser(data.user);
    return data.user;
  }, []);

  const value = useMemo(
    () => ({
      user,
      loading,
      isAuthenticated: Boolean(user),
      login: (credentials) => authenticate('/auth/login', credentials),
      register: (payload) => authenticate('/auth/register', payload),
      logout,
    }),
    [user, loading, authenticate, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside an AuthProvider');
  return context;
}
