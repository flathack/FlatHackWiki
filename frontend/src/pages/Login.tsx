import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { API_BASE, authApi } from '../api/client';
import { useAuthStore } from '../context/auth.store';

export default function LoginPage() {
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [oidcConfig, setOidcConfig] = useState<{
    enabled: boolean;
    providerName: string;
    loginUrl: string | null;
  } | null>(null);
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
    const loginUrl = oidcConfig?.loginUrl;
    if (!loginUrl) return;

    const returnTo = new URLSearchParams(window.location.search).get('returnTo') || '/';
    const separator = loginUrl.includes('?') ? '&' : '?';
    window.location.href = `${API_BASE}${loginUrl}${separator}returnTo=${encodeURIComponent(returnTo)}`;
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 px-4">
      <div className="bg-white p-8 rounded-xl shadow-lg w-full max-w-md">
        <h1 className="text-2xl font-bold mb-6 text-center">FlatHacksWiki</h1>

        <h2 className="text-xl font-semibold mb-4">
          {isRegister ? 'Konto erstellen' : 'Anmelden'}
        </h2>

        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
            {error}
          </div>
        )}

        {oidcConfig?.enabled && oidcConfig.loginUrl && (
          <div className="mb-5">
            <button type="button" className="btn btn-primary w-full" onClick={handleOidcLogin}>
              Mit {oidcConfig.providerName} anmelden
            </button>
            <div className="my-4 flex items-center gap-3 text-xs uppercase tracking-wide text-gray-400">
              <span className="h-px flex-1 bg-gray-200" />
              <span>oder lokal</span>
              <span className="h-px flex-1 bg-gray-200" />
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {isRegister && (
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

        <div className="mt-4 text-center">
          <button
            onClick={() => setIsRegister(!isRegister)}
            className="text-blue-600 hover:text-blue-800 text-sm"
          >
            {isRegister ? 'Du hast bereits ein Konto? Jetzt anmelden' : 'Noch kein Konto? Jetzt registrieren'}
          </button>
        </div>
      </div>
    </div>
  );
}
