import { useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import ThemeSelector from './ThemeSelector';
import { useAuthStore } from '../context/auth.store';
import { API_BASE, authApi } from '../api/client';

interface AppHeaderProps {
  title?: string;
  subtitle?: string;
  actions?: React.ReactNode;
  onOpenProfile?: () => void;
  onOpenWidgetLibrary?: () => void;
  editMode?: boolean;
  onToggleEditMode?: () => void;
}

export default function AppHeader({
  title = 'FlatHacksWiki',
  subtitle = 'Persoenlicher Arbeitsbereich fuer Wissen, Links und Mini-Anwendungen.',
  actions,
  onOpenProfile,
  onOpenWidgetLibrary,
  editMode,
  onToggleEditMode,
}: AppHeaderProps) {
  const { user, logout } = useAuthStore();
  const [menuOpen, setMenuOpen] = useState(false);
  const isAdmin = user?.globalRole === 'SUPER_ADMIN' || user?.globalRole === 'SYSTEM_ADMIN';

  const handleLogout = async () => {
    const refreshToken = useAuthStore.getState().refreshToken;
    let oidcLogoutUrl: string | null = null;

    try {
      const [{ data: oidcConfig }] = await Promise.all([
        authApi.oidcConfig(),
        refreshToken ? authApi.logout(refreshToken) : Promise.resolve(),
      ]);
      oidcLogoutUrl = oidcConfig.enabled ? oidcConfig.logoutUrl : null;
    } catch {
      // Local logout should still happen even if the server-side cleanup is unavailable.
    }

    logout();

    if (oidcLogoutUrl) {
      window.location.href = `${API_BASE}${oidcLogoutUrl}`;
      return;
    }

    window.location.href = '/login';
  };

  return (
    <header className="dashboard-topbar">
      <div className="dashboard-header-identity">
        <Link to="/" className="dashboard-brand">{title}</Link>
        <p className="dashboard-brand-copy">{subtitle}</p>
      </div>
      <button
        type="button"
        className={`dashboard-menu-button ${menuOpen ? 'active' : ''}`}
        aria-expanded={menuOpen}
        aria-controls="dashboard-main-navigation"
        onClick={() => setMenuOpen((current) => !current)}
      >
        <span />
        <span />
        <span />
      </button>
      <nav id="dashboard-main-navigation" className={`dashboard-topbar-actions ${menuOpen ? 'open' : ''}`} aria-label="Hauptnavigation">
        <div className="dashboard-primary-nav">
          <NavLink to="/" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`} onClick={() => setMenuOpen(false)} end>
            Dashboard
          </NavLink>
          <NavLink to="/bookmarks" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`} onClick={() => setMenuOpen(false)}>
            Lesezeichen
          </NavLink>
          <NavLink to="/mail" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`} onClick={() => setMenuOpen(false)}>
            Mail
          </NavLink>
          <NavLink to="/amazon-expenses" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`} onClick={() => setMenuOpen(false)}>
            Amazon
          </NavLink>
          <NavLink to="/calendar-contacts" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`} onClick={() => setMenuOpen(false)}>
            Kalender & Kontakte
          </NavLink>
          {isAdmin && (
            <NavLink to="/admin" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`} onClick={() => setMenuOpen(false)}>
              Admin
            </NavLink>
          )}
        </div>

        <div className="dashboard-utility-nav">
          <ThemeSelector />
          {onToggleEditMode && (
            <button className={`topbar-action-button ${editMode ? 'active' : ''}`} onClick={onToggleEditMode}>
              {editMode ? 'Layout beenden' : 'Layout'}
            </button>
          )}
          {onOpenWidgetLibrary && (
            <button className="topbar-action-button" onClick={onOpenWidgetLibrary}>
              Widget
            </button>
          )}
          {onOpenProfile && (
            <button className="topbar-action-button" onClick={onOpenProfile}>
              Profil
            </button>
          )}
          {actions}
          <button className="topbar-logout-button" onClick={handleLogout}>
            Abmelden
          </button>
        </div>
      </nav>
    </header>
  );
}
