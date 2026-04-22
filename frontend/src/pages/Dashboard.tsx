import { useEffect, useMemo, useRef, useState } from 'react';
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
  type BookmarkItem,
  type CommuteProfile,
  type DashboardResponse,
  type DashboardWidget,
  type DashboardWidgetType,
  type WeatherResponse,
} from '../api/client';
import ThemeSelector from '../components/ThemeSelector';
import { BookmarkBar, BookmarkManagerDialog } from '../components/dashboard/BookmarkManager';
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
  const [bookmarkManagerOpen, setBookmarkManagerOpen] = useState(false);
  const [bookmarkEditItem, setBookmarkEditItem] = useState<BookmarkItem | null>(null);
  const [projectForm, setProjectForm] = useState({ name: '', client: '', category: '', color: '#0f766e' });
  const [manualEntryForm, setManualEntryForm] = useState({ projectId: '', startTime: '', endTime: '', note: '' });
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [timerProjectId, setTimerProjectId] = useState('');
  const [busyAction, setBusyAction] = useState('');
  const [telegramDraft, setTelegramDraft] = useState('');
  const [telegramSending, setTelegramSending] = useState(false);
  const [weather, setWeather] = useState<{
    location: string;
    temperatureC: string;
    description: string;
    humidity: string;
    windKph: string;
  } | null>(null);
  const [weatherError, setWeatherError] = useState('');
  const [weatherLoading, setWeatherLoading] = useState(false);
  const webSearchInputRef = useRef<HTMLInputElement | null>(null);
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
    () =>
      (dashboard?.widgets ?? [])
        .filter(
          (widget) =>
            widget.isVisible &&
            widget.type !== 'CLOCK' &&
            widget.type !== 'WEB_SEARCH'
        )
        .sort((a, b) => a.mobileOrder - b.mobileOrder),
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
  const webSearchWidget = dashboard?.widgets.find((widget) => widget.type === 'WEB_SEARCH');
  const webSearchProvider =
    typeof webSearchWidget?.settings?.provider === 'string' &&
    webSearchWidget.settings.provider in searchProviders
      ? (webSearchWidget.settings.provider as keyof typeof searchProviders)
      : 'duckduckgo';
  const telegramPollInterval = useMemo(() => {
    const chatSettings = dashboard?.telegramChat?.settings;
    if (!chatSettings) return 15000;
    return typeof chatSettings.pollIntervalMs === 'number' && chatSettings.pollIntervalMs >= 5000
      ? chatSettings.pollIntervalMs
      : 15000;
  }, [dashboard?.telegramChat?.settings]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      webSearchInputRef.current?.focus();
      webSearchInputRef.current?.select();
    }, 120);

    return () => window.clearTimeout(timer);
  }, [dashboard?.widgets]);

  useEffect(() => {
    const telegramWidgetVisible = dashboard?.widgets.some(
      (widget) => widget.type === 'TELEGRAM_CHAT' && widget.isVisible
    );

    if (!telegramWidgetVisible) {
      return;
    }

    const timer = window.setInterval(async () => {
      try {
        const { data } = await dashboardApi.get();
        setDashboard((current) => {
          if (!current) {
            return data;
          }

          return {
            ...current,
            telegramChat: data.telegramChat,
          };
        });
      } catch (pollError) {
        console.error(pollError);
      }
    }, telegramPollInterval);

    return () => window.clearInterval(timer);
  }, [dashboard?.widgets, telegramPollInterval]);

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

  const refreshBookmarks = async () => {
    try {
      const { data } = await dashboardApi.bookmarks.list();
      setDashboard((current) => (current ? { ...current, bookmarks: data } : current));
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Lesezeichen konnten nicht aktualisiert werden');
    }
  };

  const createBookmarkItem = async (payload: {
    itemType?: 'BOOKMARK' | 'FOLDER';
    parentId?: string | null;
    title: string;
    url?: string | null;
    description?: string | null;
    category?: string | null;
    faviconUrl?: string | null;
    isFavorite?: boolean;
    showInToolbar?: boolean;
  }) => {
    try {
      await dashboardApi.bookmarks.create(payload);
      await refreshBookmarks();
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Lesezeichen konnte nicht erstellt werden');
      throw err;
    }
  };

  const updateBookmarkItem = async (bookmarkId: string, payload: Record<string, unknown>) => {
    try {
      await dashboardApi.bookmarks.update(bookmarkId, payload);
      await refreshBookmarks();
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Lesezeichen konnte nicht aktualisiert werden');
      throw err;
    }
  };

  const deleteBookmarkItem = async (bookmarkId: string) => {
    try {
      await dashboardApi.bookmarks.delete(bookmarkId);
      await refreshBookmarks();
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Lesezeichen konnte nicht gelöscht werden');
      throw err;
    }
  };

  const openBookmarkEditor = (item: BookmarkItem) => {
    setBookmarkEditItem(item);
    setBookmarkManagerOpen(true);
  };

  const reorderBookmarks = async (items: Array<{ id: string; parentId: string | null; sortOrder: number; showInToolbar?: boolean }>) => {
    try {
      const { data } = await dashboardApi.bookmarks.reorder(items);
      setDashboard((current) => (current ? { ...current, bookmarks: data } : current));
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Lesezeichen konnten nicht sortiert werden');
      throw err;
    }
  };

  const importBookmarks = async (html: string, mode: 'append' | 'replace') => {
    try {
      const { data } = await dashboardApi.bookmarks.importHtml(html, mode);
      setDashboard((current) => (current ? { ...current, bookmarks: data.bookmarks } : current));
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Import konnte nicht verarbeitet werden');
      throw err;
    }
  };

  const exportBookmarks = async () => {
    try {
      const { data } = await dashboardApi.bookmarks.exportHtml();
      return data;
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Export konnte nicht erzeugt werden');
      throw err;
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

  const runHeroWebSearch = () => {
    const query = webSearchQuery.trim();
    if (!query) return;

    const providerUrl = {
      duckduckgo: `https://duckduckgo.com/?q=${encodeURIComponent(query)}`,
      google: `https://www.google.com/search?q=${encodeURIComponent(query)}`,
      brave: `https://search.brave.com/search?q=${encodeURIComponent(query)}`,
      bing: `https://www.bing.com/search?q=${encodeURIComponent(query)}`,
    }[webSearchProvider];

    window.open(providerUrl, '_blank', 'noopener,noreferrer');
  };

  const sendTelegramMessage = async () => {
    const content = telegramDraft.trim();
    if (!content) return;

    try {
      setTelegramSending(true);
      await dashboardApi.telegram.sendMessage(content);
      setTelegramDraft('');
      await loadDashboard();
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Telegram-Nachricht konnte nicht gesendet werden');
    } finally {
      setTelegramSending(false);
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
                <strong>{dashboard?.bookmarks.bookmarkCount ?? 0}</strong>
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
        const bookmarkSummary = dashboard?.bookmarks;
        const rootItems = bookmarkSummary?.toolbar ?? [];

        return (
          <WidgetShell
            title={widget.title}
            subtitle="Zentrale Verwaltung für Browser-Leiste, Ordner und Import/Export"
            actions={
              <button className="btn btn-primary" onClick={() => setBookmarkManagerOpen(true)}>
                Verwalten
              </button>
            }
          >
            <div className="widget-stack">
              <div className="widget-stat-grid">
                <div className="widget-stat-box">
                  <span>Einträge gesamt</span>
                  <strong>{bookmarkSummary?.totalCount ?? 0}</strong>
                </div>
                <div className="widget-stat-box">
                  <span>Ordner</span>
                  <strong>{bookmarkSummary?.folderCount ?? 0}</strong>
                </div>
                <div className="widget-stat-box">
                  <span>Favoriten</span>
                  <strong>{bookmarkSummary?.favoriteCount ?? 0}</strong>
                </div>
                <div className="widget-stat-box">
                  <span>Leisten-Einträge</span>
                  <strong>{rootItems.length}</strong>
                </div>
              </div>
              <div className="card-list compact-list">
                {rootItems.length === 0 ? (
                  <div className="widget-message">Lege oben über das Zahnrad deine persönliche Lesezeichenleiste an.</div>
                ) : (
                  rootItems.map((item) => (
                    <div key={item.id} className="mini-card-link static-card">
                      <strong>{item.title}</strong>
                      <span>
                        {item.itemType === 'FOLDER'
                          ? item.children.length + ' Einträge im Ordner'
                          : item.url || 'Kein Link hinterlegt'}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </WidgetShell>
        );
      }
      case 'TELEGRAM_CHAT': {
        const telegram = dashboard?.telegramChat;
        const greetingText =
          typeof settings.greetingText === 'string'
            ? settings.greetingText
            : telegram?.settings.greetingText || 'Verbinde dieses Widget mit deinem OpenClaw Telegram Bot.';
        const botUsername =
          typeof settings.botUsername === 'string'
            ? settings.botUsername
            : telegram?.settings.botUsername || 'OpenClaw Bot';

        return (
          <WidgetShell
            title={widget.title}
            subtitle="Direkter Bot-Chat im Dashboard"
            badge={telegram?.configured ? botUsername : 'Setup'}
          >
            <div className="telegram-chat-widget">
              <div className="widget-message">
                {greetingText}
                {!telegram?.configured &&
                  ' Hinterlege im Widget eine Chat-ID und konfiguriere im Backend TELEGRAM_BOT_TOKEN oder OPENCLAW_BOT_WEBHOOK_URL.'}
              </div>
              <div className="telegram-chat-history">
                {(telegram?.messages.length ?? 0) === 0 ? (
                  <div className="widget-message">Noch kein Verlauf vorhanden. Schreibe deine erste Nachricht.</div>
                ) : (
                  telegram?.messages.map((message) => (
                    <div
                      key={message.id}
                      className={`telegram-chat-bubble ${
                        message.senderRole === 'USER'
                          ? 'telegram-chat-bubble-user'
                          : message.senderRole === 'BOT'
                            ? 'telegram-chat-bubble-bot'
                            : 'telegram-chat-bubble-system'
                      }`}
                    >
                      <div className="telegram-chat-role">
                        {message.senderRole === 'USER'
                          ? 'Ich'
                          : message.senderRole === 'BOT'
                            ? botUsername
                            : 'System'}
                      </div>
                      <div>{message.content}</div>
                      <div className="telegram-chat-time">{formatDateLabel(message.createdAt)}</div>
                    </div>
                  ))
                )}
              </div>
              <div className="widget-inline-form stretch-mobile">
                <input
                  className="input"
                  value={telegramDraft}
                  onChange={(e) => setTelegramDraft(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), sendTelegramMessage())}
                  placeholder="Nachricht an OpenClaw Bot schreiben ..."
                />
                <button className="btn btn-primary" onClick={sendTelegramMessage} disabled={telegramSending}>
                  {telegramSending ? 'Sendet ...' : 'Senden'}
                </button>
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
          <div className="dashboard-hero-content">
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

            <div className="dashboard-hero-tools">
              <div className="dashboard-hero-clock">
                <div className="dashboard-hero-clock-time">
                  {now.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}
                </div>
                <div className="dashboard-hero-clock-date">
                  {now.toLocaleDateString('de-DE', {
                    weekday: 'long',
                    day: 'numeric',
                    month: 'long',
                  })}
                </div>
              </div>

              <div className="dashboard-hero-search">
                <div className="dashboard-hero-search-top">
                  <span className="dashboard-search-provider">
                    {searchProviders[webSearchProvider]}
                  </span>
                  <span className="dashboard-user-chip compact-chip">
                    <span>{user?.displayName || user?.name}</span>
                    <strong>{user?.globalRole}</strong>
                  </span>
                </div>
                <div className="widget-inline-form stretch-mobile">
                  <input
                    ref={webSearchInputRef}
                    className="input"
                    value={webSearchQuery}
                    onChange={(e) => setWebSearchQuery(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && runHeroWebSearch()}
                    placeholder="Direkt im Web suchen ..."
                  />
                  <button className="btn btn-primary" onClick={runHeroWebSearch}>
                    Suchen
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>

        {dashboard && (
          <BookmarkBar
            bookmarks={dashboard.bookmarks}
            onOpenManager={() => {
              setBookmarkEditItem(null);
              setBookmarkManagerOpen(true);
            }}
            onEditItem={openBookmarkEditor}
            onDeleteItem={async (item) => {
              await deleteBookmarkItem(item.id);
            }}
            onReorder={reorderBookmarks}
          />
        )}

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
                rowHeight={32}
                margin={[14, 14]}
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

      {dashboard && (
        <BookmarkManagerDialog
          open={bookmarkManagerOpen}
          bookmarks={dashboard.bookmarks}
          onClose={() => {
            setBookmarkManagerOpen(false);
            setBookmarkEditItem(null);
          }}
          onCreate={createBookmarkItem}
          onUpdate={updateBookmarkItem}
          onDelete={deleteBookmarkItem}
          onReorder={reorderBookmarks}
          onImport={importBookmarks}
          onExport={exportBookmarks}
          initialEditItem={bookmarkEditItem}
        />
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
          widget.type === 'BOOKMARKS' ||
          widget.type === 'TELEGRAM_CHAT') && (
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
                <div className="widget-message">
                  Die eigentliche Verwaltung der Lesezeichen läuft über die Leiste unter dem Begrüßungsbereich
                  und das Zahnrad rechts daneben.
                </div>
              </div>
            )}
            {widget.type === 'TELEGRAM_CHAT' && (
              <div className="widget-subsection">
                <label className="form-label">Chat-ID</label>
                <input
                  className="input"
                  value={String(settings.chatId || '')}
                  onChange={(e) => setSettings((current) => ({ ...current, chatId: e.target.value }))}
                  placeholder="z. B. 123456789"
                />
                <label className="form-label">Bot-Name</label>
                <input
                  className="input"
                  value={String(settings.botUsername || 'OpenClaw Bot')}
                  onChange={(e) => setSettings((current) => ({ ...current, botUsername: e.target.value }))}
                  placeholder="OpenClaw Bot"
                />
                <label className="form-label">Begrüßungstext</label>
                <textarea
                  className="input widget-notes"
                  value={String(settings.greetingText || '')}
                  onChange={(e) => setSettings((current) => ({ ...current, greetingText: e.target.value }))}
                  placeholder="Optionaler Begrüßungstext im Chat-Widget"
                />
                <label className="form-label">Polling in Millisekunden</label>
                <input
                  className="input"
                  type="number"
                  min={5000}
                  step={1000}
                  value={String(settings.pollIntervalMs || 15000)}
                  onChange={(e) =>
                    setSettings((current) => ({
                      ...current,
                      pollIntervalMs: Number(e.target.value) || 15000,
                    }))
                  }
                />
                <div className="widget-message">
                  Das Secret für Telegram bleibt im Backend. Hinterlege dort
                  `TELEGRAM_BOT_TOKEN` oder `OPENCLAW_BOT_WEBHOOK_URL`.
                </div>
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
