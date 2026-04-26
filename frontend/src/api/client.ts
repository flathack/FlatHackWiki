import axios from 'axios';
import { useAuthStore } from '../context/auth.store';

export const API_BASE = import.meta.env.VITE_API_URL || '/api/v1';

export const api = axios.create({
  baseURL: API_BASE,
  headers: { 'Content-Type': 'application/json' },
});

const refreshClient = axios.create({
  baseURL: API_BASE,
  headers: { 'Content-Type': 'application/json' },
});

let refreshPromise: Promise<string | null> | null = null;

api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config as (typeof error.config & { _retry?: boolean }) | undefined;

    if (error.response?.status === 401 && originalRequest && !originalRequest._retry) {
      originalRequest._retry = true;

      const { refreshToken, setTokens, logout } = useAuthStore.getState();
      if (!refreshToken) {
        return Promise.reject(error);
      }

      try {
        if (!refreshPromise) {
          refreshPromise = refreshClient
            .post('/auth/refresh', { refreshToken })
            .then((response) => {
              const nextAccessToken = response.data.accessToken as string;
              const nextRefreshToken = response.data.refreshToken as string;
              setTokens({
                accessToken: nextAccessToken,
                refreshToken: nextRefreshToken,
              });
              return nextAccessToken;
            })
            .catch((refreshError) => {
              logout();
              window.location.href = '/login';
              throw refreshError;
            })
            .finally(() => {
              refreshPromise = null;
            });
        }

        const nextAccessToken = await refreshPromise;
        if (nextAccessToken) {
          originalRequest.headers = originalRequest.headers ?? {};
          originalRequest.headers.Authorization = `Bearer ${nextAccessToken}`;
        }

        return api(originalRequest);
      } catch (refreshError) {
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  }
);

export interface LoginRequest { email: string; password: string }
export interface RegisterRequest { email: string; password: string; name: string }
export interface MeResponse {
  id: string;
  email: string;
  name: string;
  displayName: string;
  globalRole: string;
  dashboardSubtitle: string | null;
  showDashboardSubtitle: boolean;
  uiRadius?: number;
  nextcloudUsername?: string | null;
  hasNextcloudAppPassword?: boolean;
  profile?: {
    displayName?: string | null;
    dashboardSubtitle?: string | null;
    showDashboardSubtitle?: boolean;
    uiRadius?: number;
    avatarUrl?: string | null;
    timezone?: string;
    locale?: string;
    nextcloudUsername?: string | null;
  } | null;
}
export interface Space { id: string; name: string; key: string; description?: string; visibility: string; owner: { id: string; name: string } }
export interface Page { id: string; title: string; slug: string; content?: string; status: string; parentId?: string | null; createdAt: string; updatedAt: string; creator?: { id: string; name: string } }
export type DashboardWidgetType =
  | 'CLOCK'
  | 'WIKI_SEARCH'
  | 'WEB_SEARCH'
  | 'WEATHER'
  | 'CALENDAR'
  | 'FAVORITE_SPACES'
  | 'NOTES'
  | 'STATS'
  | 'SPACES'
  | 'COMMUTE'
  | 'TIME_TRACKER'
  | 'BOOKMARKS'
  | 'TELEGRAM_CHAT';
