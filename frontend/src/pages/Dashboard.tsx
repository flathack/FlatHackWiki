import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { authApi, spacesApi, type Space } from '../api/client';
import { useAuthStore } from '../context/auth.store';
import {
  useDashboardStore,
  type DashboardQuickLink,
  type DashboardWidgetId,
  type WebSearchProvider,
} from '../context/dashboard.store';

const widgetLabels: Record<DashboardWidgetId, string> = {
  clock: 'Uhr',
  search: 'Wiki-Suche',
  webSearch: 'Websuche',
  weather: 'Wetter',
  quickLinks: 'Lesezeichen',
  favorites: 'Favorisierte Bereiche',
  notes: 'Notizen',
  stats: 'Statistiken',
  spaces: 'Alle Bereiche',
};

const defaultSubtitle =
  'Baue dir eine persönliche Startseite für das Wiki mit Widgets, Lesezeichen, favorisierten Bereichen und Notizen.';

const searchProviders: Record<WebSearchProvider, { label: string; buildUrl: (query: string) => string }> = {
  duckduckgo: {
    label: 'DuckDuckGo',
    buildUrl: (query) => `https://duckduckgo.com/?q=${encodeURIComponent(query)}`,
  },
  google: {
    label: 'Google',
    buildUrl: (query) => `https://www.google.com/search?q=${encodeURIComponent(query)}`,
  },
  brave: {
    label: 'Brave',
    buildUrl: (query) => `https://search.brave.com/search?q=${encodeURIComponent(query)}`,
  },
  bing: {
    label: 'Bing',
    buildUrl: (query) => `https://www.bing.com/search?q=${encodeURIComponent(query)}`,
  },
};

interface WeatherSnapshot {
  location: string;
  temperatureC: string;
  description: string;
  humidity: string;
  windKph: string;
}

