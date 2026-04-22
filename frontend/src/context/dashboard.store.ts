import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type DashboardWidgetId =
  | 'clock'
  | 'search'
  | 'webSearch'
  | 'weather'
  | 'quickLinks'
  | 'favorites'
  | 'notes'
  | 'stats'
  | 'spaces';

export interface DashboardQuickLink {
  id: string;
  name: string;
  url: string;
  icon: string;
}

export interface DashboardConfig {
  notes: string;
  weatherCity: string;
  searchProvider: WebSearchProvider;
  widgetOrder: DashboardWidgetId[];
  hiddenWidgets: DashboardWidgetId[];
  favoriteSpaceKeys: string[];
  quickLinks: DashboardQuickLink[];
}

export type WebSearchProvider = 'duckduckgo' | 'google' | 'brave' | 'bing';

interface DashboardState {
  configsByUser: Record<string, DashboardConfig>;
  ensureConfig: (userId: string, isAdmin: boolean) => void;
  updateConfig: (userId: string, updater: (current: DashboardConfig) => DashboardConfig) => void;
  resetConfig: (userId: string, isAdmin: boolean) => void;
}

const defaultWidgetOrder: DashboardWidgetId[] = [
  'clock',
  'search',
  'webSearch',
  'weather',
  'quickLinks',
  'favorites',
  'notes',
  'stats',
  'spaces',
];

function getDefaultQuickLinks(isAdmin: boolean): DashboardQuickLink[] {
  const links: DashboardQuickLink[] = [
    { id: 'search', name: 'Wiki durchsuchen', url: '/search', icon: 'SUCHE' },
    { id: 'new-space', name: 'Bereich erstellen', url: '/spaces/new', icon: 'NEU' },
    { id: 'docs', name: 'Wiki-Start', url: '/', icon: 'START' },
  ];

  if (isAdmin) {
    links.push({ id: 'admin', name: 'Admin-Konsole', url: '/admin', icon: 'ADMIN' });
  }

  return links;
}

function createDefaultConfig(isAdmin: boolean): DashboardConfig {
  return {
    notes: '',
    weatherCity: 'Berlin',
    searchProvider: 'duckduckgo',
    widgetOrder: defaultWidgetOrder,
    hiddenWidgets: [],
    favoriteSpaceKeys: [],
    quickLinks: getDefaultQuickLinks(isAdmin),
  };
}

function normalizeConfig(config: DashboardConfig | undefined, isAdmin: boolean): DashboardConfig {
  const fallback = createDefaultConfig(isAdmin);
  const merged: DashboardConfig = {
    ...fallback,
    ...config,
    widgetOrder: config?.widgetOrder ?? fallback.widgetOrder,
    hiddenWidgets: config?.hiddenWidgets ?? fallback.hiddenWidgets,
    favoriteSpaceKeys: config?.favoriteSpaceKeys ?? fallback.favoriteSpaceKeys,
    quickLinks: config?.quickLinks ?? fallback.quickLinks,
  };

  const widgetOrder = [
    ...merged.widgetOrder.filter((widgetId, index, list) => list.indexOf(widgetId) === index),
    ...defaultWidgetOrder.filter((widgetId) => !merged.widgetOrder.includes(widgetId)),
  ];

  return {
    ...merged,
    widgetOrder,
    hiddenWidgets: merged.hiddenWidgets.filter((widgetId) => widgetOrder.includes(widgetId)),
  };
}

export const useDashboardStore = create<DashboardState>()(
  persist(
    (set, get) => ({
      configsByUser: {},
      ensureConfig: (userId, isAdmin) => {
        const existing = get().configsByUser[userId];
        const normalized = normalizeConfig(existing, isAdmin);

        if (existing && JSON.stringify(existing) === JSON.stringify(normalized)) return;

        set((state) => ({
          configsByUser: {
            ...state.configsByUser,
            [userId]: normalized,
          },
        }));
      },
      updateConfig: (userId, updater) => {
        set((state) => {
          const current = normalizeConfig(state.configsByUser[userId], false);
          return {
            configsByUser: {
              ...state.configsByUser,
              [userId]: normalizeConfig(updater(current), false),
            },
          };
        });
      },
      resetConfig: (userId, isAdmin) => {
        set((state) => ({
          configsByUser: {
            ...state.configsByUser,
            [userId]: createDefaultConfig(isAdmin),
          },
        }));
      },
    }),
    {
      name: 'dashboard-config-storage',
    }
  )
);