export interface DashboardWidget {
  id: string;
  type: DashboardWidgetType;
  title: string;
  isVisible: boolean;
  isCollapsed: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
  minWidth: number;
  minHeight: number;
  maxWidth?: number | null;
  maxHeight?: number | null;
  mobileOrder: number;
  settings: Record<string, unknown>;
}
export interface BookmarkItem {
  id: string;
  parentId?: string | null;
  itemType: 'BOOKMARK' | 'FOLDER';
  title: string;
  url?: string | null;
  normalizedUrl?: string | null;
  domain?: string | null;
  description?: string | null;
  notes?: string | null;
  category?: string | null;
  tags: string[];
  faviconUrl?: string | null;
  isFavorite: boolean;
  isPinned: boolean;
  isArchived: boolean;
  showInToolbar: boolean;
  linkStatus: 'UNKNOWN' | 'OK' | 'BROKEN' | 'REDIRECTED';
  httpStatus?: number | null;
  lastCheckedAt?: string | null;
  lastOpenedAt?: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  children: BookmarkItem[];
}
export interface BookmarkState {
  tree: BookmarkItem[];
  toolbar: BookmarkItem[];
  totalCount: number;
  bookmarkCount: number;
  folderCount: number;
  favoriteCount: number;
  archivedCount: number;
  pinnedCount: number;
}
export interface CommuteProfile {
  id: string;
  sourceAddress: string;
  destinationAddress: string;
  officeDays: string[];
  homeOfficeDays: string[];
  outboundLabel?: string | null;
  returnLabel?: string | null;
  departureTime?: string | null;
  returnDepartureTime?: string | null;
}
export interface CommuteRoute {
  status: 'ok' | 'fallback';
  summary?: string;
  distanceKm?: number;
  durationMinutes?: number;
  message?: string;
  trafficNote?: string;
  source?: { label: string };
  destination?: { label: string };
}
export interface CalendarSource {
  id: string;
  name: string;
  color?: string | null;
}
export interface CalendarEvent {
  id: string;
  calendarId: string;
  calendarName: string;
  calendarColor?: string | null;
  title: string;
  startAt: string;
  endAt: string;
  isAllDay: boolean;
  isRecurring: boolean;
  location?: string | null;
  isToday: boolean;
  isNow: boolean;
  startsSoon: boolean;
  nextcloudUrl?: string | null;
}
export interface CalendarWidgetState {
  status: 'disabled' | 'setup_required' | 'ready' | 'error';
  message?: string | null;
  nextcloudUrl?: string | null;
  calendars: CalendarSource[];
  events: CalendarEvent[];
  lastSyncedAt?: string | null;
}
export interface TimeTrackingProject {
  id: string;
  name: string;
  description?: string | null;
  color?: string | null;
  client?: string | null;
  category?: string | null;
  isArchived: boolean;
}
export interface TimeEntry {
  id: string;
  projectId: string;
  startTime: string;
  endTime?: string | null;
  durationMinutes?: number | null;
  note?: string | null;
  entryType: 'TIMER' | 'MANUAL';
  project: TimeTrackingProject;
}
export interface TelegramChatMessage {
  id: string;
  senderRole: 'USER' | 'BOT' | 'SYSTEM';
  provider: 'LOCAL_PREVIEW' | 'TELEGRAM_PROXY' | 'OPENCLAW_RELAY';
  content: string;
  chatId?: string | null;
  metadata?: Record<string, unknown>;
  createdAt: string;
}
export interface DashboardResponse {
  widgets: DashboardWidget[];
  bookmarks: BookmarkState;
  calendar: CalendarWidgetState;
  commute: {
    profile: CommuteProfile | null;
    todayMode: 'office' | 'homeOffice' | 'unspecified' | 'unset';
    route: CommuteRoute | null;
  };
  timeTracking: {
    projects: TimeTrackingProject[];
    runningEntry: TimeEntry | null;
    entries: TimeEntry[];
    summary: {
      todayMinutes: number;
      weekMinutes: number;
    };
  };
  spaces: {
    total: number;
    publicCount: number;
    items: Space[];
    favorites: Space[];
  };
  telegramChat: {
    messages: TelegramChatMessage[];
    configured: boolean;
    provider: 'local-preview' | 'telegram-proxy' | 'openclaw-relay';
    settings: {
      chatId: string;
      pollIntervalMs: number;
      greetingText: string;
      botUsername: string;
    };
  };
}
export interface WeatherResponse {
  location: string;
  temperatureC: string;
  description: string;
  humidity: string;
  windKph: string;
}
export interface AdminUser {
  id: string;
  email: string;
  name: string;
  status: 'ACTIVE' | 'INACTIVE' | 'DELETED';
  globalRole: string;
  createdAt: string;
  updatedAt: string;
  profile?: { displayName?: string | null; avatarUrl?: string | null } | null;
}
export interface AdminAuditEntry {
  id: string;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  ipAddress?: string | null;
  createdAt: string;
  user?: { id: string; name: string; email: string } | null;
}
export interface AdminStats {
  userCount: number;
  activeUserCount: number;
  inactiveUserCount: number;
  spaceCount: number;
  pageCount: number;
  commentCount: number;
  auditLogCount: number;
  sessionCount: number;
}

