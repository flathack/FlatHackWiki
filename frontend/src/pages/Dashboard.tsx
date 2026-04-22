import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Responsive,
  useContainerWidth,
  type LayoutItem,
  type ResponsiveLayouts,
} from 'react-grid-layout';
import {
  authApi,
  dashboardApi,
  type CommuteProfile,
  type DashboardResponse,
  type DashboardWidget,
  type DashboardWidgetType,
  type WeatherResponse,
} from '../api/client';
import ThemeSelector from '../components/ThemeSelector';
import { WidgetShell } from '../components/dashboard/WidgetShell';
import { widgetDefinitionMap, widgetDefinitions } from '../components/dashboard/widgetRegistry';
import { useAuthStore } from '../context/auth.store';

const defaultSubtitle =
  'Baue dir eine persönliche Startseite für das Wiki mit Widgets, Lesezeichen, favorisierten Bereichen und Notizen.';
const weekdayLabels: Record<string, string> = {
  MONDAY: 'Mo',
  TUESDAY: 'Di',
  WEDNESDAY: 'Mi',
  THURSDAY: 'Do',
  FRIDAY: 'Fr',
  SATURDAY: 'Sa',
  SUNDAY: 'So',
};
const searchProviders = {
  duckduckgo: 'DuckDuckGo',
  google: 'Google',
  brave: 'Brave',
  bing: 'Bing',
} as const;

function getGreeting(now: Date, name?: string) {
  const hour = now.getHours();
  const trimmedName = name?.trim();
  const suffix = trimmedName ? `, ${trimmedName}!` : '!';

  if (hour < 11) return `Guten Morgen${suffix}`;
  if (hour < 17) return `Guten Mittag${suffix}`;
  return `Guten Abend${suffix}`;
}

