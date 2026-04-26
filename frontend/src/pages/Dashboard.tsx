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
  type CalendarEvent,
  type CalendarWidgetState,
  dashboardApi,
  type BookmarkItem,
  type CommuteProfile,
  type CommuteRoute,
  type DashboardResponse,
  type DashboardWidget,
  type DashboardWidgetType,
  type WeatherResponse,
} from '../api/client';
import AppHeader from '../components/AppHeader';
import ThemeSelector from '../components/ThemeSelector';
import { BookmarkBar } from '../components/dashboard/BookmarkManager';
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
const radiusPresets = [
  { value: 12, label: 'Kompakt' },
  { value: 20, label: 'Weich' },
  { value: 28, label: 'Standard' },
  { value: 36, label: 'Rund' },
] as const;

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

function formatCalendarTimeRange(event: CalendarEvent) {
  if (event.isAllDay) return 'Ganztägig';

  const start = new Date(event.startAt);
  const end = new Date(event.endAt);
  return `${start.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} - ${end.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}`;
}

function formatCalendarDayLabel(value: string) {
  const date = new Date(value);
  const today = new Date();
  if (date.toDateString() === today.toDateString()) return 'Heute';

  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (date.toDateString() === tomorrow.toDateString()) return 'Morgen';

  return date.toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' });
}

function getCommuteMapPoints(route?: CommuteRoute | null) {
  const source =
    typeof route?.source?.latitude === 'number' && typeof route.source.longitude === 'number'
      ? { latitude: route.source.latitude, longitude: route.source.longitude }
      : null;
  const destination =
    typeof route?.destination?.latitude === 'number' && typeof route.destination.longitude === 'number'
      ? { latitude: route.destination.latitude, longitude: route.destination.longitude }
      : null;

  const geometry = (route?.geometry ?? []).filter(
    (point) => Number.isFinite(point.latitude) && Number.isFinite(point.longitude)
  );

  if (geometry.length >= 2) return geometry;
  return [source, destination].filter((point): point is { latitude: number; longitude: number } => Boolean(point));
}

function getOsmRouteUrl(route?: CommuteRoute | null) {
  const source = route?.source;
  const destination = route?.destination;
  if (
    typeof source?.latitude !== 'number' ||
    typeof source.longitude !== 'number' ||
    typeof destination?.latitude !== 'number' ||
    typeof destination.longitude !== 'number'
  ) {
    return null;
  }

  return `https://www.openstreetmap.org/directions?engine=fossgis_osrm_car&route=${source.latitude}%2C${source.longitude}%3B${destination.latitude}%2C${destination.longitude}`;
}