function formatTime(now: Date) {
  return now.toLocaleTimeString('de-DE', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDate(now: Date) {
  return now.toLocaleDateString('de-DE', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

function getGreeting(now: Date, name?: string) {
  const hour = now.getHours();
  const trimmedName = name?.trim();
  const suffix = trimmedName ? `, ${trimmedName}!` : '!';

  if (hour < 11) return `Guten Morgen${suffix}`;
  if (hour < 17) return `Guten Mittag${suffix}`;
  return `Guten Abend${suffix}`;
}

export default function Dashboard() {
  const { user, logout, updateUser } = useAuthStore();
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [webSearchQuery, setWebSearchQuery] = useState('');
  const [now, setNow] = useState(new Date());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [weather, setWeather] = useState<WeatherSnapshot | null>(null);
  const [weatherLoading, setWeatherLoading] = useState(false);
  const [weatherError, setWeatherError] = useState('');
  const [profileName, setProfileName] = useState('');
  const [profileSubtitle, setProfileSubtitle] = useState(defaultSubtitle);
  const [showProfileSubtitle, setShowProfileSubtitle] = useState(true);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileError, setProfileError] = useState('');
  const [profileSuccess, setProfileSuccess] = useState('');
  const navigate = useNavigate();
  const ensureConfig = useDashboardStore((state) => state.ensureConfig);
  const updateConfig = useDashboardStore((state) => state.updateConfig);
  const resetConfig = useDashboardStore((state) => state.resetConfig);
  const isAdmin = user?.globalRole === 'SUPER_ADMIN' || user?.globalRole === 'SYSTEM_ADMIN';
  const config = useDashboardStore((state) => (user ? state.configsByUser[user.id] : undefined));

  useEffect(() => {
    if (user?.id) {
      ensureConfig(user.id, isAdmin);
    }
  }, [user?.id, isAdmin, ensureConfig]);

  useEffect(() => {
    loadSpaces();
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    setProfileName(user?.displayName || user?.name || '');
    setProfileSubtitle(user?.dashboardSubtitle || defaultSubtitle);
    setShowProfileSubtitle(user?.showDashboardSubtitle ?? true);
  }, [user?.displayName, user?.name, user?.dashboardSubtitle, user?.showDashboardSubtitle]);

  useEffect(() => {
    const city = config?.weatherCity?.trim();
    if (!city) {
      setWeather(null);
      setWeatherError('');
      return;
    }

    let active = true;

    const loadWeather = async () => {
      setWeatherLoading(true);
      setWeatherError('');
      try {
        const response = await fetch(`https://wttr.in/${encodeURIComponent(city)}?format=j1`);
        if (!response.ok) {
          throw new Error('Wetterdienst nicht verfügbar');
        }

        const data = await response.json();
        const current = data?.current_condition?.[0];
        const area = data?.nearest_area?.[0];
        if (!current) {
          throw new Error('Keine Wetterdaten erhalten');
        }

        if (!active) return;

        setWeather({
          location: area?.areaName?.[0]?.value || city,
          temperatureC: current.temp_C || '-',
          description: current.weatherDesc?.[0]?.value || 'Unbekannt',
          humidity: current.humidity || '-',
          windKph: current.windspeedKmph || '-',
        });
      } catch (err: any) {
        if (!active) return;
        setWeather(null);
        setWeatherError(err.message || 'Wetter konnte nicht geladen werden');
      } finally {
        if (active) {
          setWeatherLoading(false);
        }
      }
    };

    loadWeather();
    const timer = window.setInterval(loadWeather, 15 * 60 * 1000);

    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [config?.weatherCity]);

  const loadSpaces = async () => {
    try {
      const { data } = await spacesApi.list();
      setSpaces(data);
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Bereiche konnten nicht geladen werden');
    } finally {
      setLoading(false);
    }
  };

  const activeConfig = useMemo(
    () =>
      config ?? {
        notes: '',
        weatherCity: 'Berlin',
        searchProvider: 'duckduckgo' as WebSearchProvider,
        widgetOrder: [
          'clock',
          'search',
          'webSearch',
          'weather',
          'quickLinks',
          'favorites',
          'notes',
          'stats',
          'spaces',
        ] as DashboardWidgetId[],
        hiddenWidgets: [],
        favoriteSpaceKeys: [],
        quickLinks: [],
      },
    [config]
  );

  const greetingName = (user?.displayName || user?.name || '').trim();
  const greeting = getGreeting(now, greetingName || undefined);
  const shouldShowSubtitle = user?.showDashboardSubtitle ?? true;
  const subtitleText = user?.dashboardSubtitle || defaultSubtitle;
  const favoriteSpaces = spaces.filter((space) => activeConfig.favoriteSpaceKeys.includes(space.key));
  const visibleWidgets = activeConfig.widgetOrder.filter((widgetId) => !activeConfig.hiddenWidgets.includes(widgetId));

  const runSearch = () => {
    if (!searchQuery.trim()) return;
    navigate(`/search?q=${encodeURIComponent(searchQuery.trim())}`);
  };

  const runWebSearch = () => {
    const query = webSearchQuery.trim();
    if (!query) return;
    const url = searchProviders[activeConfig.searchProvider].buildUrl(query);
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const saveProfile = async () => {
    setProfileError('');
    setProfileSuccess('');

    const trimmedName = profileName.trim();
    if (!trimmedName) {
      setProfileError('Bitte gib einen Namen für dein Profil ein.');
      return;
    }

    setProfileSaving(true);
    try {
      const { data } = await authApi.updateMe({
        displayName: trimmedName,
        dashboardSubtitle: profileSubtitle.trim() || null,
        showDashboardSubtitle: showProfileSubtitle,
      });

      updateUser({
        name: data.name,
        displayName: data.displayName,
        dashboardSubtitle: data.dashboardSubtitle,
        showDashboardSubtitle: data.showDashboardSubtitle,
      });
      setProfileSuccess('Profil gespeichert. Deine Begrüßung wurde aktualisiert.');
    } catch (err: any) {
      setProfileError(err.response?.data?.error?.message || 'Profil konnte nicht gespeichert werden');
    } finally {
      setProfileSaving(false);
    }
  };

  const updateQuickLink = (id: string, patch: Partial<DashboardQuickLink>) => {
    if (!user?.id) return;
    updateConfig(user.id, (current) => ({
      ...current,
      quickLinks: current.quickLinks.map((link) => (link.id === id ? { ...link, ...patch } : link)),
    }));
  };

  const addQuickLink = () => {
    if (!user?.id) return;
    updateConfig(user.id, (current) => ({
      ...current,
      quickLinks: [
        ...current.quickLinks,
        {
          id: `link-${Date.now()}`,
          icon: 'LINK',
          name: 'Neuer Link',
          url: 'https://',
        },
      ],
    }));
  };

  const removeQuickLink = (id: string) => {
    if (!user?.id) return;
    updateConfig(user.id, (current) => ({
      ...current,
      quickLinks: current.quickLinks.filter((link) => link.id !== id),
    }));
  };

  const toggleWidget = (widgetId: DashboardWidgetId) => {
    if (!user?.id) return;
    updateConfig(user.id, (current) => {
      const isHidden = current.hiddenWidgets.includes(widgetId);
      return {
        ...current,
        hiddenWidgets: isHidden
          ? current.hiddenWidgets.filter((id) => id !== widgetId)
          : [...current.hiddenWidgets, widgetId],
      };
    });
  };

  const moveWidget = (widgetId: DashboardWidgetId, direction: -1 | 1) => {
    if (!user?.id) return;
    updateConfig(user.id, (current) => {
      const index = current.widgetOrder.indexOf(widgetId);
      const target = index + direction;
      if (index === -1 || target < 0 || target >= current.widgetOrder.length) {
        return current;
      }

      const next = [...current.widgetOrder];
      [next[index], next[target]] = [next[target], next[index]];
      return { ...current, widgetOrder: next };
    });
  };

  const toggleFavoriteSpace = (spaceKey: string) => {
    if (!user?.id) return;
    updateConfig(user.id, (current) => {
      const exists = current.favoriteSpaceKeys.includes(spaceKey);
      return {
        ...current,
        favoriteSpaceKeys: exists
          ? current.favoriteSpaceKeys.filter((key) => key !== spaceKey)
          : [...current.favoriteSpaceKeys, spaceKey],
      };
    });
  };

  const renderInternalOrExternalLink = (link: DashboardQuickLink) => {
    const classes =
      'rounded-2xl border border-gray-200 bg-white px-4 py-4 shadow-sm transition hover:-translate-y-0.5 hover:border-blue-400 hover:shadow-md';

    if (link.url.startsWith('/')) {
      return (
        <Link key={link.id} to={link.url} className={classes}>
          <div className="text-lg font-semibold tracking-[0.2em] text-blue-600">{link.icon}</div>
          <div className="mt-3 font-semibold text-gray-900">{link.name}</div>
          <div className="mt-1 text-sm text-gray-500">{link.url}</div>
        </Link>
      );
    }

    return (
      <a key={link.id} href={link.url} target="_blank" rel="noreferrer" className={classes}>
        <div className="text-lg font-semibold tracking-[0.2em] text-blue-600">{link.icon}</div>
        <div className="mt-3 font-semibold text-gray-900">{link.name}</div>
        <div className="mt-1 truncate text-sm text-gray-500">{link.url}</div>
      </a>
    );
  };

  const renderWidget = (widgetId: DashboardWidgetId) => {
    switch (widgetId) {
      case 'clock':
        return (
          <section key={widgetId} className="rounded-3xl border border-sky-200 bg-gradient-to-br from-sky-100 via-white to-cyan-50 p-6 shadow-sm lg:col-span-2">
            <div className="text-sm font-semibold uppercase tracking-[0.2em] text-sky-700">Heute</div>
            <div className="mt-4 text-4xl font-bold text-slate-900 sm:text-5xl">{formatTime(now)}</div>
            <div className="mt-3 text-base text-slate-600 sm:text-lg">{formatDate(now)}</div>
          </section>
        );
      case 'search':
        return (
          <section key={widgetId} className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
            <div className="text-sm font-semibold uppercase tracking-[0.2em] text-gray-500">Wiki-Suche</div>
            <h3 className="mt-3 text-xl font-semibold text-gray-900">Schnell im FlatHacksWiki starten</h3>
            <div className="mt-4 flex flex-col gap-3 sm:flex-row">
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && runSearch()}
                className="input"
                placeholder="Bereiche, Seiten und Inhalte durchsuchen..."
              />
              <button onClick={runSearch} className="btn btn-primary whitespace-nowrap sm:min-w-28">
                Suchen
              </button>
            </div>
          </section>
        );
      case 'webSearch':
        return (
          <section key={widgetId} className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="text-sm font-semibold uppercase tracking-[0.2em] text-gray-500">Websuche</div>
                <h3 className="mt-3 text-xl font-semibold text-gray-900">Das Web mit deinem Suchanbieter durchsuchen</h3>
              </div>
              <span className="w-fit rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-gray-600">
                {searchProviders[activeConfig.searchProvider].label}
              </span>
            </div>
            <div className="mt-4 flex flex-col gap-3 sm:flex-row">
              <input
                value={webSearchQuery}
                onChange={(e) => setWebSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && runWebSearch()}
                className="input"
                placeholder="Im Web suchen..."
              />
              <button onClick={runWebSearch} className="btn btn-primary whitespace-nowrap sm:min-w-28">
                Öffnen
              </button>
            </div>
          </section>
        );
      case 'weather':
        return (
          <section key={widgetId} className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="text-sm font-semibold uppercase tracking-[0.2em] text-gray-500">Wetter</div>
                <h3 className="mt-3 text-xl font-semibold text-gray-900">{activeConfig.weatherCity || 'Ort auswählen'}</h3>
              </div>
              <button onClick={() => setSettingsOpen(true)} className="btn btn-secondary w-full sm:w-auto">
                Ändern
              </button>
            </div>
            {weatherLoading ? (
              <p className="mt-6 text-gray-500">Wetter wird geladen...</p>
            ) : weatherError ? (
              <div className="mt-6 rounded-2xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">
                {weatherError}
              </div>
            ) : weather ? (
              <div className="mt-6 grid gap-3">
                <div className="rounded-2xl bg-gradient-to-br from-sky-100 via-cyan-50 to-white px-5 py-5">
                  <div className="text-sm text-sky-700">{weather.location}</div>
                  <div className="mt-2 text-4xl font-bold text-slate-900">{weather.temperatureC} C</div>
                  <div className="mt-2 text-slate-600">{weather.description}</div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl bg-gray-50 px-4 py-3">
                    <div className="text-sm text-gray-500">Luftfeuchtigkeit</div>
                    <div className="mt-1 text-lg font-semibold text-gray-900">{weather.humidity}%</div>
                  </div>
                  <div className="rounded-2xl bg-gray-50 px-4 py-3">
                    <div className="text-sm text-gray-500">Wind</div>
                    <div className="mt-1 text-lg font-semibold text-gray-900">{weather.windKph} km/h</div>
                  </div>
                </div>
              </div>
            ) : (
              <p className="mt-6 text-gray-500">Lege in den Dashboard-Einstellungen einen Ort fest, damit hier das Wetter angezeigt wird.</p>
            )}
          </section>
        );
      case 'quickLinks':
        return (
          <section key={widgetId} className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm lg:col-span-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="text-sm font-semibold uppercase tracking-[0.2em] text-gray-500">Lesezeichen</div>
                <h3 className="mt-2 text-xl font-semibold text-gray-900">Deine angehefteten Schnellzugriffe</h3>
              </div>
              <button onClick={() => setSettingsOpen(true)} className="btn btn-secondary w-full sm:w-auto">
                Konfigurieren
              </button>
            </div>
            {activeConfig.quickLinks.length === 0 ? (
              <p className="mt-6 text-gray-500">Noch keine Lesezeichen vorhanden. Füge in den Dashboard-Einstellungen welche hinzu.</p>
            ) : (
              <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {activeConfig.quickLinks.map(renderInternalOrExternalLink)}
              </div>
            )}
          </section>
        );
      case 'favorites':
        return (
          <section key={widgetId} className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm lg:col-span-2">
            <div className="text-sm font-semibold uppercase tracking-[0.2em] text-gray-500">Favoriten</div>
            <h3 className="mt-2 text-xl font-semibold text-gray-900">Bereiche, die du immer im Blick behalten willst</h3>
            {favoriteSpaces.length === 0 ? (
              <p className="mt-6 text-gray-500">Wähle in den Dashboard-Einstellungen deine bevorzugten Bereiche aus.</p>
            ) : (
              <div className="mt-6 grid gap-4 sm:grid-cols-2">
                {favoriteSpaces.map((space) => (
                  <Link
                    key={space.id}
                    to={`/spaces/${space.key}`}
                    className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 transition hover:border-amber-400"
                  >
                    <div className="flex items-center justify-between gap-4">
                      <span className="font-semibold text-slate-900">{space.name}</span>
                      <span className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-700">Gespeichert</span>
                    </div>
                    <div className="mt-2 text-sm text-slate-600">{space.description || 'Noch keine Beschreibung vorhanden'}</div>
                  </Link>
                ))}
              </div>
            )}
          </section>
        );
      case 'notes':
        return (
          <section key={widgetId} className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
            <div className="text-sm font-semibold uppercase tracking-[0.2em] text-gray-500">Notizen</div>
            <h3 className="mt-2 text-xl font-semibold text-gray-900">Persönlicher Notizblock</h3>
            <textarea
              value={activeConfig.notes}
              onChange={(e) => user?.id && updateConfig(user.id, (current) => ({ ...current, notes: e.target.value }))}
              className="mt-5 min-h-48 w-full rounded-2xl border border-gray-300 bg-gray-50 p-4 text-sm outline-none focus:border-blue-500"
              placeholder="Notiere Erinnerungen, Suchanfragen oder Seitenideen..."
            />
          </section>
        );
      case 'stats':
        return (
          <section key={widgetId} className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
            <div className="text-sm font-semibold uppercase tracking-[0.2em] text-gray-500">Statistiken</div>
            <h3 className="mt-2 text-xl font-semibold text-gray-900">Überblick über den Arbeitsbereich</h3>
            <div className="mt-6 grid gap-3">
              <div className="rounded-2xl bg-gray-50 px-4 py-3">
                <div className="text-sm text-gray-500">Bereiche gesamt</div>
                <div className="mt-1 text-2xl font-bold text-gray-900">{spaces.length}</div>
              </div>
              <div className="rounded-2xl bg-gray-50 px-4 py-3">
                <div className="text-sm text-gray-500">Öffentliche Bereiche</div>
                <div className="mt-1 text-2xl font-bold text-gray-900">
                  {spaces.filter((space) => space.visibility === 'PUBLIC').length}
                </div>
              </div>
              <div className="rounded-2xl bg-gray-50 px-4 py-3">
                <div className="text-sm text-gray-500">Favorisierte Bereiche</div>
                <div className="mt-1 text-2xl font-bold text-gray-900">{favoriteSpaces.length}</div>
              </div>
            </div>
          </section>
        );
      case 'spaces':
        return (
          <section key={widgetId} className="lg:col-span-3">
            <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="text-sm font-semibold uppercase tracking-[0.2em] text-gray-500">Bereiche</div>
                <h2 className="mt-2 text-3xl font-bold text-gray-900">Deine Bereiche</h2>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <button onClick={() => setSettingsOpen(true)} className="btn btn-secondary w-full sm:w-auto">
                  Dashboard anpassen
                </button>
                <Link to="/spaces/new" className="btn btn-primary text-center">
                  + Bereich erstellen
                </Link>
              </div>
            </div>

            {loading ? (
              <div className="flex items-center justify-center rounded-3xl border border-gray-200 bg-white py-12 shadow-sm">
                <div className="text-gray-500">Bereiche werden geladen...</div>
              </div>
            ) : error ? (
              <div className="rounded-3xl border border-red-300 bg-red-50 px-4 py-3 text-red-700 shadow-sm">
                {error}
                <button onClick={loadSpaces} className="ml-4 underline">
                  Erneut versuchen
                </button>
              </div>
            ) : spaces.length === 0 ? (
              <div className="rounded-3xl border border-gray-200 bg-white py-12 text-center shadow-sm">
                <div className="mb-4 text-sm font-semibold uppercase tracking-[0.35em] text-gray-400">Leer</div>
                <p className="text-gray-500">Noch keine Bereiche vorhanden. Erstelle deinen ersten FlatHacksWiki-Bereich.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
                {spaces.map((space) => {
                  const starred = activeConfig.favoriteSpaceKeys.includes(space.key);
                  return (
                    <div
                      key={space.id}
                      className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:shadow-md"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <Link to={`/spaces/${space.key}`} className="flex-1">
                          <h3 className="text-lg font-semibold text-gray-900">{space.name}</h3>
                          <p className="mt-1 font-mono text-sm text-gray-500">{space.key}</p>
                        </Link>
                        <button
                          type="button"
                          onClick={() => toggleFavoriteSpace(space.key)}
                          className={`rounded-full px-3 py-2 text-sm ${
                            starred
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                          }`}
                        >
                          {starred ? 'Gespeichert' : 'Speichern'}
                        </button>
                      </div>
                      {space.description && (
                        <p className="mt-4 line-clamp-3 text-sm text-gray-600">{space.description}</p>
                      )}
                      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 text-sm text-gray-500">
                        <span>Besitzer: {space.owner?.name || 'Unbekannt'}</span>
                        <span className="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-700">
                          {space.visibility}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        );
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white/90 shadow-sm backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="text-xs font-semibold uppercase tracking-[0.25em] text-sky-600">FlatHacksWiki</div>
            <p className="mt-1 text-sm text-gray-500">Eine persönliche Startseite für deine Wissensbasis.</p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
            {isAdmin && (
              <Link to="/admin" className="text-sm text-gray-600 hover:text-gray-900">
                Admin
              </Link>
            )}
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-gray-700">{user?.displayName || user?.name}</span>
              <span className="rounded-full bg-blue-100 px-2 py-1 text-xs text-blue-800">{user?.globalRole}</span>
            </div>
            <button onClick={() => setSettingsOpen(true)} className="btn btn-secondary w-full sm:w-auto">
              Dashboard-Einstellungen
            </button>
            <button onClick={logout} className="text-sm text-red-600 hover:text-red-800">
              Abmelden
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
        <section className="mb-8 rounded-[28px] border border-slate-200 bg-gradient-to-br from-slate-950 via-sky-950 to-cyan-900 px-5 py-8 text-white shadow-xl sm:px-8 sm:py-10">
          <div className="max-w-3xl">
            <div className="text-sm font-semibold uppercase tracking-[0.3em] text-cyan-300">Persönlicher Arbeitsbereich</div>
            <h1 className="mt-4 text-3xl font-bold leading-tight sm:text-4xl lg:text-5xl">{greeting}</h1>
            {shouldShowSubtitle && subtitleText && (
              <p className="mt-4 text-base text-sky-100/90 sm:text-lg">{subtitleText}</p>
            )}
            {!greetingName && (
              <p className="mt-4 text-sm text-cyan-200">
                Trage deinen Namen in den Profileinstellungen ein, um diese Begrüßung zu personalisieren.
              </p>
            )}
          </div>
        </section>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">{visibleWidgets.map(renderWidget)}</div>
      </main>

      {settingsOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/50 p-0 sm:items-center sm:p-6">
          <div className="max-h-[92vh] w-full overflow-y-auto rounded-t-[28px] border border-gray-200 bg-white p-5 shadow-2xl sm:max-w-5xl sm:rounded-[28px] sm:p-8">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="text-sm font-semibold uppercase tracking-[0.25em] text-gray-500">Dashboard-Einstellungen</div>
                <h2 className="mt-2 text-2xl font-bold text-gray-900 sm:text-3xl">Profil und Arbeitsbereich</h2>
                <p className="mt-2 text-gray-500">
                  Passe deinen Namen und Untertitel getrennt von Widgets, Lesezeichen und Layout deines Dashboards an.
                </p>
              </div>
              <button onClick={() => setSettingsOpen(false)} className="btn btn-secondary w-full sm:w-auto">
                Schließen
              </button>
            </div>

            <div className="mt-8 grid gap-8 lg:grid-cols-2">
              <section className="rounded-3xl border border-gray-200 p-6 lg:col-span-2">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">Profil</h3>
                    <p className="mt-1 text-sm text-gray-500">
                      Hier steuerst du die persönliche Begrüßung und den Untertitel auf deiner Startseite.
                    </p>
                  </div>
                  <button onClick={saveProfile} className="btn btn-primary w-full sm:w-auto" disabled={profileSaving}>
                    {profileSaving ? 'Speichert...' : 'Profil speichern'}
                  </button>
                </div>

                <div className="mt-5 grid gap-4 lg:grid-cols-2">
                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700">Profilname</label>
                    <input
                      className="input"
                      value={profileName}
                      onChange={(e) => setProfileName(e.target.value)}
                      placeholder="Steven"
                    />
                    <p className="mt-2 text-xs text-gray-500">
                      Wird für Begrüßungen wie "Guten Morgen, Steven!" verwendet
                    </p>
                  </div>
                  <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                    <div className="flex items-start gap-3">
                      <input
                        id="show-subtitle"
                        type="checkbox"
                        checked={showProfileSubtitle}
                        onChange={(e) => setShowProfileSubtitle(e.target.checked)}
                        className="mt-1 h-4 w-4"
                      />
                      <label htmlFor="show-subtitle" className="text-sm text-gray-700">
                        <span className="block font-medium text-gray-900">Untertitel im Dashboard anzeigen</span>
                        <span className="mt-1 block text-gray-500">
                          Deaktiviere dies, wenn der Kopfbereich bewusst minimal bleiben soll.
                        </span>
                      </label>
                    </div>
                  </div>
                </div>

                <div className="mt-4">
                  <label className="mb-2 block text-sm font-medium text-gray-700">Untertitel</label>
                  <textarea
                    className="input min-h-28"
                    value={profileSubtitle}
                    onChange={(e) => setProfileSubtitle(e.target.value)}
                    placeholder={defaultSubtitle}
                  />
                </div>

                {profileError && (
                  <div className="mt-4 rounded-2xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">
                    {profileError}
                  </div>
                )}
                {profileSuccess && (
                  <div className="mt-4 rounded-2xl border border-green-300 bg-green-50 px-4 py-3 text-sm text-green-700">
                    {profileSuccess}
                  </div>
                )}
              </section>

              <section className="rounded-3xl border border-gray-200 p-6">
                <h3 className="text-lg font-semibold text-gray-900">Persönliche Werkzeuge</h3>
                <div className="mt-4 space-y-4">
                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700">Wetter-Ort</label>
                    <input
                      className="input"
                      value={activeConfig.weatherCity}
                      onChange={(e) =>
                        user?.id &&
                        updateConfig(user.id, (current) => ({ ...current, weatherCity: e.target.value }))
                      }
                      placeholder="Berlin"
                    />
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700">Suchanbieter für das Web</label>
                    <select
                      className="input"
                      value={activeConfig.searchProvider}
                      onChange={(e) =>
                        user?.id &&
                        updateConfig(user.id, (current) => ({
                          ...current,
                          searchProvider: e.target.value as WebSearchProvider,
                        }))
                      }
                    >
                      {Object.entries(searchProviders).map(([value, provider]) => (
                        <option key={value} value={value}>
                          {provider.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </section>

              <section className="rounded-3xl border border-gray-200 p-6">
                <h3 className="text-lg font-semibold text-gray-900">Widgets</h3>
                <div className="mt-4 space-y-3">
                  {activeConfig.widgetOrder.map((widgetId, index) => {
                    const hidden = activeConfig.hiddenWidgets.includes(widgetId);
                    return (
                      <div
                        key={widgetId}
                        className="flex flex-col gap-3 rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div className="flex items-center gap-3">
                          <input type="checkbox" checked={!hidden} onChange={() => toggleWidget(widgetId)} />
                          <span className="font-medium text-gray-900">{widgetLabels[widgetId]}</span>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => moveWidget(widgetId, -1)}
                            disabled={index === 0}
                            className="rounded-lg border border-gray-300 px-3 py-2 text-sm disabled:opacity-40"
                          >
                            Hoch
                          </button>
                          <button
                            onClick={() => moveWidget(widgetId, 1)}
                            disabled={index === activeConfig.widgetOrder.length - 1}
                            className="rounded-lg border border-gray-300 px-3 py-2 text-sm disabled:opacity-40"
                          >
                            Runter
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>

              <section className="rounded-3xl border border-gray-200 p-6 lg:col-span-2">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <h3 className="text-lg font-semibold text-gray-900">Lesezeichen</h3>
                  <button onClick={addQuickLink} className="btn btn-primary w-full sm:w-auto">
                    + Link hinzufügen
                  </button>
                </div>
                <div className="mt-4 space-y-4">
                  {activeConfig.quickLinks.map((link) => (
                    <div key={link.id} className="grid gap-3 rounded-2xl border border-gray-200 p-4 md:grid-cols-[90px_1fr_1fr_auto]">
                      <input
                        className="input"
                        value={link.icon}
                        onChange={(e) => updateQuickLink(link.id, { icon: e.target.value })}
                        placeholder="Icon"
                      />
                      <input
                        className="input"
                        value={link.name}
                        onChange={(e) => updateQuickLink(link.id, { name: e.target.value })}
                        placeholder="Link-Name"
                      />
                      <input
                        className="input"
                        value={link.url}
                        onChange={(e) => updateQuickLink(link.id, { url: e.target.value })}
                        placeholder="https://... oder /search"
                      />
                      <button onClick={() => removeQuickLink(link.id)} className="btn btn-secondary w-full md:w-auto">
                        Entfernen
                      </button>
                    </div>
                  ))}
                </div>
              </section>

              <section className="rounded-3xl border border-gray-200 p-6 lg:col-span-2">
                <h3 className="text-lg font-semibold text-gray-900">Favorisierte Bereiche</h3>
                <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {spaces.map((space) => {
                    const checked = activeConfig.favoriteSpaceKeys.includes(space.key);
                    return (
                      <label key={space.id} className="flex items-center gap-3 rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3">
                        <input type="checkbox" checked={checked} onChange={() => toggleFavoriteSpace(space.key)} />
                        <div>
                          <div className="font-medium text-gray-900">{space.name}</div>
                          <div className="text-sm text-gray-500">{space.key}</div>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </section>
            </div>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-end">
              <button onClick={() => user?.id && resetConfig(user.id, isAdmin)} className="btn btn-secondary w-full sm:w-auto">
                Dashboard zurücksetzen
              </button>
              <button onClick={() => setSettingsOpen(false)} className="btn btn-primary w-full sm:w-auto">
                Fertig
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