export const authApi = {
  login: (data: LoginRequest) => api.post<{ accessToken: string; refreshToken: string; user: any }>('/auth/login', data),
  register: (data: RegisterRequest) => api.post('/auth/register', data),
  logout: (refreshToken: string) => api.post('/auth/logout', { refreshToken }),
  me: () => api.get<MeResponse>('/auth/me'),
  oidcConfig: () => api.get<{
    enabled: boolean;
    providerName: string;
    loginUrl: string | null;
    logoutUrl: string | null;
  }>('/auth/oidc/config'),
  updateMe: (data: {
    displayName?: string;
    dashboardSubtitle?: string | null;
    showDashboardSubtitle?: boolean;
    uiRadius?: number;
    nextcloudUsername?: string | null;
    nextcloudAppPassword?: string | null;
  }) => api.patch<MeResponse & { message: string }>('/auth/me', data),
};

export const spacesApi = {
  list: () => api.get<Space[]>('/spaces'),
  get: (key: string) => api.get<Space>(`/spaces/${key}`),
  create: (data: { name: string; key: string; description?: string; visibility?: string }) => api.post('/spaces', data),
  update: (key: string, data: Partial<Space>) => api.put(`/spaces/${key}`, data),
  delete: (key: string) => api.delete(`/spaces/${key}`),
  members: {
    list: (key: string) => api.get(`/spaces/${key}/members`),
    add: (key: string, data: { userId: string; role: string }) => api.post(`/spaces/${key}/members`, data),
    update: (key: string, userId: string, role: string) => api.put(`/spaces/${key}/members/${userId}`, { role }),
    remove: (key: string, userId: string) => api.delete(`/spaces/${key}/members/${userId}`),
  },
};

export const pagesApi = {
  list: (spaceKey: string) => api.get<Page[]>(`/spaces/${spaceKey}/pages`),
  get: (spaceKey: string, slug: string) => api.get<Page>(`/spaces/${spaceKey}/pages/${slug}`),
  create: (spaceKey: string, data: { title: string; slug: string; content?: string; parentId?: string }) => api.post(`/spaces/${spaceKey}/pages`, data),
  update: (spaceKey: string, slug: string, data: Partial<Page>) => api.put(`/spaces/${spaceKey}/pages/${slug}`, data),
  delete: (spaceKey: string, slug: string) => api.delete(`/spaces/${spaceKey}/pages/${slug}`),
  move: (spaceKey: string, slug: string, data: { parentId?: string; position?: number }) => api.put(`/spaces/${spaceKey}/pages/${slug}/move`, data),
  versions: (spaceKey: string, slug: string) => api.get(`/spaces/${spaceKey}/pages/${slug}/versions`),
};

export const searchApi = {
  search: (params: { q: string; space?: string; type?: string }) => api.get('/search', { params }),
};

