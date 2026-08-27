import { Navigate, Route, Routes } from 'react-router-dom';
import Layout from './components/Layout.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import Spinner from './components/Spinner.jsx';
import { HOME_ROUTE, ROLES, useAuth } from './context/AuthContext.jsx';

import LoginPage from './pages/LoginPage.jsx';
import RegisterPage from './pages/RegisterPage.jsx';
import UpdatePasswordPage from './pages/UpdatePasswordPage.jsx';

import AdminDashboard from './pages/admin/AdminDashboard.jsx';
import AdminUsersPage from './pages/admin/AdminUsersPage.jsx';
import AdminUserDetailPage from './pages/admin/AdminUserDetailPage.jsx';
import AdminStoresPage from './pages/admin/AdminStoresPage.jsx';
import AddUserPage from './pages/admin/AddUserPage.jsx';
import AddStorePage from './pages/admin/AddStorePage.jsx';

import StoresPage from './pages/user/StoresPage.jsx';
import OwnerDashboard from './pages/owner/OwnerDashboard.jsx';

/** Sends "/" to whichever landing page matches the signed-in role. */
function RoleHome() {
  const { user, loading } = useAuth();
  if (loading) return <Spinner label="Checking your session" />;
  return <Navigate to={user ? HOME_ROUTE[user.role] : '/login'} replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />

      <Route
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route path="/" element={<RoleHome />} />
        <Route path="/account/password" element={<UpdatePasswordPage />} />

        {/* System Administrator */}
        <Route
          path="/admin"
          element={
            <ProtectedRoute roles={[ROLES.ADMIN]}>
              <AdminDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/users"
          element={
            <ProtectedRoute roles={[ROLES.ADMIN]}>
              <AdminUsersPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/users/new"
          element={
            <ProtectedRoute roles={[ROLES.ADMIN]}>
              <AddUserPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/users/:id"
          element={
            <ProtectedRoute roles={[ROLES.ADMIN]}>
              <AdminUserDetailPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/stores"
          element={
            <ProtectedRoute roles={[ROLES.ADMIN]}>
              <AdminStoresPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/stores/new"
          element={
            <ProtectedRoute roles={[ROLES.ADMIN]}>
              <AddStorePage />
            </ProtectedRoute>
          }
        />

        {/* Normal User */}
        <Route
          path="/stores"
          element={
            <ProtectedRoute roles={[ROLES.USER]}>
              <StoresPage />
            </ProtectedRoute>
          }
        />

        {/* Store Owner */}
        <Route
          path="/owner"
          element={
            <ProtectedRoute roles={[ROLES.OWNER]}>
              <OwnerDashboard />
            </ProtectedRoute>
          }
        />
      </Route>

      <Route path="*" element={<RoleHome />} />
    </Routes>
  );
}
