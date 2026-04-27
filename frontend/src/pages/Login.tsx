import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { API_BASE, authApi, type OidcPublicConfig } from '../api/client';
import { useAuthStore } from '../context/auth.store';

export default function LoginPage() {
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [oidcConfig, setOidcConfig] = useState<OidcPublicConfig | null>(null);
  const navigate = useNavigate();
  const { setAuth, setTokens } = useAuthStore();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const oidcAccess = params.get('oidc_access');
    const oidcRefresh = params.get('oidc_refresh');
    const returnTo = params.get('returnTo') || '/';

    if (!oidcAccess || !oidcRefresh) return;

    const completeOidcLogin = async () => {
      try {
        setTokens({ accessToken: oidcAccess, refreshToken: oidcRefresh });
        const me = await authApi.me();
        setAuth({ accessToken: oidcAccess, refreshToken: oidcRefresh, user: me.data });
        window.history.replaceState(null, '', '/login');
        navigate(returnTo.startsWith('/') ? returnTo : '/');
      } catch {
        setError('Zentrale Anmeldung war erfolgreich, aber das Wiki-Profil konnte nicht geladen werden.');
      }
    };

    void completeOidcLogin();
  }, [navigate, setAuth, setTokens]);

  useEffect(() => {
    authApi
      .oidcConfig()
      .then(({ data }) => setOidcConfig(data))
      .catch(() => setOidcConfig(null));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (!oidcConfig?.localLoginEnabled) {
        throw new Error('Lokale Anmeldung ist deaktiviert. Bitte nutze den zentralen Login.');
      }

      if (isRegister && !oidcConfig?.selfRegistrationEnabled) {
        throw new Error('Registrierung ist deaktiviert.');
      }

      if (isRegister) {
        const { data } = await authApi.register({ email, password, name });
        setAuth({ accessToken: data.accessToken, refreshToken: data.refreshToken, user: data.user });
        const me = await authApi.me();
        setAuth({ accessToken: data.accessToken, refreshToken: data.refreshToken, user: me.data });
      } else {
        const { data } = await authApi.login({ email, password });
        setAuth({ accessToken: data.accessToken, refreshToken: data.refreshToken, user: data.user });
        const me = await authApi.me();
        setAuth({ accessToken: data.accessToken, refreshToken: data.refreshToken, user: me.data });
      }
      navigate('/');
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Ein Fehler ist aufgetreten');
    } finally {
      setLoading(false);
    }
  };

  const handleOidcLogin = () => {
    const loginUrl = oidcConfig?.loginUrl || '/auth/oidc/login';

    const returnTo = new URLSearchParams(window.location.search).get('returnTo') || '/';
    const separator = loginUrl.includes('?') ? '&' : '?';
    window.location.href = `${API_BASE}${loginUrl}${separator}returnTo=${encodeURIComponent(returnTo)}`;
  };

  const oidcEnabled = oidcConfig?.enabled !== false;
  const oidcProviderName = oidcConfig?.providerName || 'FlathackID';
  const localLoginEnabled = oidcConfig?.localLoginEnabled ?? true;
  const selfRegistrationEnabled = oidcConfig?.selfRegistrationEnabled ?? true;

  return (
    <div className="login-page-shell">
      <div className="login-card">
        <h1 className="login-title">FlatHacksWiki</h1>

        {oidcEnabled && (
          <section className="login-sso-panel">
            <span>{oidcProviderName}</span>
            <h2>Zentral anmelden</h2>
            <button type="button" className="login-sso-button" onClick={handleOidcLogin}>
              Mit Benutzername und Passwort anmelden
            </button>
          </section>
        )}

        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
            {error}
          </div>
        )}

        {oidcEnabled && localLoginEnabled && (
          <div className="login-divider">
            <span />
            <em>Lokaler Zugang</em>
            <span />
          </div>
        )}

        {localLoginEnabled ? (
          <>
            <h2 className="login-local-title">
              {isRegister ? 'Lokales Konto erstellen' : 'Lokal mit E-Mail anmelden'}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              {isRegister && selfRegistrationEnabled && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="input"
                    placeholder="Dein Name"
                    required={isRegister}
                  />
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">E-Mail</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="input"
                  placeholder="du@example.com"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Passwort</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="input"
                  placeholder="Passwort"
                  required
                />
              </div>

              <button type="submit" className="btn btn-primary w-full" disabled={loading}>
                {loading ? 'Bitte warten...' : isRegister ? 'Registrieren' : 'Anmelden'}
              </button>
            </form>

            {selfRegistrationEnabled && (
              <div className="mt-4 text-center">
                <button
                  onClick={() => setIsRegister(!isRegister)}
                  className="text-blue-600 hover:text-blue-800 text-sm"
                >
                  {isRegister ? 'Du hast bereits ein Konto? Jetzt anmelden' : 'Noch kein Konto? Jetzt registrieren'}
                </button>
              </div>
            )}
          </>
        ) : (
          <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
            Lokale Anmeldung und Selbstregistrierung sind deaktiviert. Bitte nutze den zentralen OIDC-Login.
          </div>
        )}
      </div>
    </div>
  );
}