export const dashboardApi = {
  get: () => api.get<DashboardResponse>('/dashboard'),
  createWidget: (data: { type: DashboardWidgetType; title?: string }) => api.post<DashboardWidget>('/dashboard/widgets', data),
  updateWidget: (widgetId: string, data: {
    title?: string | null;
    isVisible?: boolean;
    isCollapsed?: boolean;
    settings?: Record<string, unknown>;
  }) => api.patch<DashboardWidget>(`/dashboard/widgets/${widgetId}`, data),
  updateLayout: (widgets: Array<{ id: string; x: number; y: number; width: number; height: number; mobileOrder: number }>) =>
    api.patch<DashboardWidget[]>('/dashboard/widgets/layout', { widgets }),
  deleteWidget: (widgetId: string) => api.delete(`/dashboard/widgets/${widgetId}`),
  bookmarks: {
    list: () => api.get<BookmarkState>('/dashboard/bookmarks'),
    create: (data: {
      itemType?: 'BOOKMARK' | 'FOLDER';
      parentId?: string | null;
      title: string;
      url?: string | null;
      description?: string | null;
      notes?: string | null;
      category?: string | null;
      tags?: string[];
      faviconUrl?: string | null;
      isFavorite?: boolean;
      isPinned?: boolean;
      isArchived?: boolean;
      showInToolbar?: boolean;
    }) => api.post<BookmarkItem>('/dashboard/bookmarks', data),
    update: (bookmarkId: string, data: Partial<BookmarkItem>) => api.patch<BookmarkItem>(`/dashboard/bookmarks/${bookmarkId}`, data),
    reorder: (items: Array<{ id: string; parentId: string | null; sortOrder: number; showInToolbar?: boolean }>) =>
      api.patch<BookmarkState>('/dashboard/bookmarks/reorder', { items }),
    importHtml: (html: string, mode: 'append' | 'replace' = 'append') =>
      api.post<{ message: string; bookmarks: BookmarkState }>('/dashboard/bookmarks/import', { html, mode }),
    exportHtml: () =>
      api.get<{ fileName: string; html: string }>('/dashboard/bookmarks/export'),
    delete: (bookmarkId: string) => api.delete(`/dashboard/bookmarks/${bookmarkId}`),
  },
  commute: {
    get: () => api.get<DashboardResponse['commute']>('/dashboard/commute'),
    update: (data: {
      sourceAddress: string;
      destinationAddress: string;
      officeDays: string[];
      homeOfficeDays: string[];
      outboundLabel?: string | null;
      returnLabel?: string | null;
      departureTime?: string | null;
      returnDepartureTime?: string | null;
    }) => api.put<CommuteProfile>('/dashboard/commute', data),
  },
  weather: {
    get: (city: string) => api.get<WeatherResponse>('/dashboard/weather', { params: { city } }),
  },
  telegram: {
    sendMessage: (content: string) =>
      api.post<{ sent: TelegramChatMessage; reply: TelegramChatMessage }>('/dashboard/telegram/messages', { content }),
  },
  timeTracking: {
    get: () => api.get<DashboardResponse['timeTracking']>('/dashboard/time-tracking'),
    createProject: (data: {
      name: string;
      description?: string | null;
      color?: string | null;
      client?: string | null;
      category?: string | null;
    }) => api.post<TimeTrackingProject>('/dashboard/time-tracking/projects', data),
    updateProject: (projectId: string, data: Partial<TimeTrackingProject>) =>
      api.patch<TimeTrackingProject>(`/dashboard/time-tracking/projects/${projectId}`, data),
    deleteProject: (projectId: string) => api.delete(`/dashboard/time-tracking/projects/${projectId}`),
    startTimer: (data: { projectId: string; note?: string | null }) =>
      api.post<TimeEntry>('/dashboard/time-tracking/entries/start', data),
    stopTimer: (entryId: string, endTime?: string) =>
      api.post<TimeEntry>(`/dashboard/time-tracking/entries/${entryId}/stop`, { endTime }),
    createEntry: (data: {
      projectId: string;
      startTime: string;
      endTime: string;
      note?: string | null;
    }) => api.post<TimeEntry>('/dashboard/time-tracking/entries', data),
    updateEntry: (entryId: string, data: Partial<TimeEntry> & { projectId?: string }) =>
      api.patch<TimeEntry>(`/dashboard/time-tracking/entries/${entryId}`, data),
    deleteEntry: (entryId: string) => api.delete(`/dashboard/time-tracking/entries/${entryId}`),
  },
};

export const adminApi = {
  stats: () => api.get<AdminStats>('/admin/stats'),
  users: () => api.get<AdminUser[]>('/admin/users'),
  auditLog: (params: { limit?: number; offset?: number } = {}) => api.get<AdminAuditEntry[]>('/admin/audit-log', { params }),
  updateUser: (userId: string, data: { name?: string; status?: AdminUser['status']; globalRole?: string | null }) =>
    api.patch<AdminUser>(`/admin/users/${userId}`, data),
  deleteUser: (userId: string) => api.delete(`/admin/users/${userId}`),
  revokeSessions: (userId: string) => api.post<{ revoked: number }>(`/admin/users/${userId}/revoke-sessions`),
};