function CommuteRouteMap({ route }: { route: CommuteRoute }) {
  const points = getCommuteMapPoints(route);
  const osmUrl = getOsmRouteUrl(route);

  if (points.length < 2) {
    return (
      <div className="commute-map-empty">
        Die Route wurde gefunden, aber der Kartendienst hat keine Liniengeometrie geliefert.
      </div>
    );
  }

  const latitudes = points.map((point) => point.latitude);
  const longitudes = points.map((point) => point.longitude);
  const minLat = Math.min(...latitudes);
  const maxLat = Math.max(...latitudes);
  const minLon = Math.min(...longitudes);
  const maxLon = Math.max(...longitudes);
  const latRange = Math.max(maxLat - minLat, 0.0001);
  const lonRange = Math.max(maxLon - minLon, 0.0001);
  const padding = 10;
  const svgPoints = points
    .map((point) => {
      const x = padding + ((point.longitude - minLon) / lonRange) * (100 - padding * 2);
      const y = padding + ((maxLat - point.latitude) / latRange) * (100 - padding * 2);
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(' ');
  const renderedPoints = svgPoints.split(' ');
  const startPoint = renderedPoints[0];
  const endPoint = renderedPoints[renderedPoints.length - 1] ?? startPoint;

  return (
    <div className="commute-map-card">
      <svg className="commute-map-svg" viewBox="0 0 100 100" role="img" aria-label="Kartenansicht der Arbeitsweg-Route" preserveAspectRatio="none">
        <defs>
          <pattern id="commute-map-grid" width="12" height="12" patternUnits="userSpaceOnUse">
            <path d="M 12 0 L 0 0 0 12" fill="none" stroke="rgba(15, 23, 42, 0.08)" strokeWidth="0.6" />
          </pattern>
          <linearGradient id="commute-route-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#06b6d4" />
            <stop offset="100%" stopColor="#10b981" />
          </linearGradient>
        </defs>
        <rect width="100" height="100" rx="5" fill="url(#commute-map-grid)" />
        <polyline points={svgPoints} fill="none" stroke="rgba(2, 6, 23, 0.18)" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
        <polyline points={svgPoints} fill="none" stroke="url(#commute-route-gradient)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx={startPoint.split(',')[0]} cy={startPoint.split(',')[1]} r="4.2" className="commute-map-pin start" />
        <circle cx={endPoint.split(',')[0]} cy={endPoint.split(',')[1]} r="4.2" className="commute-map-pin end" />
      </svg>
      <div className="commute-map-labels">
        <span><strong>Start</strong>{route.source?.label || 'Startadresse'}</span>
        <span><strong>Ziel</strong>{route.destination?.label || 'Zieladresse'}</span>
      </div>
      {osmUrl ? (
        <a className="btn btn-secondary commute-map-link" href={osmUrl} target="_blank" rel="noreferrer">
          In OpenStreetMap öffnen
        </a>
      ) : null}
    </div>
  );
}

function getCalendarBadge(calendar: CalendarWidgetState) {
  if (calendar.status === 'setup_required') return 'Setup';
  if (calendar.status === 'error') return 'Fehler';
  if (calendar.events.some((event) => event.isNow)) return 'Laeuft jetzt';
  if (calendar.events[0]) return formatCalendarDayLabel(calendar.events[0].startAt);
  return 'Frei';
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

function flattenBookmarkItems(items: BookmarkItem[]): BookmarkItem[] {
  return items.flatMap((item) => [item, ...flattenBookmarkItems(item.children ?? [])]);
}

function scoreBookmarkMatch(bookmark: BookmarkItem, query: string) {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery || bookmark.itemType !== 'BOOKMARK' || !bookmark.url) return 0;

  const title = bookmark.title.toLowerCase();
  const url = bookmark.url.toLowerCase();
  const domain = bookmark.domain?.toLowerCase() ?? '';
  const category = bookmark.category?.toLowerCase() ?? '';
  const description = bookmark.description?.toLowerCase() ?? '';
  const notes = bookmark.notes?.toLowerCase() ?? '';
  const tags = (bookmark.tags ?? []).join(' ').toLowerCase();
  const haystack = `${title} ${url} ${domain} ${category} ${description} ${notes} ${tags}`;

  if (title === normalizedQuery) return 100;
  if (title.startsWith(normalizedQuery)) return 80;
  if (title.includes(normalizedQuery)) return 60;
  if (domain.includes(normalizedQuery)) return 45;
  if (url.includes(normalizedQuery)) return 35;
  if (tags.includes(normalizedQuery)) return 30;
  if (category.includes(normalizedQuery)) return 25;
  if (description.includes(normalizedQuery) || notes.includes(normalizedQuery)) return 15;
  if (normalizedQuery.split(/\s+/).every((part) => haystack.includes(part))) return 10;

  return 0;
}

export default function Dashboard() {
  const { user, logout, updateUser } = useAuthStore();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { width, containerRef, mounted } = useContainerWidth({ initialWidth: 1800 });
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
  const [activeBookmarkSuggestionIndex, setActiveBookmarkSuggestionIndex] = useState(0);
  const [profileName, setProfileName] = useState('');
  const [profileSubtitle, setProfileSubtitle] = useState(defaultSubtitle);
  const [showProfileSubtitle, setShowProfileSubtitle] = useState(true);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileMessage, setProfileMessage] = useState('');
  const [profileError, setProfileError] = useState('');
  const [projectForm, setProjectForm] = useState({ name: '', client: '', category: '', color: '#0f766e' });
  const [manualEntryForm, setManualEntryForm] = useState({ projectId: '', startTime: '', endTime: '', note: '' });
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [timerProjectId, setTimerProjectId] = useState('');
  const [busyAction, setBusyAction] = useState('');
  const [telegramDraft, setTelegramDraft] = useState('');
  const [telegramSending, setTelegramSending] = useState(false);
  const [commuteView, setCommuteView] = useState<'summary' | 'map'>('summary');
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
  const currentUiRadius = user?.uiRadius ?? 28;

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
            widget.type !== 'WEB_SEARCH' &&
            widget.type !== 'BOOKMARKS'
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
  const weatherWidgetVisible = dashboard?.widgets.some(
    (widget) => widget.type === 'WEATHER' && widget.isVisible
  );
  const webSearchProvider =
    typeof webSearchWidget?.settings?.provider === 'string' &&
    webSearchWidget.settings.provider in searchProviders
      ? (webSearchWidget.settings.provider as keyof typeof searchProviders)
      : 'duckduckgo';
  const bookmarkSuggestions = useMemo(() => {
    const query = webSearchQuery.trim();
    if (query.length < 2 || !dashboard?.bookmarks.tree.length) return [];

    return flattenBookmarkItems(dashboard.bookmarks.tree)
      .map((bookmark) => ({ bookmark, score: scoreBookmarkMatch(bookmark, query) }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score || a.bookmark.title.localeCompare(b.bookmark.title))
      .slice(0, 6)
      .map((item) => item.bookmark);
  }, [dashboard?.bookmarks.tree, webSearchQuery]);
  const telegramPollInterval = useMemo(() => {
    const chatSettings = dashboard?.telegramChat?.settings;
    if (!chatSettings) return 15000;
    return typeof chatSettings.pollIntervalMs === 'number' && chatSettings.pollIntervalMs >= 5000
      ? chatSettings.pollIntervalMs
      : 15000;
  }, [dashboard?.telegramChat?.settings]);
  const profileInitials = useMemo(() => {
    const name = (profileName || user?.displayName || user?.name || user?.email || '').trim();
    if (!name) return 'U';
    const parts = name.split(/\s+/).filter(Boolean);
    return parts.length > 1
      ? `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
      : name.slice(0, 2).toUpperCase();
  }, [profileName, user?.displayName, user?.email, user?.name]);
  const visibleWidgetCount = dashboard?.widgets.filter((widget) => widget.isVisible).length ?? 0;

  useEffect(() => {
    const timer = window.setTimeout(() => {
      webSearchInputRef.current?.focus();
      webSearchInputRef.current?.select();
    }, 120);

    return () => window.clearTimeout(timer);
  }, [dashboard?.widgets]);

  useEffect(() => {
    setActiveBookmarkSuggestionIndex(0);
  }, [webSearchQuery]);

  useEffect(() => {
    setActiveBookmarkSuggestionIndex((current) =>
      bookmarkSuggestions.length === 0 ? 0 : Math.min(current, bookmarkSuggestions.length - 1)
    );
  }, [bookmarkSuggestions.length]);

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
        uiRadius: currentUiRadius,
      });
      updateUser({
        name: data.name,
        displayName: data.displayName,
        dashboardSubtitle: data.dashboardSubtitle,
        showDashboardSubtitle: data.showDashboardSubtitle,
        uiRadius: data.uiRadius,
      });
      setProfileMessage('Profil gespeichert. Die Begrüßung wurde aktualisiert.');
    } catch (err: any) {
      setProfileError(err.response?.data?.error?.message || 'Profil konnte nicht gespeichert werden');
    } finally {
      setProfileSaving(false);
    }
  };

  const saveUiRadius = async (uiRadius: number) => {
    try {
      const { data } = await authApi.updateMe({ uiRadius });
      updateUser({ uiRadius: data.uiRadius });
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Design-Rundung konnte nicht gespeichert werden');
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

  const deleteBookmarkItem = async (bookmarkId: string) => {
    try {
      await dashboardApi.bookmarks.delete(bookmarkId);
      await refreshBookmarks();
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Lesezeichen konnte nicht gelöscht werden');
      throw err;
    }
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

  const openBookmarkSuggestion = (bookmark: BookmarkItem) => {
    if (!bookmark.url) return;
    window.open(bookmark.url, '_blank', 'noopener,noreferrer');
  };

  const handleWebSearchKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' && bookmarkSuggestions.length > 0) {
      event.preventDefault();
      setActiveBookmarkSuggestionIndex((current) => (current + 1) % bookmarkSuggestions.length);
      return;
    }

    if (event.key === 'ArrowUp' && bookmarkSuggestions.length > 0) {
      event.preventDefault();
      setActiveBookmarkSuggestionIndex((current) =>
        current === 0 ? bookmarkSuggestions.length - 1 : current - 1
      );
      return;
    }

    if (event.key === 'Escape') {
      setWebSearchQuery('');
      return;
    }

    if (event.key === 'Enter') {
      const selectedBookmark = bookmarkSuggestions[activeBookmarkSuggestionIndex];
      if (selectedBookmark) {
        event.preventDefault();
        openBookmarkSuggestion(selectedBookmark);
        return;
      }

      runHeroWebSearch();
    }
  };

  const renderBookmarkSuggestions = (compact = false) => {
    if (bookmarkSuggestions.length === 0) return null;

    return (
      <div className={`web-bookmark-suggestions ${compact ? 'compact' : ''}`} role="listbox">
        {bookmarkSuggestions.map((bookmark, index) => (
          <button
            key={bookmark.id}
            type="button"
            className={`web-bookmark-suggestion ${index === activeBookmarkSuggestionIndex ? 'active' : ''}`}
            onMouseEnter={() => setActiveBookmarkSuggestionIndex(index)}
            onMouseDown={(event) => {
              event.preventDefault();
              openBookmarkSuggestion(bookmark);
            }}
            role="option"
            aria-selected={index === activeBookmarkSuggestionIndex}
          >
            {bookmark.faviconUrl ? (
              <img className="bookmark-favicon" src={bookmark.faviconUrl} alt="" />
            ) : (
              <span className="bookmark-favicon-fallback">{bookmark.title.slice(0, 1).toUpperCase()}</span>
            )}
            <span className="web-bookmark-suggestion-copy">
              <strong>{bookmark.title}</strong>
              <span>{bookmark.url}</span>
            </span>
          </button>
        ))}
      </div>
    );
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
          <WidgetShell title={widget.title} subtitle="Suche direkt in Bereichen und Seiten" compact>
            <div className="widget-inline-form widget-inline-form-compact">
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
                className="btn btn-primary widget-inline-button"
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
        const runWidgetWebSearch = () => {
          if (!webSearchQuery.trim()) return;
          window.open(providerUrl, '_blank', 'noopener,noreferrer');
        };

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
                onKeyDown={handleWebSearchKeyDown}
                placeholder="Im Web und in Lesezeichen suchen"
              />
              <button
                className="btn btn-primary"
                onClick={runWidgetWebSearch}
              >
                Öffnen
              </button>
            </div>
            {renderBookmarkSuggestions(true)}
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
      case 'CALENDAR': {
        const calendar = dashboard?.calendar;
        const maxItems = typeof settings.maxItems === 'number' ? Math.max(1, Math.min(12, settings.maxItems)) : 6;
        const showCalendarColors = settings.showCalendarColors !== false;
        const visibleEvents = (calendar?.events ?? []).slice(0, maxItems);
        const primaryEvent = visibleEvents.find((event) => event.isNow || event.startsSoon) ?? visibleEvents[0];

        return (
          <WidgetShell
            title={widget.title}
            subtitle="Heute und die naechsten Termine aus Nextcloud"
            badge={calendar ? getCalendarBadge(calendar) : 'Kalender'}
            actions={calendar?.nextcloudUrl ? <a className="btn btn-secondary" href={calendar.nextcloudUrl} target="_blank" rel="noreferrer">Nextcloud</a> : undefined}
          >
            {calendar?.status === 'setup_required' ? (
              <div className="widget-stack">
                <div className="widget-message">{calendar.message || 'Die Nextcloud-Kalenderanbindung ist noch nicht eingerichtet.'}</div>
                <div className="widget-toolbar-end">
                  <Link className="btn btn-primary" to="/calendar-contacts">Einrichtung ansehen</Link>
                </div>
              </div>
            ) : calendar?.status === 'error' ? (
              <div className="widget-stack">
                <div className="widget-message widget-message-error">{calendar.message || 'Kalender konnte nicht geladen werden.'}</div>
                {calendar.nextcloudUrl ? (
                  <div className="widget-toolbar-end">
                    <a className="btn btn-secondary" href={calendar.nextcloudUrl} target="_blank" rel="noreferrer">In Nextcloud oeffnen</a>
                  </div>
                ) : null}
              </div>
            ) : visibleEvents.length === 0 ? (
              <div className="widget-stack">
                <div className="widget-message">Heute sind keine Termine geplant. Das Widget zeigt automatisch die naechsten Eintraege, sobald Daten verfuegbar sind.</div>
                <div className="calendar-widget-meta">
                  <span>{calendar?.calendars.length ?? 0} Kalender verbunden</span>
                  {calendar?.lastSyncedAt ? <span>Aktualisiert {formatDateLabel(calendar.lastSyncedAt)}</span> : null}
                </div>
              </div>
            ) : (
              <div className="calendar-widget-shell">
                {primaryEvent ? (
                  <div className="calendar-widget-hero">
                    <div className="calendar-widget-hero-label">
                      {primaryEvent.isNow ? 'Laeuft jetzt' : primaryEvent.startsSoon ? 'Beginnt bald' : formatCalendarDayLabel(primaryEvent.startAt)}
                    </div>
                    <div className="calendar-widget-hero-title">{primaryEvent.title}</div>
                    <div className="calendar-widget-hero-copy">{formatCalendarTimeRange(primaryEvent)}</div>
                    <div className="calendar-widget-hero-copy">
                      {primaryEvent.calendarName}
                      {primaryEvent.location ? ` • ${primaryEvent.location}` : ''}
                    </div>
                  </div>
                ) : null}

                <div className="calendar-widget-list">
                  {visibleEvents.map((event) => (
                    <a
                      key={event.id}
                      className="calendar-widget-item"
                      href={event.nextcloudUrl || calendar?.nextcloudUrl || '#'}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <div className="calendar-widget-item-side">
                        {showCalendarColors ? (
                          <span
                            className="calendar-widget-color"
                            style={{ backgroundColor: event.calendarColor || '#0ea5e9' }}
                            aria-hidden="true"
                          />
                        ) : null}
                        <div>
                          <div className="calendar-widget-day">{formatCalendarDayLabel(event.startAt)}</div>
                          <div className="calendar-widget-time">{formatCalendarTimeRange(event)}</div>
                        </div>
                      </div>
                      <div className="calendar-widget-item-main">
                        <strong>{event.title}</strong>
                        <span>
                          {event.calendarName}
                          {event.location ? ` • ${event.location}` : ''}
                        </span>
                      </div>
                      <div className="calendar-widget-item-status">
                        {event.isNow ? 'Jetzt' : event.startsSoon ? 'Bald' : event.isToday ? 'Heute' : 'Spaeter'}
                      </div>
                    </a>
                  ))}
                </div>

                <div className="calendar-widget-meta">
                  <span>{calendar?.calendars.length ?? 0} Kalender verbunden</span>
                  {calendar?.lastSyncedAt ? <span>Aktualisiert {formatDateLabel(calendar.lastSyncedAt)}</span> : null}
                </div>
              </div>
            )}
          </WidgetShell>
        );
      }
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
              <div className="commute-widget">
                <div className="commute-view-toggle" role="tablist" aria-label="Arbeitsweg Ansicht">
                  <button className={commuteView === 'summary' ? 'active' : ''} onClick={() => setCommuteView('summary')} type="button">
                    Übersicht
                  </button>
                  <button className={commuteView === 'map' ? 'active' : ''} onClick={() => setCommuteView('map')} type="button">
                    Karte
                  </button>
                </div>

                {commuteView === 'map' ? (
                  <CommuteRouteMap route={commute.route} />
                ) : (
                  <>
                    <div className="commute-route-card">
                      <div>
                        <span>Start</span>
                        <strong>{commute.profile.sourceAddress}</strong>
                      </div>
                      <div className="commute-route-line" aria-hidden="true" />
                      <div>
                        <span>Ziel</span>
                        <strong>{commute.profile.destinationAddress}</strong>
                      </div>
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
                  </>
                )}
              </div>
            ) : (
              <div className="commute-widget">
                {commute.route ? (
                  <div className="commute-view-toggle" role="tablist" aria-label="Arbeitsweg Ansicht">
                    <button className="active" type="button">
                      Übersicht
                    </button>
                    <button disabled type="button">
                      Karte
                    </button>
                  </div>
                ) : null}
                <div className="widget-message">{commute?.route?.message || 'Heute liegen keine Routendaten vor.'}</div>
              </div>
            )}
          </WidgetShell>
        );
      }
      case 'TIME_TRACKER': {
        const compactTimeTracking = dashboard?.timeTracking;
        const compactRunningEntry = compactTimeTracking?.runningEntry;
        const compactRunningDurationMinutes = compactRunningEntry
          ? Math.max(1, Math.round((now.getTime() - new Date(compactRunningEntry!.startTime).getTime()) / 60000))
          : 0;
        const compactActiveProjects = compactTimeTracking?.projects.filter((project) => !project.isArchived) ?? [];
        const compactSelectedProject = compactActiveProjects.find((project) => project.id === timerProjectId);
        const compactRecentEntries = compactTimeTracking?.entries.slice(0, 5) ?? [];

        return (
          <WidgetShell title={widget.title} subtitle="Timer, Tagesstand und schnelle Nachträge" badge={compactRunningEntry ? 'Läuft' : 'Bereit'}>
            <div className="time-widget">
              <div className={`time-widget-hero ${compactRunningEntry ? 'is-running' : ''}`}>
                <div className="time-widget-status">
                  <span>{compactRunningEntry ? 'Aktiver Timer' : 'Heute erfasst'}</span>
                  <strong>{compactRunningEntry ? formatMinutes(compactRunningDurationMinutes) : formatMinutes(compactTimeTracking?.summary.todayMinutes ?? 0)}</strong>
                  <em>
                    {compactRunningEntry
                      ? `${compactRunningEntry.project?.name || 'Projekt'} seit ${new Date(compactRunningEntry!.startTime).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}`
                      : compactSelectedProject?.name || 'Projekt auswählen'}
                  </em>
                </div>
                <div className="time-widget-controls">
                  <select className="input" value={timerProjectId} onChange={(e) => setTimerProjectId(e.target.value)} disabled={Boolean(compactRunningEntry)}>
                    <option value="">Projekt auswählen</option>
                    {compactActiveProjects.map((project) => (
                      <option key={project.id} value={project.id}>
                        {project.name}
                      </option>
                    ))}
                  </select>
                  {compactRunningEntry ? (
                    <button className="btn btn-primary" onClick={() => stopTimer(compactRunningEntry!.id)}>
                      Stoppen
                    </button>
                  ) : (
                    <button className="btn btn-primary" onClick={startTimer} disabled={!timerProjectId}>
                      Starten
                    </button>
                  )}
                </div>
              </div>

              <div className="time-widget-stats">
                <div className="time-stat-card">
                  <span>Heute</span>
                  <strong>{formatMinutes(compactTimeTracking?.summary.todayMinutes ?? 0)}</strong>
                </div>
                <div className="time-stat-card">
                  <span>Woche</span>
                  <strong>{formatMinutes(compactTimeTracking?.summary.weekMinutes ?? 0)}</strong>
                </div>
                <div className="time-stat-card">
                  <span>Projekte</span>
                  <strong>{compactActiveProjects.length}</strong>
                </div>
              </div>

              <details className="time-widget-panel">
                <summary>Projekt anlegen</summary>
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
              </details>

              <details className="time-widget-panel" open={Boolean(editingEntryId)}>
                <summary>{editingEntryId ? 'Eintrag bearbeiten' : 'Manuellen Eintrag erfassen'}</summary>
                <div className="widget-form-grid">
                  <select className="input" value={manualEntryForm.projectId} onChange={(e) => setManualEntryForm((current) => ({ ...current, projectId: e.target.value }))}>
                    <option value="">Projekt auswählen</option>
                    {compactActiveProjects.map((project) => (
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
              </details>

              <div className="time-widget-history">
                <div className="time-widget-history-header">
                  <span>Letzte Einträge</span>
                  <small>{compactRecentEntries.length} sichtbar</small>
                </div>
                {compactRecentEntries.length ? (
                  compactRecentEntries.map((entry) => (
                    <div key={entry.id} className="time-entry-row">
                      <span className="time-entry-dot" style={{ backgroundColor: entry.project?.color || '#0ea5e9' }} />
                      <div className="time-entry-main">
                        <strong>{entry.project?.name || 'Projekt'}</strong>
                        <small>
                          {formatDateLabel(entry.startTime)}
                          {entry.endTime ? ` bis ${formatDateLabel(entry.endTime)}` : ' • läuft'}
                        </small>
                      </div>
                      <em>{formatMinutes(entry.durationMinutes ?? (entry.endTime ? 0 : compactRunningDurationMinutes))}</em>
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
                  ))
                ) : (
                  <div className="widget-message">Noch keine Zeiten erfasst.</div>
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
      <AppHeader
        onToggleEditMode={() => setEditMode((current) => !current)}
        editMode={editMode}
        onOpenWidgetLibrary={() => setWidgetLibraryOpen(true)}
        onOpenProfile={() => setSettingsOpen(true)}
      />
      <div className="legacy-profile-grid">
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
          <Link to="/calendar-contacts" className="text-button">
            Kalender & Kontakte
          </Link>
          <Link to="/bookmarks" className="text-button">
            Lesezeichen
          </Link>
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
      </div>

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
                  <div className="dashboard-hero-meta">
                    {weatherWidgetVisible && (
                      <div className="dashboard-weather-chip">
                        {weatherLoading ? (
                          <span>Wetter lädt ...</span>
                        ) : weather ? (
                          <>
                            <strong>{weather.temperatureC} °C</strong>
                            <span>{weather.description}</span>
                          </>
                        ) : weatherError ? (
                          <span>{weatherCity}</span>
                        ) : (
                          <span>{weatherCity}</span>
                        )}
                      </div>
                    )}
                    <span className="dashboard-user-chip compact-chip">
                      <span>{user?.displayName || user?.name}</span>
                      <strong>{user?.globalRole}</strong>
                    </span>
                  </div>
                </div>
                <div className="widget-inline-form stretch-mobile">
                  <input
                    ref={webSearchInputRef}
                    className="input"
                    value={webSearchQuery}
                    onChange={(e) => setWebSearchQuery(e.target.value)}
                    onKeyDown={handleWebSearchKeyDown}
                    placeholder="Direkt im Web und in Lesezeichen suchen ..."
                  />
                  <button className="btn btn-primary" onClick={runHeroWebSearch}>
                    Suchen
                  </button>
                </div>
                {renderBookmarkSuggestions()}
              </div>
            </div>
          </div>
        </section>

        {dashboard && (
          <BookmarkBar
            bookmarks={dashboard.bookmarks}
            onOpenManager={() => navigate('/bookmarks')}
            onEditItem={() => navigate('/bookmarks')}
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
            <div className="dashboard-radius-toolbar">
              <span className="dashboard-radius-label">Globale Rundung</span>
              <div className="dashboard-radius-options">
                {radiusPresets.map((preset) => (
                  <button
                    key={preset.value}
                    type="button"
                    className={`chip-button ${currentUiRadius === preset.value ? 'active' : ''}`}
                    onClick={() => void saveUiRadius(preset.value)}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>
          </section>
        )}

        {isMobile ? (
          <div className="dashboard-mobile-stack">
            {visibleWidgets.map((widget) => (
              <div key={widget.id} className="dashboard-widget-frame auto-widget-frame mobile-frame">
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
        ) : !editMode ? (
          <div className="dashboard-widget-grid">
            {visibleWidgets.map((widget) => (
              <div key={widget.id} className="dashboard-widget-frame auto-widget-frame">
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
                  <div key={widget.id} className="dashboard-widget-frame layout-widget-frame">
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
            <section className="profile-hero-card">
              <div className="profile-avatar">{profileInitials}</div>
              <div className="profile-hero-copy">
                <span>Angemeldet als</span>
                <strong>{user?.displayName || user?.name || 'Benutzer'}</strong>
                <small>{user?.email}</small>
              </div>
              <div className="profile-role-pill">{user?.globalRole || 'USER'}</div>
            </section>

            <div className="profile-layout-grid">
              <section className="dialog-card profile-main-card">
                <div className="profile-section-header">
                  <div>
                    <span>Stammdaten</span>
                    <h3>Persoenliche Angaben</h3>
                  </div>
                </div>
                <div className="profile-form-grid">
                  <label className="profile-field">
                    <span>Anzeigename</span>
                    <input className="input" value={profileName} onChange={(e) => setProfileName(e.target.value)} placeholder="Name fuer die Begruessung" />
                  </label>
                  <label className="profile-field">
                    <span>E-Mail</span>
                    <input className="input" value={user?.email || ''} disabled />
                  </label>
                  <label className="profile-field">
                    <span>Rolle</span>
                    <input className="input" value={user?.globalRole || 'USER'} disabled />
                  </label>
                  <label className="checkbox-row profile-toggle-row">
                    <input type="checkbox" checked={showProfileSubtitle} onChange={(e) => setShowProfileSubtitle(e.target.checked)} />
                    <span>Dashboard-Unterzeile anzeigen</span>
                  </label>
                </div>
                <label className="profile-field">
                  <span>Dashboard-Unterzeile</span>
                  <textarea className="input widget-notes" value={profileSubtitle} onChange={(e) => setProfileSubtitle(e.target.value)} placeholder={defaultSubtitle} />
                </label>
                {profileError && <div className="widget-message widget-message-error">{profileError}</div>}
                {profileMessage && <div className="widget-message widget-message-success">{profileMessage}</div>}
                <div className="widget-toolbar-end">
                  <button className="btn btn-primary" onClick={saveProfile} disabled={profileSaving}>
                    {profileSaving ? 'Speichert ...' : 'Profil speichern'}
                  </button>
                </div>
              </section>

              <aside className="profile-side-stack">
                <section className="dialog-card">
                  <div className="profile-section-header">
                    <div>
                      <span>Status</span>
                      <h3>Account</h3>
                    </div>
                  </div>
                  <div className="profile-detail-list">
                    <div><span>Name</span><strong>{user?.displayName || user?.name || '-'}</strong></div>
                    <div><span>E-Mail</span><strong>{user?.email || '-'}</strong></div>
                    <div><span>Rolle</span><strong>{user?.globalRole || 'USER'}</strong></div>
                  </div>
                </section>

                <section className="dialog-card">
                  <div className="profile-section-header">
                    <div>
                      <span>Design</span>
                      <h3>Darstellung</h3>
                    </div>
                  </div>
                  <div className="dashboard-radius-options profile-radius-options">
                    {radiusPresets.map((preset) => (
                      <button
                        key={preset.value}
                        type="button"
                        className={`chip-button ${currentUiRadius === preset.value ? 'active' : ''}`}
                        onClick={() => void saveUiRadius(preset.value)}
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                </section>
              </aside>

              <section className="dialog-card span-2">
                <div className="profile-section-header">
                  <div>
                    <span>Dashboard</span>
                    <h3>Uebersicht</h3>
                  </div>
                </div>
                <div className="widget-stat-grid">
                  <div className="widget-stat-box"><span>Widgets sichtbar</span><strong>{visibleWidgetCount}</strong></div>
                  <div className="widget-stat-box"><span>Widgets gesamt</span><strong>{dashboard?.widgets.length ?? 0}</strong></div>
                  <div className="widget-stat-box"><span>Lesezeichen</span><strong>{dashboard?.bookmarks.bookmarkCount ?? 0}</strong></div>
                  <div className="widget-stat-box"><span>Bereiche</span><strong>{dashboard?.spaces.total ?? 0}</strong></div>
                </div>
              </section>

              <section className="dialog-card span-2">
                <div className="profile-section-header">
                  <div>
                    <span>Konfiguration</span>
                    <h3>Aktive Widgets</h3>
                  </div>
                  <button className="btn btn-secondary" onClick={() => setWidgetLibraryOpen(true)}>
                    Widget hinzufuegen
                  </button>
                </div>
                <div className="profile-widget-list">
                  {dashboard?.widgets.filter((widget) => widget.type !== 'BOOKMARKS').map((widget) => {
                    const definition = widgetDefinitionMap[widget.type] ?? {
                      label: widget.type,
                      description: 'Dashboard-Widget',
                    };

                    return (
                      <button
                        key={widget.id}
                        className="profile-widget-row"
                        onClick={() => {
                          setWidgetConfigId(widget.id);
                          setSettingsOpen(false);
                        }}
                      >
                        <span>
                          <strong>{definition.label}</strong>
                          <small>{widget.title || definition.description}</small>
                        </span>
                        <em>{widget.isVisible ? 'Sichtbar' : 'Ausgeblendet'}</em>
                      </button>
                    );
                  })}
                </div>
              </section>
            </div>
            <div className="dialog-grid legacy-profile-grid">
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
                  {dashboard?.widgets.filter((widget) => widget.type !== 'BOOKMARKS').map((widget) => (
                    <button
                      key={widget.id}
                      className="mini-card-link static-card align-left"
                      onClick={() => {
                        setWidgetConfigId(widget.id);
                        setSettingsOpen(false);
                      }}
                    >
                      <strong>{widgetDefinitionMap[widget.type]?.label ?? widget.type}</strong>
                      <span>{widget.title || widgetDefinitionMap[widget.type]?.description || 'Dashboard-Widget'}</span>
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
          calendarState={dashboard.calendar}
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
  calendarState,
  commuteProfile,
  onClose,
  onSaveWidget,
  onSaveCommute,
}: {
  widget: DashboardWidget;
  spaces: DashboardResponse['spaces']['items'];
  calendarState: DashboardResponse['calendar'];
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
          widget.type === 'CALENDAR' ||
          widget.type === 'WEB_SEARCH' ||
          widget.type === 'FAVORITE_SPACES' ||
          widget.type === 'NOTES' ||
          widget.type === 'TELEGRAM_CHAT') && (
          <div className="widget-stack">
            {widget.type === 'CALENDAR' && (
              <div className="widget-subsection">
                <label className="form-label">Ansicht</label>
                <select className="input" value={String(settings.mode || 'agenda')} onChange={(e) => setSettings((current) => ({ ...current, mode: e.target.value }))}>
                  <option value="agenda">Agenda</option>
                  <option value="today">Heute</option>
                  <option value="next">Naechste Termine</option>
                </select>

                <label className="form-label">Maximale Eintraege</label>
                <input
                  className="input"
                  type="number"
                  min={1}
                  max={12}
                  value={String(settings.maxItems || 6)}
                  onChange={(e) => setSettings((current) => ({ ...current, maxItems: Number(e.target.value) || 6 }))}
                />

                <label className="checkbox-card align-left">
                  <input
                    type="checkbox"
                    checked={settings.showCalendarColors !== false}
                    onChange={(e) => setSettings((current) => ({ ...current, showCalendarColors: e.target.checked }))}
                  />
                  <span>Kalenderfarben anzeigen</span>
                </label>

                <label className="form-label">Zeitraum fuer `beginnt bald` in Minuten</label>
                <input
                  className="input"
                  type="number"
                  min={5}
                  max={360}
                  step={5}
                  value={String(settings.highlightWindowMinutes || 90)}
                  onChange={(e) => setSettings((current) => ({ ...current, highlightWindowMinutes: Number(e.target.value) || 90 }))}
                />

                {calendarState.calendars.length > 0 ? (
                  <>
                    <label className="form-label">Sichtbare Kalender</label>
                    <div className="option-grid">
                      {calendarState.calendars.map((calendar) => {
                        const activeIds = Array.isArray(settings.calendarIds) ? (settings.calendarIds as string[]) : [];
                        const checked = activeIds.includes(calendar.id);
                        return (
                          <label key={calendar.id} className="checkbox-card align-left">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() =>
                                setSettings((current) => ({
                                  ...current,
                                  calendarIds: checked
                                    ? activeIds.filter((id) => id !== calendar.id)
                                    : [...activeIds, calendar.id],
                                }))
                              }
                            />
                            <span>{calendar.name}</span>
                          </label>
                        );
                      })}
                    </div>
                  </>
                ) : (
                  <div className="widget-message">
                    {calendarState.message || 'Sobald die Nextcloud-Anbindung aktiv ist, koennen hier einzelne Kalender gewaehlt werden.'}
                  </div>
                )}
              </div>
            )}
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
