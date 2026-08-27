import { Navigate, useLocation } from 'react-router-dom';
import { HOME_ROUTE, useAuth } from '../context/AuthContext.jsx';
import Spinner from './Spinner.jsx';

/**
 * Gate for authenticated routes. `roles` restricts the route further; a signed-in
 * user hitting a route for another role is redirected to their own home page
 * rather than shown a dead end.
 */
export default function ProtectedRoute({ roles, children }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <Spinner label="Checking your session" />;
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to={HOME_ROUTE[user.role]} replace />;

  return children;
}