function formatMinutes(totalMinutes: number) {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours} h ${minutes.toString().padStart(2, '0')} min`;
}

function formatDateLabel(value: string) {
  return new Date(value).toLocaleString('de-DE', {
    dateStyle: 'short',
    timeStyle: 'short',
  });
}

function formatDateTimeLocal(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const offset = date.getTimezoneOffset();
  const localDate = new Date(date.getTime() - offset * 60000);
  return localDate.toISOString().slice(0, 16);
}

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);

  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);

  return isMobile;
}

type DashboardState = DashboardResponse | null;

export default function Dashboard() {
  const { user, logout, updateUser } = useAuthStore();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { width, containerRef, mounted } = useContainerWidth({ initialWidth: 1280 });
  const [dashboard, setDashboard] = useState<DashboardState>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editMode, setEditMode] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [widgetLibraryOpen, setWidgetLibraryOpen] = useState(false);
  const [widgetConfigId, setWidgetConfigId] = useState<string | null>(null);
  const [now, setNow] = useState(new Date());
  const [wikiSearchQuery, setWikiSearchQuery] = useState('');
  const [webSearchQuery, setWebSearchQuery] = useState('');
  const [profileName, setProfileName] = useState('');
  const [profileSubtitle, setProfileSubtitle] = useState(defaultSubtitle);
  const [showProfileSubtitle, setShowProfileSubtitle] = useState(true);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileMessage, setProfileMessage] = useState('');
  const [profileError, setProfileError] = useState('');
  const [bookmarkForm, setBookmarkForm] = useState({ title: '', url: 'https://', description: '', category: '' });
  const [bookmarkEditId, setBookmarkEditId] = useState<string | null>(null);
  const [projectForm, setProjectForm] = useState({ name: '', client: '', category: '', color: '#0f766e' });
  const [manualEntryForm, setManualEntryForm] = useState({ projectId: '', startTime: '', endTime: '', note: '' });
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [timerProjectId, setTimerProjectId] = useState('');
  const [busyAction, setBusyAction] = useState('');
  const [weather, setWeather] = useState<{
    location: string;
    temperatureC: string;
    description: string;
    humidity: string;
    windKph: string;
  } | null>(null);
  const [weatherError, setWeatherError] = useState('');
  const [weatherLoading, setWeatherLoading] = useState(false);
  const isAdmin = user?.globalRole === 'SUPER_ADMIN' || user?.globalRole === 'SYSTEM_ADMIN';

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    setProfileName(user?.displayName || user?.name || '');
    setProfileSubtitle(user?.dashboardSubtitle || defaultSubtitle);
    setShowProfileSubtitle(user?.showDashboardSubtitle ?? true);
  }, [user?.dashboardSubtitle, user?.displayName, user?.name, user?.showDashboardSubtitle]);

  const loadDashboard = async () => {
    try {
      setLoading(true);
      setError('');
      const { data } = await dashboardApi.get();
      setDashboard(data);
      const firstProject = data.timeTracking.projects.find((project) => !project.isArchived)?.id || '';
      setTimerProjectId((current) => current || firstProject);
      setManualEntryForm((current) => ({ ...current, projectId: current.projectId || firstProject }));
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Dashboard konnte nicht geladen werden');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDashboard();
  }, []);

  const weatherCity = useMemo(() => {
    const widget = dashboard?.widgets.find((item) => item.type === 'WEATHER');
    return typeof widget?.settings?.city === 'string' ? widget.settings.city : 'Berlin';
  }, [dashboard?.widgets]);

  useEffect(() => {
    if (!weatherCity) {
      setWeather(null);
      setWeatherError('');
      return;
    }

    let active = true;

    const loadWeather = async () => {
      setWeatherLoading(true);
      setWeatherError('');
      try {
        const result = await dashboardApi.weather.get(weatherCity);
        if (!active) return;
        setWeather(result.data as WeatherResponse);
      } catch (err: any) {
        if (!active) return;
        setWeather(null);
        setWeatherError(err.response?.data?.error?.message || err.message || 'Wetter konnte nicht geladen werden');
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
  }, [weatherCity]);

  const visibleWidgets = useMemo(
    () => (dashboard?.widgets ?? []).filter((widget) => widget.isVisible).sort((a, b) => a.mobileOrder - b.mobileOrder),
    [dashboard?.widgets]
  );

  const widgetLookup = useMemo(
    () => Object.fromEntries((dashboard?.widgets ?? []).map((widget) => [widget.id, widget])) as Record<string, DashboardWidget>,
    [dashboard?.widgets]
  );

  const activeWidget = widgetConfigId ? widgetLookup[widgetConfigId] : null;
  const availableWidgets = widgetDefinitions.filter(
    (definition) => !dashboard?.widgets.some((widget) => widget.type === definition.type)
  );

  const gridLayouts = useMemo<ResponsiveLayouts>(() => {
    return {
      lg: visibleWidgets.map((widget) => ({
        i: widget.id,
        x: widget.x,
        y: widget.y,
        w: widget.width,
        h: widget.height,
        minW: widget.minWidth,
        minH: widget.minHeight,
        maxW: widget.maxWidth ?? undefined,
        maxH: widget.maxHeight ?? undefined,
      })),
      md: visibleWidgets.map((widget) => ({
        i: widget.id,
        x: Math.min(widget.x, 7),
        y: widget.y,
        w: Math.min(widget.width, 8),
        h: widget.height,
        minW: Math.min(widget.minWidth, 8),
        minH: widget.minHeight,
      })),
      sm: visibleWidgets.map((widget, index) => ({
        i: widget.id,
        x: 0,
        y: index,
        w: 1,
        h: widget.height,
        minW: 1,
        minH: widget.minHeight,
      })),
    };
  }, [visibleWidgets]);

  const greetingName = (user?.displayName || user?.name || '').trim();
  const greeting = getGreeting(now, greetingName || undefined);
  const subtitleText = user?.dashboardSubtitle || defaultSubtitle;
  const shouldShowSubtitle = user?.showDashboardSubtitle ?? true;

  const setDashboardWidgets = (updater: (widgets: DashboardWidget[]) => DashboardWidget[]) => {
    setDashboard((current) => (current ? { ...current, widgets: updater(current.widgets) } : current));
  };

  const persistLayout = async (layout: LayoutItem[]) => {
    if (!dashboard || isMobile) return;

    const sorted = [...layout].sort((a, b) => (a.y - b.y) || (a.x - b.x));
    const payload = sorted.map((item, index) => ({
      id: item.i,
      x: item.x,
      y: item.y,
      width: item.w,
      height: item.h,
      mobileOrder: index,
    }));

    try {
      const { data } = await dashboardApi.updateLayout(payload);
      setDashboard((current) => (current ? { ...current, widgets: data } : current));
    } catch (err) {
      console.error(err);
    }
  };

  const updateWidget = async (
    widgetId: string,
    data: {
      title?: string | null;
      isVisible?: boolean;
      isCollapsed?: boolean;
      settings?: Record<string, unknown>;
    }
  ) => {
    const response = await dashboardApi.updateWidget(widgetId, data);
    setDashboardWidgets((widgets) => widgets.map((widget) => (widget.id === widgetId ? response.data : widget)));
  };

  const saveProfile = async () => {
    setProfileError('');
    setProfileMessage('');
    if (!profileName.trim()) {
      setProfileError('Bitte hinterlege einen Namen für die persönliche Begrüßung.');
      return;
    }

    try {
      setProfileSaving(true);
      const { data } = await authApi.updateMe({
        displayName: profileName.trim(),
        dashboardSubtitle: profileSubtitle.trim() || null,
        showDashboardSubtitle: showProfileSubtitle,
      });
      updateUser({
        name: data.name,
        displayName: data.displayName,
        dashboardSubtitle: data.dashboardSubtitle,
        showDashboardSubtitle: data.showDashboardSubtitle,
      });
      setProfileMessage('Profil gespeichert. Die Begrüßung wurde aktualisiert.');
    } catch (err: any) {
      setProfileError(err.response?.data?.error?.message || 'Profil konnte nicht gespeichert werden');
    } finally {
      setProfileSaving(false);
    }
  };

  const addWidget = async (type: DashboardWidgetType) => {
    try {
      setBusyAction(`add-${type}`);
      const { data } = await dashboardApi.createWidget({ type });
      setDashboardWidgets((widgets) => [...widgets, data]);
      setWidgetLibraryOpen(false);
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Widget konnte nicht hinzugefügt werden');
    } finally {
      setBusyAction('');
    }
  };

  const removeWidget = async (widgetId: string) => {
    try {
      setBusyAction(`delete-${widgetId}`);
      await dashboardApi.deleteWidget(widgetId);
      setDashboardWidgets((widgets) => widgets.filter((widget) => widget.id !== widgetId));
      if (widgetConfigId === widgetId) {
        setWidgetConfigId(null);
      }
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Widget konnte nicht entfernt werden');
    } finally {
      setBusyAction('');
    }
  };

  const saveBookmark = async () => {
    if (!bookmarkForm.title.trim() || !bookmarkForm.url.trim()) return;

    try {
      if (bookmarkEditId) {
        const { data } = await dashboardApi.bookmarks.update(bookmarkEditId, bookmarkForm);
        setDashboard((current) =>
          current
            ? { ...current, bookmarks: current.bookmarks.map((bookmark) => (bookmark.id === bookmarkEditId ? data : bookmark)) }
            : current
        );
      } else {
        const { data } = await dashboardApi.bookmarks.create(bookmarkForm);
        setDashboard((current) => (current ? { ...current, bookmarks: [...current.bookmarks, data] } : current));
      }
      setBookmarkForm({ title: '', url: 'https://', description: '', category: '' });
      setBookmarkEditId(null);
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Lesezeichen konnte nicht gespeichert werden');
    }
  };

  const saveProject = async () => {
    if (!projectForm.name.trim()) return;

    try {
      const { data } = await dashboardApi.timeTracking.createProject(projectForm);
      setDashboard((current) =>
        current
          ? { ...current, timeTracking: { ...current.timeTracking, projects: [...current.timeTracking.projects, data] } }
          : current
      );
      setProjectForm({ name: '', client: '', category: '', color: '#0f766e' });
      setTimerProjectId((current) => current || data.id);
      setManualEntryForm((current) => ({ ...current, projectId: current.projectId || data.id }));
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Projekt konnte nicht erstellt werden');
    }
  };

  const startTimer = async () => {
    if (!timerProjectId) return;

    try {
      await dashboardApi.timeTracking.startTimer({ projectId: timerProjectId });
      await loadDashboard();
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Timer konnte nicht gestartet werden');
    }
  };

  const stopTimer = async (entryId: string) => {
    try {
      await dashboardApi.timeTracking.stopTimer(entryId);
      await loadDashboard();
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Timer konnte nicht beendet werden');
    }
  };

  const saveManualEntry = async () => {
    if (!manualEntryForm.projectId || !manualEntryForm.startTime || !manualEntryForm.endTime) return;

    try {
      const payload = {
        projectId: manualEntryForm.projectId,
        startTime: new Date(manualEntryForm.startTime).toISOString(),
        endTime: new Date(manualEntryForm.endTime).toISOString(),
        note: manualEntryForm.note,
      };

      if (editingEntryId) {
        await dashboardApi.timeTracking.updateEntry(editingEntryId, payload);
      } else {
        await dashboardApi.timeTracking.createEntry(payload);
      }

      setManualEntryForm({ projectId: timerProjectId || '', startTime: '', endTime: '', note: '' });
      setEditingEntryId(null);
      await loadDashboard();
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Zeiteintrag konnte nicht gespeichert werden');
    }
  };

  const renderWidgetContent = (widget: DashboardWidget) => {
    const settings = widget.settings || {};

    switch (widget.type) {
      case 'CLOCK':
        return (
          <WidgetShell title={widget.title} subtitle="Aktuelle Zeit für deinen Arbeitstag" badge="Live">
            <div className="clock-widget-panel">
              <div className="clock-widget-time">
                {now.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}
              </div>
              <div className="clock-widget-date">
                {now.toLocaleDateString('de-DE', {
                  weekday: 'long',
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                })}
              </div>
            </div>
          </WidgetShell>
        );
      case 'WIKI_SEARCH':
        return (
          <WidgetShell title={widget.title} subtitle="Suche direkt in Bereichen und Seiten">
            <div className="widget-inline-form">
              <input
                className="input"
                value={wikiSearchQuery}
                onChange={(e) => setWikiSearchQuery(e.target.value)}
                onKeyDown={(e) =>
                  e.key === 'Enter' &&
                  wikiSearchQuery.trim() &&
                  navigate(`/search?q=${encodeURIComponent(wikiSearchQuery.trim())}`)
                }
                placeholder="Wiki durchsuchen"
              />
              <button
                className="btn btn-primary"
                onClick={() => wikiSearchQuery.trim() && navigate(`/search?q=${encodeURIComponent(wikiSearchQuery.trim())}`)}
              >
                Suchen
              </button>
            </div>
          </WidgetShell>
        );
      case 'WEB_SEARCH': {
        const provider = typeof settings.provider === 'string' ? settings.provider : 'duckduckgo';
        const providerUrl = {
          duckduckgo: `https://duckduckgo.com/?q=${encodeURIComponent(webSearchQuery)}`,
          google: `https://www.google.com/search?q=${encodeURIComponent(webSearchQuery)}`,
          brave: `https://search.brave.com/search?q=${encodeURIComponent(webSearchQuery)}`,
          bing: `https://www.bing.com/search?q=${encodeURIComponent(webSearchQuery)}`,
        }[provider as keyof typeof searchProviders];

        return (
          <WidgetShell
            title={widget.title}
            subtitle="Starte eine Websuche mit deinem bevorzugten Anbieter"
            badge={searchProviders[provider as keyof typeof searchProviders] || 'Web'}
          >
            <div className="widget-inline-form">
              <input
                className="input"
                value={webSearchQuery}
                onChange={(e) => setWebSearchQuery(e.target.value)}
                onKeyDown={(e) =>
                  e.key === 'Enter' &&
                  webSearchQuery.trim() &&
                  window.open(providerUrl, '_blank', 'noopener,noreferrer')
                }
                placeholder="Im Web suchen"
              />
              <button
                className="btn btn-primary"
                onClick={() => webSearchQuery.trim() && window.open(providerUrl, '_blank', 'noopener,noreferrer')}
              >
                Öffnen
              </button>
            </div>
          </WidgetShell>
        );
      }
      case 'WEATHER':
        return (
          <WidgetShell title={widget.title} subtitle={`Ort: ${weatherCity}`} badge="Live">
            {weatherLoading ? (
              <p className="text-sm text-gray-500">Wetter wird geladen ...</p>
            ) : weatherError ? (
              <div className="widget-message widget-message-error">{weatherError}</div>
            ) : weather ? (
              <div className="weather-widget-grid">
                <div className="weather-widget-hero">
                  <div className="weather-widget-temp">{weather.temperatureC} °C</div>
                  <div className="weather-widget-copy">{weather.description}</div>
                  <div className="weather-widget-copy">{weather.location}</div>
                </div>
                <div className="widget-stat-grid">
                  <div className="widget-stat-box">
                    <span>Luftfeuchtigkeit</span>
                    <strong>{weather.humidity}%</strong>
                  </div>
                  <div className="widget-stat-box">
                    <span>Wind</span>
                    <strong>{weather.windKph} km/h</strong>
                  </div>
                </div>
              </div>
            ) : (
              <div className="widget-message">Hinterlege einen Ort in den Widget-Einstellungen.</div>
            )}
          </WidgetShell>
        );
      case 'FAVORITE_SPACES':
        return (
          <WidgetShell title={widget.title} subtitle="Deine wichtigsten Wiki-Bereiche an einem Ort">
            {dashboard?.spaces.favorites.length ? (
              <div className="card-list compact-list">
                {dashboard.spaces.favorites.map((space) => (
                  <Link key={space.id} to={`/spaces/${space.key}`} className="mini-card-link">
                    <strong>{space.name}</strong>
                    <span>{space.description || space.key}</span>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="widget-message">Wähle in den Widget-Einstellungen Bereiche aus, die du immer sehen willst.</div>
            )}
          </WidgetShell>
        );
      case 'NOTES':
        return (
          <WidgetShell title={widget.title} subtitle="Kurze Gedanken, Aufgaben und Ideen">
            <textarea
              className="input widget-notes"
              value={typeof settings.content === 'string' ? settings.content : ''}
              onChange={(e) =>
                setDashboardWidgets((widgets) =>
                  widgets.map((item) =>
                    item.id === widget.id ? { ...item, settings: { ...item.settings, content: e.target.value } } : item
                  )
                )
              }
              placeholder="Notiere hier alles, was schnell erreichbar sein soll ..."
            />
            <div className="widget-toolbar-end">
              <button
                className="btn btn-secondary"
                onClick={() =>
                  updateWidget(widget.id, {
                    settings: { ...settings, content: typeof settings.content === 'string' ? settings.content : '' },
                  })
                }
              >
                Notiz speichern
              </button>
            </div>
          </WidgetShell>
        );
      case 'STATS':
        return (
          <WidgetShell title={widget.title} subtitle="Schneller Überblick über dein Wiki">
            <div className="widget-stat-grid">
              <div className="widget-stat-box">
                <span>Bereiche gesamt</span>
                <strong>{dashboard?.spaces.total ?? 0}</strong>
              </div>
              <div className="widget-stat-box">
                <span>Öffentliche Bereiche</span>
                <strong>{dashboard?.spaces.publicCount ?? 0}</strong>
              </div>
              <div className="widget-stat-box">
                <span>Lesezeichen</span>
                <strong>{dashboard?.bookmarks.length ?? 0}</strong>
              </div>
              <div className="widget-stat-box">
                <span>Heute erfasst</span>
                <strong>{formatMinutes(dashboard?.timeTracking.summary.todayMinutes ?? 0)}</strong>
              </div>
            </div>
          </WidgetShell>
        );
      case 'SPACES':
        return (
          <WidgetShell title={widget.title} subtitle="Deine Bereiche und schnelle Einstiege" actions={<Link to="/spaces/new" className="btn btn-primary">+ Bereich</Link>}>
            <div className="card-list">
              {dashboard?.spaces.items.slice(0, 6).map((space) => (
                <Link key={space.id} to={`/spaces/${space.key}`} className="mini-card-link">
                  <strong>{space.name}</strong>
                  <span>{space.description || space.key}</span>
                </Link>
              ))}
            </div>
          </WidgetShell>
        );
      case 'COMMUTE': {
        const commute = dashboard?.commute;
        const modeLabel =
          commute?.todayMode === 'office'
            ? 'Bürotag'
            : commute?.todayMode === 'homeOffice'
              ? 'Homeoffice'
              : 'Heute flexibel';

        return (
          <WidgetShell title={widget.title} subtitle="Arbeitsweg, Büro-Tage und Rückweg" badge={modeLabel}>
            {!commute?.profile ? (
              <div className="widget-message">Richte deinen Arbeitsweg in den Widget-Einstellungen ein.</div>
            ) : commute.todayMode === 'homeOffice' ? (
              <div className="widget-message widget-message-success">
                Heute ist Homeoffice hinterlegt. Kein Pendelweg notwendig.
              </div>
            ) : commute.route?.status === 'ok' ? (
              <div className="card-list compact-list">
                <div className="mini-card-link static-card">
                  <strong>{commute.profile.sourceAddress}</strong>
                  <span>{commute.profile.destinationAddress}</span>
                </div>
                <div className="widget-stat-grid">
                  <div className="widget-stat-box">
                    <span>Strecke</span>
                    <strong>{commute.route.distanceKm} km</strong>
                  </div>
                  <div className="widget-stat-box">
                    <span>Fahrtzeit</span>
                    <strong>{commute.route.durationMinutes} min</strong>
                  </div>
                </div>
                <div className="widget-message">{commute.route.trafficNote}</div>
              </div>
            ) : (
              <div className="widget-message">{commute?.route?.message || 'Heute liegen keine Routendaten vor.'}</div>
            )}
          </WidgetShell>
        );
      }
      case 'TIME_TRACKER': {
        const timeTracking = dashboard?.timeTracking;
        const runningEntry = timeTracking?.runningEntry;
        const runningDurationMinutes = runningEntry
          ? Math.max(1, Math.round((now.getTime() - new Date(runningEntry.startTime).getTime()) / 60000))
          : 0;

        return (
          <WidgetShell title={widget.title} subtitle="Projekte, Timer und manuelle Nachträge" badge={runningEntry ? 'Timer läuft' : 'Bereit'}>
            <div className="widget-stack">
              <div className="widget-inline-form stretch-mobile">
                <select className="input" value={timerProjectId} onChange={(e) => setTimerProjectId(e.target.value)}>
                  <option value="">Projekt auswählen</option>
                  {timeTracking?.projects
                    .filter((project) => !project.isArchived)
                    .map((project) => (
                      <option key={project.id} value={project.id}>
                        {project.name}
                      </option>
                    ))}
                </select>
                {runningEntry ? (
                  <button className="btn btn-primary" onClick={() => stopTimer(runningEntry.id)}>
                    Ausstempeln
                  </button>
                ) : (
                  <button className="btn btn-primary" onClick={startTimer} disabled={!timerProjectId}>
                    Einstempeln
                  </button>
                )}
              </div>

              <div className="widget-stat-grid">
                <div className="widget-stat-box">
                  <span>Heute</span>
                  <strong>{formatMinutes(timeTracking?.summary.todayMinutes ?? 0)}</strong>
                </div>
                <div className="widget-stat-box">
                  <span>Diese Woche</span>
                  <strong>{formatMinutes(timeTracking?.summary.weekMinutes ?? 0)}</strong>
                </div>
                <div className="widget-stat-box">
                  <span>Projekte</span>
                  <strong>{timeTracking?.projects.length ?? 0}</strong>
                </div>
                <div className="widget-stat-box">
                  <span>Aktiv</span>
                  <strong>{runningEntry ? formatMinutes(runningDurationMinutes) : 'Kein Timer'}</strong>
                </div>
              </div>

              <div className="widget-subsection">
                <h4>Projekt anlegen</h4>
                <div className="widget-form-grid">
                  <input className="input" value={projectForm.name} onChange={(e) => setProjectForm((current) => ({ ...current, name: e.target.value }))} placeholder="Projektname" />
                  <input className="input" value={projectForm.client} onChange={(e) => setProjectForm((current) => ({ ...current, client: e.target.value }))} placeholder="Kunde" />
                  <input className="input" value={projectForm.category} onChange={(e) => setProjectForm((current) => ({ ...current, category: e.target.value }))} placeholder="Kategorie" />
                  <input className="input" type="color" value={projectForm.color} onChange={(e) => setProjectForm((current) => ({ ...current, color: e.target.value }))} />
                </div>
                <div className="widget-toolbar-end">
                  <button className="btn btn-secondary" onClick={saveProject}>
                    Projekt speichern
                  </button>
                </div>
              </div>

              <div className="widget-subsection">
                <h4>Manuellen Eintrag erfassen</h4>
                <div className="widget-form-grid">
                  <select className="input" value={manualEntryForm.projectId} onChange={(e) => setManualEntryForm((current) => ({ ...current, projectId: e.target.value }))}>
                    <option value="">Projekt auswählen</option>
                    {timeTracking?.projects
                      .filter((project) => !project.isArchived)
                      .map((project) => (
                        <option key={project.id} value={project.id}>
                          {project.name}
                        </option>
                      ))}
                  </select>
                  <input className="input" type="datetime-local" value={manualEntryForm.startTime} onChange={(e) => setManualEntryForm((current) => ({ ...current, startTime: e.target.value }))} />
                  <input className="input" type="datetime-local" value={manualEntryForm.endTime} onChange={(e) => setManualEntryForm((current) => ({ ...current, endTime: e.target.value }))} />
                  <input className="input" value={manualEntryForm.note} onChange={(e) => setManualEntryForm((current) => ({ ...current, note: e.target.value }))} placeholder="Notiz" />
                </div>
                <div className="widget-toolbar-end">
                  <button className="btn btn-secondary" onClick={saveManualEntry}>
                    {editingEntryId ? 'Änderung speichern' : 'Eintrag speichern'}
                  </button>
                </div>
              </div>

              <div className="widget-subsection">
                <h4>Letzte Einträge</h4>
                <div className="card-list compact-list">
                  {timeTracking?.entries.slice(0, 6).map((entry) => (
                    <div key={entry.id} className="mini-card-link static-card">
                      <strong>{entry.project?.name || 'Projekt'}</strong>
                      <span>
                        {formatDateLabel(entry.startTime)}
                        {entry.endTime ? ` bis ${formatDateLabel(entry.endTime)}` : ' • läuft'}
                      </span>
                      <div className="widget-inline-actions">
                        <button
                          className="text-button"
                          onClick={() => {
                            setEditingEntryId(entry.id);
                            setManualEntryForm({
                              projectId: entry.projectId,
                              startTime: formatDateTimeLocal(entry.startTime),
                              endTime: entry.endTime ? formatDateTimeLocal(entry.endTime) : '',
                              note: entry.note || '',
                            });
                          }}
                        >
                          Bearbeiten
                        </button>
                        <button
                          className="text-button danger"
                          onClick={async () => {
                            await dashboardApi.timeTracking.deleteEntry(entry.id);
                            await loadDashboard();
                          }}
                        >
                          Löschen
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </WidgetShell>
        );
      }
      case 'BOOKMARKS': {
        const showFavoritesOnly = Boolean(settings.showFavoritesOnly);
        const search = typeof settings.search === 'string' ? settings.search.toLowerCase() : '';
        const bookmarks = (dashboard?.bookmarks ?? []).filter((bookmark) => {
          if (showFavoritesOnly && !bookmark.isFavorite) return false;
          if (!search) return true;
          return [bookmark.title, bookmark.url, bookmark.category || '', bookmark.description || '']
            .join(' ')
            .toLowerCase()
            .includes(search);
        });

        return (
          <WidgetShell title={widget.title} subtitle="Wichtige Web-Links für den Alltag">
            <div className="widget-stack">
              <div className="widget-inline-form stretch-mobile">
                <input className="input" value={bookmarkForm.title} onChange={(e) => setBookmarkForm((current) => ({ ...current, title: e.target.value }))} placeholder="Titel" />
                <input className="input" value={bookmarkForm.url} onChange={(e) => setBookmarkForm((current) => ({ ...current, url: e.target.value }))} placeholder="https://..." />
              </div>
              <div className="widget-inline-form stretch-mobile">
                <input className="input" value={bookmarkForm.category} onChange={(e) => setBookmarkForm((current) => ({ ...current, category: e.target.value }))} placeholder="Kategorie" />
                <button className="btn btn-secondary" onClick={saveBookmark}>
                  {bookmarkEditId ? 'Lesezeichen aktualisieren' : 'Lesezeichen hinzufügen'}
                </button>
              </div>
              <div className="card-list compact-list">
                {bookmarks.map((bookmark) => (
                  <div key={bookmark.id} className="mini-card-link static-card">
                    <strong>{bookmark.title}</strong>
                    <span>
                      {bookmark.category ? `${bookmark.category} • ` : ''}
                      {bookmark.url}
                    </span>
                    <div className="widget-inline-actions">
                      <a href={bookmark.url} target="_blank" rel="noreferrer" className="text-button">
                        Öffnen
                      </a>
                      <button
                        className="text-button"
                        onClick={() => {
                          setBookmarkEditId(bookmark.id);
                          setBookmarkForm({
                            title: bookmark.title,
                            url: bookmark.url,
                            description: bookmark.description || '',
                            category: bookmark.category || '',
                          });
                        }}
                      >
                        Bearbeiten
                      </button>
                      <button
                        className="text-button"
                        onClick={async () => {
                          const { data } = await dashboardApi.bookmarks.update(bookmark.id, {
                            isFavorite: !bookmark.isFavorite,
                          });
                          setDashboard((current) =>
                            current
                              ? {
                                  ...current,
                                  bookmarks: current.bookmarks.map((item) => (item.id === bookmark.id ? data : item)),
                                }
                              : current
                          );
                        }}
                      >
                        {bookmark.isFavorite ? 'Favorit lösen' : 'Favorisieren'}
                      </button>
                      <button
                        className="text-button danger"
                        onClick={async () => {
                          await dashboardApi.bookmarks.delete(bookmark.id);
                          await loadDashboard();
                        }}
                      >
                        Löschen
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </WidgetShell>
        );
      }
    }

    return (
      <WidgetShell title={widget.title} subtitle="Dieses Widget ist derzeit nicht verfügbar.">
        <div className="widget-message">Für diesen Widget-Typ liegt aktuell noch keine Darstellung vor.</div>
      </WidgetShell>
    );
  };

  if (loading) {
    return <div className="page-loader">Dashboard wird geladen ...</div>;
  }

  if (error && !dashboard) {
    return (
      <div className="page-loader">
        <div className="widget-message widget-message-error">{error}</div>
        <button className="btn btn-primary" onClick={loadDashboard}>
          Erneut versuchen
        </button>
      </div>
    );
  }

  return (
    <div className="dashboard-page-shell">
      <header className="dashboard-topbar">
        <div>
          <div className="dashboard-brand">FlatHacksWiki</div>
          <p className="dashboard-brand-copy">
            Persönlicher Arbeitsbereich für Wissen, Links und Mini-Anwendungen.
          </p>
        </div>
        <div className="dashboard-topbar-actions">
          <ThemeSelector />
          {isAdmin && (
            <Link to="/admin" className="text-button">
              Admin
            </Link>
          )}
          <button className={`btn ${editMode ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setEditMode((current) => !current)}>
            {editMode ? 'Layout-Modus beenden' : 'Layout bearbeiten'}
          </button>
          <button className="btn btn-secondary" onClick={() => setWidgetLibraryOpen(true)}>
            Widget hinzufügen
          </button>
          <button className="btn btn-secondary" onClick={() => setSettingsOpen(true)}>
            Profil & Dashboard
          </button>
          <button className="text-button danger" onClick={logout}>
            Abmelden
          </button>
        </div>
      </header>

      <main className="dashboard-main-shell">
        <section className="dashboard-hero-card">
          <div>
            <div className="dashboard-hero-label">Persönliche Startseite</div>
            <h1 className="dashboard-hero-title">{greeting}</h1>
            {shouldShowSubtitle && subtitleText && <p className="dashboard-hero-copy">{subtitleText}</p>}
            {!greetingName && (
              <p className="dashboard-hero-hint">
                Hinterlege deinen Namen im Profil, damit die Begrüßung persönlicher wird.
              </p>
            )}
          </div>
          <div className="dashboard-user-chip">
            <span>{user?.displayName || user?.name}</span>
            <strong>{user?.globalRole}</strong>
          </div>
        </section>

        {error && <div className="widget-message widget-message-error">{error}</div>}

        {editMode && (
          <section className="dashboard-edit-hint">
            <strong>Layout-Bearbeitung aktiv</strong>
            <span>
              Widgets lassen sich jetzt mit der Maus verschieben und in der Größe anpassen. Auf Smartphones
              bleibt das Layout stabil und stapelt sich untereinander.
            </span>
          </section>
        )}

        {isMobile ? (
          <div className="dashboard-mobile-stack">
            {visibleWidgets.map((widget) => (
              <div key={widget.id} className="dashboard-widget-frame mobile-frame">
                {editMode && (
                  <div className="dashboard-widget-toolbar">
                    <div className="widget-drag-handle">⋮⋮</div>
                    <div className="dashboard-widget-toolbar-actions">
                      <button className="text-button" onClick={() => updateWidget(widget.id, { isCollapsed: !widget.isCollapsed })}>
                        {widget.isCollapsed ? 'Öffnen' : 'Einklappen'}
                      </button>
                      <button className="text-button" onClick={() => setWidgetConfigId(widget.id)}>
                        Konfigurieren
                      </button>
                      <button className="text-button danger" onClick={() => removeWidget(widget.id)}>
                        Entfernen
                      </button>
                    </div>
                  </div>
                )}
                {!widget.isCollapsed && renderWidgetContent(widget)}
              </div>
            ))}
          </div>
        ) : (
          <div ref={containerRef as any}>
            {mounted && (
              <Responsive
                className="layout"
                layouts={gridLayouts}
                breakpoints={{ lg: 1200, md: 900, sm: 0 }}
                cols={{ lg: 12, md: 8, sm: 1 }}
                rowHeight={36}
                margin={[20, 20]}
                containerPadding={[0, 0]}
                dragConfig={{ enabled: editMode, handle: '.widget-drag-handle' }}
                resizeConfig={{ enabled: editMode, handles: ['se'] }}
                width={width}
                onDragStop={(layout: readonly LayoutItem[]) => persistLayout([...layout])}
                onResizeStop={(layout: readonly LayoutItem[]) => persistLayout([...layout])}
              >
                {visibleWidgets.map((widget) => (
                  <div key={widget.id} className="dashboard-widget-frame">
                    {editMode && (
                      <div className="dashboard-widget-toolbar">
                        <div className="widget-drag-handle">⋮⋮</div>
                        <div className="dashboard-widget-toolbar-actions">
                          <button className="text-button" onClick={() => updateWidget(widget.id, { isCollapsed: !widget.isCollapsed })}>
                            {widget.isCollapsed ? 'Öffnen' : 'Einklappen'}
                          </button>
                          <button className="text-button" onClick={() => setWidgetConfigId(widget.id)}>
                            Konfigurieren
                          </button>
                          <button className="text-button danger" onClick={() => removeWidget(widget.id)}>
                            Entfernen
                          </button>
                        </div>
                      </div>
                    )}
                    {!widget.isCollapsed && renderWidgetContent(widget)}
                  </div>
                ))}
              </Responsive>
            )}
          </div>
        )}
      </main>

      {settingsOpen && (
        <div className="dialog-backdrop">
          <div className="dialog-panel large-panel">
            <div className="dialog-header">
              <div>
                <div className="dialog-eyebrow">Profil & Dashboard</div>
                <h2>Persönliche Einstellungen</h2>
              </div>
              <button className="btn btn-secondary" onClick={() => setSettingsOpen(false)}>
                Schließen
              </button>
            </div>
            <div className="dialog-grid">
              <section className="dialog-card span-2">
                <h3>Profil</h3>
                <div className="widget-form-grid">
                  <input className="input" value={profileName} onChange={(e) => setProfileName(e.target.value)} placeholder="Name für die Begrüßung" />
                  <label className="checkbox-row">
                    <input type="checkbox" checked={showProfileSubtitle} onChange={(e) => setShowProfileSubtitle(e.target.checked)} />
                    <span>Untertitel anzeigen</span>
                  </label>
                </div>
                <textarea className="input widget-notes" value={profileSubtitle} onChange={(e) => setProfileSubtitle(e.target.value)} placeholder={defaultSubtitle} />
                {profileError && <div className="widget-message widget-message-error">{profileError}</div>}
                {profileMessage && <div className="widget-message widget-message-success">{profileMessage}</div>}
                <div className="widget-toolbar-end">
                  <button className="btn btn-primary" onClick={saveProfile} disabled={profileSaving}>
                    {profileSaving ? 'Speichert ...' : 'Profil speichern'}
                  </button>
                </div>
              </section>
              <section className="dialog-card">
                <h3>Aktive Widgets</h3>
                <div className="card-list compact-list">
                  {dashboard?.widgets.map((widget) => (
                    <button
                      key={widget.id}
                      className="mini-card-link static-card align-left"
                      onClick={() => {
                        setWidgetConfigId(widget.id);
                        setSettingsOpen(false);
                      }}
                    >
                      <strong>{widgetDefinitionMap[widget.type].label}</strong>
                      <span>{widget.title}</span>
                    </button>
                  ))}
                </div>
              </section>
              <section className="dialog-card">
                <h3>Hinweise</h3>
                <div className="widget-message">
                  Layouts werden pro Benutzer im Backend gespeichert. Auf Smartphones bleiben Widgets stapelbar
                  und leicht bedienbar.
                </div>
              </section>
            </div>
          </div>
        </div>
      )}

      {widgetLibraryOpen && (
        <div className="dialog-backdrop">
          <div className="dialog-panel">
            <div className="dialog-header">
              <div>
                <div className="dialog-eyebrow">Widget-Bibliothek</div>
                <h2>Widget hinzufügen</h2>
              </div>
              <button className="btn btn-secondary" onClick={() => setWidgetLibraryOpen(false)}>
                Schließen
              </button>
            </div>
            <div className="card-list compact-list">
              {availableWidgets.length === 0 ? (
                <div className="widget-message">Alle verfügbaren Widgets sind bereits im Dashboard vorhanden.</div>
              ) : (
                availableWidgets.map((definition) => (
                  <div key={definition.type} className="mini-card-link static-card">
                    <strong>{definition.label}</strong>
                    <span>{definition.description}</span>
                    <div className="widget-toolbar-end">
                      <button className="btn btn-primary" disabled={busyAction === `add-${definition.type}`} onClick={() => addWidget(definition.type)}>
                        {busyAction === `add-${definition.type}` ? 'Wird hinzugefügt ...' : 'Hinzufügen'}
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {activeWidget && dashboard && (
        <WidgetSettingsDialog
          widget={activeWidget}
          spaces={dashboard.spaces.items}
          commuteProfile={dashboard.commute.profile}
          onClose={() => setWidgetConfigId(null)}
          onSaveWidget={async (data) => {
            await updateWidget(activeWidget.id, data);
            setWidgetConfigId(null);
          }}
          onSaveCommute={async (profile) => {
            await dashboardApi.commute.update(profile);
            await loadDashboard();
            setWidgetConfigId(null);
          }}
        />
      )}
    </div>
  );
}

function WidgetSettingsDialog({
  widget,
  spaces,
  commuteProfile,
  onClose,
  onSaveWidget,
  onSaveCommute,
}: {
  widget: DashboardWidget;
  spaces: DashboardResponse['spaces']['items'];
  commuteProfile: CommuteProfile | null;
  onClose: () => void;
  onSaveWidget: (data: {
    title?: string | null;
    isVisible?: boolean;
    isCollapsed?: boolean;
    settings?: Record<string, unknown>;
  }) => Promise<void>;
  onSaveCommute: (profile: CommuteProfile) => Promise<void>;
}) {
  const [title, setTitle] = useState(widget.title);
  const [settings, setSettings] = useState<Record<string, unknown>>(widget.settings || {});
  const [commute, setCommute] = useState<CommuteProfile>(
    commuteProfile || {
      id: '',
      sourceAddress: '',
      destinationAddress: '',
      officeDays: ['MONDAY', 'TUESDAY', 'WEDNESDAY'],
      homeOfficeDays: ['THURSDAY', 'FRIDAY'],
      outboundLabel: 'Hinfahrt',
      returnLabel: 'Rückfahrt',
      departureTime: '08:00',
      returnDepartureTime: '17:00',
    }
  );
  const [saving, setSaving] = useState(false);

  const toggleDay = (field: 'officeDays' | 'homeOfficeDays', day: string) => {
    setCommute((current) => ({
      ...current,
      [field]: current[field].includes(day)
        ? current[field].filter((item) => item !== day)
        : [...current[field], day],
    }));
  };

  const save = async () => {
    setSaving(true);
    try {
      if (widget.type === 'COMMUTE') {
        await onSaveCommute(commute);
      } else {
        await onSaveWidget({ title, settings });
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="dialog-backdrop">
      <div className="dialog-panel">
        <div className="dialog-header">
          <div>
            <div className="dialog-eyebrow">Widget konfigurieren</div>
            <h2>{widgetDefinitionMap[widget.type].label}</h2>
          </div>
          <button className="btn btn-secondary" onClick={onClose}>
            Schließen
          </button>
        </div>

        {widget.type !== 'COMMUTE' && (
          <div className="widget-subsection">
            <label className="form-label">Titel</label>
            <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
        )}

        {(widget.type === 'WEATHER' ||
          widget.type === 'WEB_SEARCH' ||
          widget.type === 'FAVORITE_SPACES' ||
          widget.type === 'NOTES' ||
          widget.type === 'BOOKMARKS') && (
          <div className="widget-stack">
            {widget.type === 'WEATHER' && (
              <div className="widget-subsection">
                <label className="form-label">Ort</label>
                <input className="input" value={String(settings.city || 'Berlin')} onChange={(e) => setSettings((current) => ({ ...current, city: e.target.value }))} />
              </div>
            )}
            {widget.type === 'WEB_SEARCH' && (
              <div className="widget-subsection">
                <label className="form-label">Suchanbieter</label>
                <select className="input" value={String(settings.provider || 'duckduckgo')} onChange={(e) => setSettings((current) => ({ ...current, provider: e.target.value }))}>
                  {Object.entries(searchProviders).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {widget.type === 'FAVORITE_SPACES' && (
              <div className="widget-subsection">
                <label className="form-label">Favorisierte Bereiche</label>
                <div className="option-grid">
                  {spaces.map((space) => {
                    const activeKeys = Array.isArray(settings.spaceKeys) ? (settings.spaceKeys as string[]) : [];
                    const checked = activeKeys.includes(space.key);
                    return (
                      <label key={space.id} className="checkbox-card">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() =>
                            setSettings((current) => ({
                              ...current,
                              spaceKeys: checked
                                ? activeKeys.filter((key) => key !== space.key)
                                : [...activeKeys, space.key],
                            }))
                          }
                        />
                        <span>{space.name}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}
            {widget.type === 'NOTES' && (
              <div className="widget-subsection">
                <label className="form-label">Standardinhalt</label>
                <textarea className="input widget-notes" value={String(settings.content || '')} onChange={(e) => setSettings((current) => ({ ...current, content: e.target.value }))} />
              </div>
            )}
            {widget.type === 'BOOKMARKS' && (
              <div className="widget-subsection">
                <label className="checkbox-row">
                  <input type="checkbox" checked={Boolean(settings.showFavoritesOnly)} onChange={(e) => setSettings((current) => ({ ...current, showFavoritesOnly: e.target.checked }))} />
                  <span>Nur Favoriten anzeigen</span>
                </label>
                <label className="form-label">Suchbegriff</label>
                <input className="input" value={String(settings.search || '')} onChange={(e) => setSettings((current) => ({ ...current, search: e.target.value }))} placeholder="Optionales Filterwort" />
              </div>
            )}
          </div>
        )}

        {widget.type === 'COMMUTE' && (
          <div className="widget-stack">
            <div className="widget-form-grid">
              <input className="input" value={commute.sourceAddress} onChange={(e) => setCommute((current) => ({ ...current, sourceAddress: e.target.value }))} placeholder="Startadresse" />
              <input className="input" value={commute.destinationAddress} onChange={(e) => setCommute((current) => ({ ...current, destinationAddress: e.target.value }))} placeholder="Zieladresse" />
              <input className="input" value={commute.departureTime || ''} onChange={(e) => setCommute((current) => ({ ...current, departureTime: e.target.value }))} placeholder="Abfahrt Hinfahrt" />
              <input className="input" value={commute.returnDepartureTime || ''} onChange={(e) => setCommute((current) => ({ ...current, returnDepartureTime: e.target.value }))} placeholder="Abfahrt Rückfahrt" />
            </div>
            <div className="widget-subsection">
              <label className="form-label">Bürotage</label>
              <div className="option-grid">
                {Object.entries(weekdayLabels).map(([day, label]) => (
                  <button key={day} type="button" className={`chip-button ${commute.officeDays.includes(day) ? 'active' : ''}`} onClick={() => toggleDay('officeDays', day)}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div className="widget-subsection">
              <label className="form-label">Homeoffice-Tage</label>
              <div className="option-grid">
                {Object.entries(weekdayLabels).map(([day, label]) => (
                  <button key={day} type="button" className={`chip-button ${commute.homeOfficeDays.includes(day) ? 'active' : ''}`} onClick={() => toggleDay('homeOfficeDays', day)}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        <div className="widget-toolbar-end">
          <button className="btn btn-primary" onClick={save} disabled={saving}>
            {saving ? 'Speichert ...' : 'Speichern'}
          </button>
        </div>
      </div>
    </div>
  );
}
