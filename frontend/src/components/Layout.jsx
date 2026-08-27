import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { ROLES, useAuth } from '../context/AuthContext.jsx';
import ErrorBoundary from './ErrorBoundary.jsx';

const NAV_BY_ROLE = {
  [ROLES.ADMIN]: [
    { to: '/admin', label: 'Dashboard', end: true },
    { to: '/admin/users', label: 'Users' },
    { to: '/admin/stores', label: 'Stores' },
  ],
  [ROLES.USER]: [{ to: '/stores', label: 'Stores' }],
  [ROLES.OWNER]: [{ to: '/owner', label: 'Dashboard' }],
};

const ROLE_LABEL = {
  [ROLES.ADMIN]: 'System Administrator',
  [ROLES.USER]: 'Normal User',
  [ROLES.OWNER]: 'Store Owner',
};

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const links = NAV_BY_ROLE[user.role] ?? [];

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar__inner">
          <div className="brand">
            <span className="brand__name">StoreRate</span>
            {/* Five segments — the rating meter, shrunk into the wordmark. */}
            <span className="brand__rule" aria-hidden="true">
              <span />
              <span />
              <span />
              <span />
              <span />
            </span>
          </div>

          <nav className="nav" aria-label="Main">
            {links.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                end={link.end}
                className={({ isActive }) => `nav__link${isActive ? ' is-active' : ''}`}
              >
                {link.label}
              </NavLink>
            ))}
            <NavLink
              to="/account/password"
              className={({ isActive }) => `nav__link${isActive ? ' is-active' : ''}`}
            >
              Password
            </NavLink>
          </nav>

          <div className="topbar__user">
            <div className="topbar__identity">
              <span className="topbar__name">{user.name}</span>
              <span className="badge badge--role">{ROLE_LABEL[user.role]}</span>
            </div>
            <button type="button" className="btn btn--ghost btn--sm" onClick={handleLogout}>
              Log out
            </button>
          </div>
        </div>
      </header>

      <main className="content">
        {/* A page that throws should not take the navigation down with it, so
            this boundary sits inside the shell. Keying it on the path clears a
            caught error as soon as the user navigates somewhere else. */}
        <ErrorBoundary key={location.pathname}>
          <Outlet />
        </ErrorBoundary>
      </main>
    </div>
  );
}
