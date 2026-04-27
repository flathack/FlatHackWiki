import {
  DashboardWidgetType,
  Prisma,
  TimeEntryType,
  type CommuteProfile,
  type TelegramChatMessage,
  type TimeEntry,
  type TimeTrackingProject,
  type UserDashboardWidget,
} from '@prisma/client';
import { XMLParser } from 'fast-xml-parser';
import ical from 'node-ical';
import { config } from '../../config/index.js';
import { db } from '../../config/database.js';
import { ConflictError, NotFoundError, ValidationError } from '../../core/errors/app.errors.js';
import { amazonExpensesService } from '../amazon-expenses/amazon-expenses.service.js';
import { mailService } from '../mail/mail.service.js';

const TELEGRAM_ROLES = {
  USER: 'USER',
  BOT: 'BOT',
  SYSTEM: 'SYSTEM',
} as const;

const TELEGRAM_PROVIDERS = {
  LOCAL_PREVIEW: 'LOCAL_PREVIEW',
  TELEGRAM_PROXY: 'TELEGRAM_PROXY',
  OPENCLAW_RELAY: 'OPENCLAW_RELAY',
} as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function extractOpenClawReply(payload: unknown): string | null {
  if (typeof payload === 'string') {
    const trimmed = payload.trim();
    return trimmed || null;
  }

  if (Array.isArray(payload)) {
    const parts = payload
      .map((entry) => extractOpenClawReply(entry))
      .filter((entry): entry is string => Boolean(entry));
    return parts.length ? parts.join('\n\n') : null;
  }

  if (!isRecord(payload)) {
    return null;
  }

  if (typeof payload.reply === 'string' && payload.reply.trim()) {
    return payload.reply.trim();
  }

  if (typeof payload.output_text === 'string' && payload.output_text.trim()) {
    return payload.output_text.trim();
  }

  if (isRecord(payload.text) && typeof payload.text.value === 'string' && payload.text.value.trim()) {
    return payload.text.value.trim();
  }

  if (typeof payload.text === 'string' && payload.text.trim()) {
    return payload.text.trim();
  }

  if (Array.isArray(payload.output)) {
    const parts = payload.output
      .map((entry) => extractOpenClawReply(entry))
      .filter((entry): entry is string => Boolean(entry));
    if (parts.length) {
      return parts.join('\n\n');
    }
  }

  if (Array.isArray(payload.content)) {
    const parts = payload.content
      .map((entry) => extractOpenClawReply(entry))
      .filter((entry): entry is string => Boolean(entry));
    if (parts.length) {
      return parts.join('\n\n');
    }
  }

  if (isRecord(payload.message)) {
    return extractOpenClawReply(payload.message);
  }

  if (Array.isArray(payload.choices)) {
    for (const choice of payload.choices) {
      const reply = extractOpenClawReply(choice);
      if (reply) {
        return reply;
      }
    }
  }

  return null;
}

const bookmarkDb: any = (db as any).bookmark;

const BOOKMARK_ITEM_TYPES = {
  BOOKMARK: 'BOOKMARK',
  FOLDER: 'FOLDER',
} as const;

type BookmarkTreeItem = {
  id: string;
  parentId: string | null;
  itemType: 'BOOKMARK' | 'FOLDER';
  title: string;
  url: string | null;
  normalizedUrl: string | null;
  domain: string | null;
  description: string | null;
  notes: string | null;
  category: string | null;
  tags: string[];
  faviconUrl: string | null;
  isFavorite: boolean;
  isPinned: boolean;
  isArchived: boolean;
  showInToolbar: boolean;
  linkStatus: 'UNKNOWN' | 'OK' | 'BROKEN' | 'REDIRECTED';
  httpStatus: number | null;
  lastCheckedAt: Date | null;
  lastOpenedAt: Date | null;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
  children: BookmarkTreeItem[];
};

type CalendarWidgetSettings = {
  mode?: string;
  calendarIds?: string[];
  maxItems?: number;
  showCalendarColors?: boolean;
  highlightWindowMinutes?: number;
};

type CalendarSourceSummary = {
  id: string;
  name: string;
  color: string | null;
  href: string;
};

type CalendarEventSummary = {
  id: string;
  calendarId: string;
  calendarName: string;
  calendarColor: string | null;
  title: string;
  startAt: string;
  endAt: string;
  isAllDay: boolean;
  isRecurring: boolean;
  location: string | null;
  isToday: boolean;
  isNow: boolean;
  startsSoon: boolean;
  nextcloudUrl: string | null;
};

type CalendarDashboardState = {
  status: 'disabled' | 'setup_required' | 'ready' | 'error';
  message: string | null;
  nextcloudUrl: string | null;
  calendars: Array<{ id: string; name: string; color: string | null }>;
  events: CalendarEventSummary[];
  lastSyncedAt: string | null;
};

type CalendarCacheEntry = {
  expiresAt: number;
  data: CalendarDashboardState;
};

const calDavXmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
  removeNSPrefix: true,
  trimValues: true,
});

const calendarCache = new Map<string, CalendarCacheEntry>();
const CALENDAR_CACHE_TTL_MS = 3 * 60 * 1000;

const widgetDefaults: Record<DashboardWidgetType, { title: string; x: number; y: number; width: number; height: number; minWidth: number; minHeight: number; maxWidth?: number; maxHeight?: number; settings?: Prisma.JsonObject }> = {
  CLOCK: {
    title: 'Uhrzeit',
    x: 0,
    y: 0,
    width: 4,
    height: 3,
    minWidth: 3,
    minHeight: 3,
  },
  WIKI_SEARCH: {
    title: 'Wiki-Suche',
    x: 4,
    y: 0,
    width: 4,
    height: 3,
    minWidth: 3,
    minHeight: 3,
  },
  WEB_SEARCH: {
    title: 'Websuche',
    x: 8,
    y: 0,
    width: 4,
    height: 3,
    minWidth: 3,
    minHeight: 3,
    settings: {
      provider: 'duckduckgo',
    },
  },
  WEATHER: {
    title: 'Wetter',
    x: 0,
    y: 3,
    width: 4,
    height: 4,
    minWidth: 3,
    minHeight: 4,
    settings: {
      city: 'Berlin',
    },
  },
  CALENDAR: {
    title: 'Kalender',
    x: 4,
    y: 7,
    width: 4,
    height: 5,
    minWidth: 4,
    minHeight: 4,
    settings: {
      mode: 'agenda',
      calendarIds: [],
      maxItems: 6,
      showCalendarColors: true,
      highlightWindowMinutes: 90,
    },
  },
  FAVORITE_SPACES: {
    title: 'Favorisierte Bereiche',
    x: 8,
    y: 3,
    width: 4,
    height: 4,
    minWidth: 3,
    minHeight: 3,
    settings: {
      spaceKeys: [],
    },
  },
  NOTES: {
    title: 'Notizen',
    x: 8,
    y: 7,
    width: 4,
    height: 4,
    minWidth: 3,
    minHeight: 3,
    settings: {
      content: '',
    },
  },
  STATS: {
    title: 'Übersicht',
    x: 0,
    y: 7,
    width: 3,
    height: 3,
    minWidth: 3,
    minHeight: 3,
    maxWidth: 4,
  },
  SPACES: {
    title: 'Bereiche',
    x: 3,
    y: 7,
    width: 5,
    height: 5,
    minWidth: 4,
    minHeight: 4,
  },
  COMMUTE: {
    title: 'Arbeitsweg',
    x: 8,
    y: 7,
    width: 4,
    height: 5,
    minWidth: 4,
    minHeight: 4,
  },
  TIME_TRACKER: {
    title: 'Zeiterfassung',
    x: 0,
    y: 12,
    width: 6,
    height: 5,
    minWidth: 4,
    minHeight: 4,
  },
  BOOKMARKS: {
    title: 'Browser-Lesezeichen',
    x: 6,
    y: 12,
    width: 6,
    height: 5,
    minWidth: 4,
    minHeight: 4,
    settings: {
      showFavoritesOnly: false,
      search: '',
    },
  },
  TELEGRAM_CHAT: {
    title: 'OpenClaw Chat',
    x: 0,
    y: 17,
    width: 6,
    height: 6,
    minWidth: 4,
    minHeight: 5,
    settings: {
      chatId: '',
      pollIntervalMs: 15000,
      greetingText: 'Verbinde dieses Widget mit deinem OpenClaw-Assistenten.',
      botUsername: 'OpenClaw Assistent',
    },
  },
  AMAZON_EXPENSES: {
    title: 'Amazon Ausgaben',
    x: 6,
    y: 17,
    width: 6,
    height: 4,
    minWidth: 4,
    minHeight: 3,
  },
  MAIL: {
    title: 'E-Mail',
    x: 0,
    y: 21,
    width: 6,
    height: 5,
    minWidth: 4,
    minHeight: 4,
    settings: {
      maxItems: 5,
      privacyMode: false,
    },
  },
};

const defaultWidgetOrder = [
  'WEB_SEARCH',
  'WIKI_SEARCH',
  'WEATHER',
  'CALENDAR',
  'FAVORITE_SPACES',
  'NOTES',
  'STATS',
  'SPACES',
  'COMMUTE',
  'TIME_TRACKER',
  'BOOKMARKS',
  'TELEGRAM_CHAT',
  'AMAZON_EXPENSES',
  'MAIL',
] satisfies DashboardWidgetType[];

const weekdayMap = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'] as const;

function createDefaultWidget(type: DashboardWidgetType, mobileOrder: number) {
  const defaults = widgetDefaults[type];
  return {
    type,
    title: defaults.title,
    x: defaults.x,
    y: defaults.y,
    width: defaults.width,
    height: defaults.height,
    minWidth: defaults.minWidth,
    minHeight: defaults.minHeight,
    maxWidth: defaults.maxWidth,
    maxHeight: defaults.maxHeight,
    mobileOrder,
    isVisible: true,
    isCollapsed: false,
    settings: defaults.settings,
  };
}

function sanitizeWidgetType(widget: UserDashboardWidget) {
  return {
    id: widget.id,
    type: widget.type,
    title: widget.title,
    isVisible: widget.isVisible,
    isCollapsed: widget.isCollapsed,
    x: widget.x,
    y: widget.y,
    width: widget.width,
    height: widget.height,
    minWidth: widget.minWidth,
    minHeight: widget.minHeight,
    maxWidth: widget.maxWidth,
    maxHeight: widget.maxHeight,
    mobileOrder: widget.mobileOrder,
    settings: (widget.settings ?? {}) as Record<string, unknown>,
  };
}

function calculateDurationMinutes(startTime: Date, endTime: Date) {
  return Math.max(1, Math.round((endTime.getTime() - startTime.getTime()) / 60000));
}

function getWeekdayKey(date = new Date()) {
  return weekdayMap[date.getDay()];
}

function normalizeNullableString(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function normalizeBookmarkUrl(value?: string | null) {
  const trimmed = normalizeNullableString(value);
  if (!trimmed) return null;

  try {
    const parsed = new URL(trimmed);
    parsed.hash = '';
    parsed.hostname = parsed.hostname.toLowerCase();
    if ((parsed.protocol === 'https:' && parsed.port === '443') || (parsed.protocol === 'http:' && parsed.port === '80')) {
      parsed.port = '';
    }
    if (parsed.pathname === '/') {
      parsed.pathname = '';
    }
    return parsed.toString().replace(/\/$/, '');
  } catch {
    return trimmed.toLowerCase();
  }
}

function getBookmarkDomain(value?: string | null) {
  const trimmed = normalizeNullableString(value);
  if (!trimmed) return null;

  try {
    return new URL(trimmed).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return null;
  }
}

function normalizeBookmarkTags(tags?: unknown) {
  if (!Array.isArray(tags)) return undefined;

  const unique = new Set<string>();
  for (const tag of tags) {
    if (typeof tag !== 'string') continue;
    const normalized = tag.trim().replace(/\s+/g, ' ');
    if (normalized) unique.add(normalized.slice(0, 50));
  }

  return [...unique].slice(0, 30);
}

function sanitizeTelegramMessage(message: TelegramChatMessage) {
  return {
    id: message.id,
    senderRole: message.senderRole,
    provider: message.provider,
    content: message.content,
    chatId: message.chatId,
    metadata: (message.metadata ?? {}) as Record<string, unknown>,
    createdAt: message.createdAt,
  };
}

function buildBookmarkTree(items: any[]): BookmarkTreeItem[] {
  const nodeMap = new Map<string, BookmarkTreeItem>();

  for (const item of items) {
    nodeMap.set(item.id, {
      id: item.id,
      parentId: item.parentId ?? null,
      itemType: item.itemType as 'BOOKMARK' | 'FOLDER',
      title: item.title,
      url: item.url ?? null,
      normalizedUrl: item.normalizedUrl ?? null,
      domain: item.domain ?? getBookmarkDomain(item.url),
      description: item.description ?? null,
      notes: item.notes ?? null,
      category: item.category ?? null,
      tags: item.tags ?? [],
      faviconUrl: item.faviconUrl ?? null,
      isFavorite: item.isFavorite,
      isPinned: item.isPinned ?? false,
      isArchived: item.isArchived ?? false,
      showInToolbar: item.isArchived ? false : item.showInToolbar,
      linkStatus: item.linkStatus ?? 'UNKNOWN',
      httpStatus: item.httpStatus ?? null,
      lastCheckedAt: item.lastCheckedAt ?? null,
      lastOpenedAt: item.lastOpenedAt ?? null,
      sortOrder: item.sortOrder,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
      children: [],
    });
  }

  const roots: BookmarkTreeItem[] = [];

  for (const item of items) {
    const node = nodeMap.get(item.id)!;
    if (item.parentId) {
      const parent = nodeMap.get(item.parentId);
      if (parent) {
        parent.children.push(node);
        continue;
      }
    }

    roots.push(node);
  }

  const sortNodes = (nodes: BookmarkTreeItem[]) => {
    nodes.sort((a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title, 'de'));
    nodes.forEach((node) => sortNodes(node.children));
  };

  sortNodes(roots);
  return roots;
}

function flattenBookmarkTree(nodes: BookmarkTreeItem[]): BookmarkTreeItem[] {
  return nodes.flatMap((node) => [node, ...flattenBookmarkTree(node.children)]);
}

function sanitizeBookmarkNode(node: BookmarkTreeItem): BookmarkTreeItem {
  return {
    ...node,
    children: node.children.map(sanitizeBookmarkNode),
  };
}

function getBookmarkStats(nodes: BookmarkTreeItem[]) {
  const flattened = flattenBookmarkTree(nodes);
  return {
    totalCount: flattened.length,
    bookmarkCount: flattened.filter((item) => item.itemType === BOOKMARK_ITEM_TYPES.BOOKMARK).length,
    folderCount: flattened.filter((item) => item.itemType === BOOKMARK_ITEM_TYPES.FOLDER).length,
    favoriteCount: flattened.filter((item) => item.isFavorite).length,
    archivedCount: flattened.filter((item) => item.isArchived).length,
    pinnedCount: flattened.filter((item) => item.isPinned).length,
  };
}

function escapeBookmarkHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function deriveFaviconUrl(url?: string | null) {
  if (!url) return null;

  try {
    const parsed = new URL(url);
    return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(parsed.hostname)}&sz=64`;
  } catch {
    return null;
  }
}

async function downloadFaviconDataUrl(url?: string | null) {
  if (!url) return null;

  try {
    const parsed = new URL(url);
    const candidates = [
      `https://www.google.com/s2/favicons?domain=${encodeURIComponent(parsed.hostname)}&sz=64`,
      `${parsed.origin}/favicon.ico`,
    ];

    for (const candidate of candidates) {
      try {
        const response = await fetch(candidate, {
          headers: {
            'User-Agent': 'FlatHacksWiki/1.0 (bookmark favicon fetcher)',
            Accept: 'image/*,*/*;q=0.8',
          },
        });

        if (!response.ok) {
          continue;
        }

        const contentType = response.headers.get('content-type') || 'image/png';
        if (!contentType.startsWith('image/')) {
          continue;
        }

        const bytes = Buffer.from(await response.arrayBuffer());
        if (bytes.length === 0 || bytes.length > 150_000) {
          continue;
        }

        return `data:${contentType};base64,${bytes.toString('base64')}`;
      } catch {
        continue;
      }
    }
  } catch {
    return null;
  }

  return null;
}

async function hydrateBookmarkFavicons(items: any[]) {
  const missingItems = items.filter(
    (item) =>
      item.itemType === BOOKMARK_ITEM_TYPES.BOOKMARK &&
      item.url &&
      !item.faviconUrl
  );

  if (missingItems.length === 0) {
    return items;
  }

  const updates = await Promise.all(
    missingItems.slice(0, 12).map(async (item) => {
      const faviconDataUrl = await downloadFaviconDataUrl(item.url);
      if (!faviconDataUrl) {
        return null;
      }

      await bookmarkDb.update({
        where: { id: item.id },
        data: { faviconUrl: faviconDataUrl },
      });

      return {
        id: item.id,
        faviconUrl: faviconDataUrl,
      };
    })
  );

  const successfulUpdates = updates.filter(
    (item): item is { id: string; faviconUrl: string } => item !== null
  );
  const updateMap = new Map(
    successfulUpdates.map((item) => [item.id, item.faviconUrl])
  );

  return items.map((item) =>
    updateMap.has(item.id)
      ? { ...item, faviconUrl: updateMap.get(item.id) }
      : item
  );
}

function renderBookmarksAsHtml(nodes: BookmarkTreeItem[], indent = 1): string {
  const pad = '    '.repeat(indent);
  const lines: string[] = [];

  for (const node of nodes) {
    if (node.itemType === BOOKMARK_ITEM_TYPES.FOLDER) {
      lines.push(`${pad}<DT><H3>${escapeBookmarkHtml(node.title)}</H3>`);
      lines.push(`${pad}<DL><p>`);
      lines.push(renderBookmarksAsHtml(node.children, indent + 1));
      lines.push(`${pad}</DL><p>`);
      continue;
    }

    lines.push(
      `${pad}<DT><A HREF="${escapeBookmarkHtml(node.url ?? '#')}"${node.faviconUrl ? ` ICON="${escapeBookmarkHtml(node.faviconUrl)}"` : ''}>${escapeBookmarkHtml(node.title)}</A>`
    );
  }

  return lines.filter(Boolean).join('\n');
}

function parseBookmarkImport(html: string) {
  const normalized = html.replace(/\r\n/g, '\n');
  const tokens = normalized
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  const root: Array<Record<string, unknown>> = [];
  const stack: Array<Array<Record<string, unknown>>> = [root];
  let pendingFolder: Record<string, unknown> | null = null;

  for (const token of tokens) {
    const folderMatch = token.match(/<H3[^>]*>(.*?)<\/H3>/i);
    if (folderMatch) {
      pendingFolder = { itemType: BOOKMARK_ITEM_TYPES.FOLDER, title: folderMatch[1].replace(/<[^>]+>/g, '').trim(), children: [] };
      continue;
    }

    if (/^<DL/i.test(token)) {
      if (pendingFolder) {
        const folderChildren = pendingFolder.children as Array<Record<string, unknown>>;
        stack[stack.length - 1].push(pendingFolder);
        stack.push(folderChildren);
        pendingFolder = null;
      }
      continue;
    }

    if (/^<\/DL/i.test(token)) {
      if (stack.length > 1) {
        stack.pop();
      }
      continue;
    }

    const linkMatch = token.match(/<A[^>]*HREF="([^"]+)"[^>]*>(.*?)<\/A>/i);
    if (linkMatch) {
      const iconMatch = token.match(/ICON="([^"]+)"/i);
      stack[stack.length - 1].push({
        itemType: BOOKMARK_ITEM_TYPES.BOOKMARK,
        title: linkMatch[2].replace(/<[^>]+>/g, '').trim(),
        url: linkMatch[1].trim(),
        faviconUrl: iconMatch?.[1]?.trim() || null,
      });
    }
  }

  return root;
}

function getStartOfDay(date = new Date()) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function getStartOfWeek(date = new Date()) {
  const next = getStartOfDay(date);
  const day = next.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  next.setDate(next.getDate() + diff);
  return next;
}

function getWeatherDescription(code?: number) {
  const descriptions: Record<number, string> = {
    0: 'Klar',
    1: 'Überwiegend klar',
    2: 'Teilweise bewölkt',
    3: 'Bedeckt',
    45: 'Neblig',
    48: 'Reifnebel',
    51: 'Leichter Nieselregen',
    53: 'Mäßiger Nieselregen',
    55: 'Dichter Nieselregen',
    56: 'Leichter gefrierender Nieselregen',
    57: 'Dichter gefrierender Nieselregen',
    61: 'Leichter Regen',
    63: 'Mäßiger Regen',
    65: 'Starker Regen',
    66: 'Leichter gefrierender Regen',
    67: 'Starker gefrierender Regen',
    71: 'Leichter Schneefall',
    73: 'Mäßiger Schneefall',
    75: 'Starker Schneefall',
    77: 'Schneekörner',
    80: 'Leichte Regenschauer',
    81: 'Mäßige Regenschauer',
    82: 'Starke Regenschauer',
    85: 'Leichte Schneeschauer',
    86: 'Starke Schneeschauer',
    95: 'Gewitter',
    96: 'Gewitter mit leichtem Hagel',
    99: 'Gewitter mit starkem Hagel',
  };

  return descriptions[code ?? -1] || 'Unbekannt';
}

function formatWeatherValue(value?: number, fractionDigits = 0) {
  if (typeof value !== 'number' || Number.isNaN(value)) return '-';
  return value.toLocaleString('de-DE', {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });
}

function getSunscreenAdvice(uvIndex?: number, sunshineSeconds?: number) {
  const uv = typeof uvIndex === 'number' && !Number.isNaN(uvIndex) ? uvIndex : 0;
  const sunshineHours = typeof sunshineSeconds === 'number' && !Number.isNaN(sunshineSeconds) ? sunshineSeconds / 3600 : 0;

  if (uv >= 8) {
    return {
      level: 'high',
      label: 'Eincremen unbedingt notwendig',
      detail: 'Sehr hohe UV-Belastung. SPF 50, Kopfbedeckung und Schatten einplanen.',
    };
  }

  if (uv >= 6) {
    return {
      level: 'high',
      label: 'Eincremen notwendig',
      detail: 'Hohe UV-Belastung. SPF 30-50 verwenden und Mittagssonne meiden.',
    };
  }

  if (uv >= 3) {
    return {
      level: 'medium',
      label: 'Eincremen empfohlen',
      detail: 'Mittlere UV-Belastung. Bei längerer Zeit draußen Sonnenschutz nutzen.',
    };
  }

  if (sunshineHours >= 5) {
    return {
      level: 'low',
      label: 'Leichter Schutz sinnvoll',
      detail: 'UV ist niedrig, aber es gibt viel Sonne. Bei empfindlicher Haut eincremen.',
    };
  }

  return {
    level: 'none',
    label: 'Eincremen heute kaum nötig',
    detail: 'Niedrige UV-Belastung. Normaler Schutz reicht meist aus.',
  };
}

function arrayify<T>(value: T | T[] | undefined | null): T[] {
  if (Array.isArray(value)) return value;
  return value == null ? [] : [value];
}

function getNextcloudCalendarUrl() {
  const url = config.NEXTCLOUD_PUBLIC_URL?.trim() || config.NEXTCLOUD_URL?.trim();
  return url ? `${url.replace(/\/$/, '')}/apps/calendar` : null;
}

function getNextcloudInternalBaseUrl() {
  return config.NEXTCLOUD_INTERNAL_URL?.trim() || config.NEXTCLOUD_URL?.trim() || null;
}

function getConfiguredNextcloudCredentialUser() {
  return config.NEXTCLOUD_APP_PASSWORD_USER?.trim() || config.NEXTCLOUD_USERNAME?.trim() || null;
}

type NextcloudCredentials = {
  username: string;
  password: string;
  source: 'user-profile' | 'global-env';
};

function getEmailUsernameFallback(email?: string | null) {
  const fallback = email?.split('@')[0]?.trim();
  return fallback ? fallback.toLowerCase() : null;
}

function buildCalendarSetupState(message: string): CalendarDashboardState {
  return {
    status: 'setup_required',
    message,
    nextcloudUrl: getNextcloudCalendarUrl(),
    calendars: [],
    events: [],
    lastSyncedAt: null,
  };
}

function buildCalendarDisabledState(): CalendarDashboardState {
  return {
    status: 'disabled',
    message: null,
    nextcloudUrl: getNextcloudCalendarUrl(),
    calendars: [],
    events: [],
    lastSyncedAt: null,
  };
}

function normalizeCalendarSettings(settings: Record<string, unknown> | null | undefined): CalendarWidgetSettings {
  return {
    mode: typeof settings?.mode === 'string' ? settings.mode : 'agenda',
    calendarIds: Array.isArray(settings?.calendarIds)
      ? settings.calendarIds.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      : [],
    maxItems:
      typeof settings?.maxItems === 'number' && Number.isFinite(settings.maxItems)
        ? Math.max(1, Math.min(12, Math.round(settings.maxItems)))
        : 6,
    showCalendarColors: settings?.showCalendarColors !== false,
    highlightWindowMinutes:
      typeof settings?.highlightWindowMinutes === 'number' && Number.isFinite(settings.highlightWindowMinutes)
        ? Math.max(5, Math.min(360, Math.round(settings.highlightWindowMinutes)))
        : 90,
  };
}

function getCalendarCacheKey(settings: CalendarWidgetSettings, username: string) {
  return JSON.stringify({
    url: getNextcloudInternalBaseUrl() ?? '',
    username,
    calendarIds: [...(settings.calendarIds ?? [])].sort(),
    highlightWindowMinutes: settings.highlightWindowMinutes ?? 90,
    lookaheadDays: config.NEXTCLOUD_CALENDAR_LOOKAHEAD_DAYS,
  });
}

function formatCalDavDate(date: Date) {
  return date
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}Z$/, 'Z');
}

function overlapsRange(startAt: Date, endAt: Date, rangeStart: Date, rangeEnd: Date) {
  return startAt < rangeEnd && endAt > rangeStart;
}

function getCalendarDayKey(value: Date | string) {
  const date = typeof value === 'string' ? new Date(value) : value;
  return [date.getFullYear(), `${date.getMonth() + 1}`.padStart(2, '0'), `${date.getDate()}`.padStart(2, '0')].join('-');
}

function sanitizeCalendarColor(value: unknown) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  const match = trimmed.match(/#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{8})/);
  return match ? match[0].slice(0, 7) : null;
}

async function requestCalDav(path: string, credentials: NextcloudCredentials, init?: RequestInit & { headers?: Record<string, string> }) {
  const baseUrl = getNextcloudInternalBaseUrl();

  if (!baseUrl || !credentials.username || !credentials.password) {
    throw new Error('Nextcloud-Zugangsdaten fehlen.');
  }

  const target = new URL(path, baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`).toString();
  const token = Buffer.from(`${credentials.username}:${credentials.password}`).toString('base64');
  const response = await fetch(target, {
    ...init,
    headers: {
      Authorization: `Basic ${token}`,
      Accept: 'application/xml, text/xml;q=0.9, */*;q=0.8',
      ...init?.headers,
    },
  });

  if (!response.ok) {
    throw new Error(`Nextcloud antwortet mit ${response.status}.`);
  }

  return response.text();
}

function parseCalDavCalendars(xml: string): CalendarSourceSummary[] {
  const parsed = calDavXmlParser.parse(xml) as any;
  const responses = arrayify(parsed?.multistatus?.response);

  return responses
    .map((response) => {
      const propstats = arrayify(response?.propstat);
      const okProp = propstats.find((entry) => String(entry?.status ?? '').includes('200'))?.prop;
      if (!okProp) return null;

      const resourceType = okProp.resourcetype ?? {};
      if (!('calendar' in resourceType)) return null;

      const href = decodeURIComponent(String(response.href ?? ''));
      const id = href.split('/').filter(Boolean).at(-1) ?? href;
      return {
        id,
        name: String(okProp.displayname ?? id),
        color: sanitizeCalendarColor(okProp['calendar-color']),
        href,
      } satisfies CalendarSourceSummary;
    })
    .filter((calendar): calendar is CalendarSourceSummary => calendar !== null);
}

function parseCalendarDataBlocks(xml: string) {
  const parsed = calDavXmlParser.parse(xml) as any;
  const responses = arrayify(parsed?.multistatus?.response);

  return responses
    .map((response) => {
      const propstats = arrayify(response?.propstat);
      const okProp = propstats.find((entry) => String(entry?.status ?? '').includes('200'))?.prop;
      const ics = okProp?.['calendar-data'];
      return typeof ics === 'string' && ics.trim() ? ics : null;
    })
    .filter((value): value is string => Boolean(value));
}

function expandRecurringEvent(event: any, rangeStart: Date, rangeEnd: Date) {
  const durationMs = Math.max(60_000, new Date(event.end ?? event.start).getTime() - new Date(event.start).getTime());
  const exdates = new Set(
    Object.values(event.exdate ?? {}).map((value: any) => new Date(value?.start ?? value).getTime())
  );

  return event.rrule
    .between(rangeStart, rangeEnd, true)
    .filter((occurrence: Date) => !exdates.has(occurrence.getTime()))
    .map((occurrence: Date) => ({
      start: occurrence,
      end: new Date(occurrence.getTime() + durationMs),
    }));
}

function extractEventsFromCalendarData(
  calendar: CalendarSourceSummary,
  icsData: string,
  rangeStart: Date,
  rangeEnd: Date,
  highlightWindowMinutes: number,
  nextcloudUrl: string | null
) {
  const now = new Date();
  const dayKey = getCalendarDayKey(now);
  const items = ical.parseICS(icsData) as Record<string, any>;
  const eventList: CalendarEventSummary[] = [];

  for (const item of Object.values(items)) {
    if (!item || item.type !== 'VEVENT' || !item.start) continue;

    const baseStart = new Date(item.start);
    const baseEnd = new Date(item.end ?? item.start);
    const occurrences = item.rrule
      ? expandRecurringEvent(item, rangeStart, rangeEnd)
      : [{ start: baseStart, end: baseEnd }];

    for (const occurrence of occurrences) {
      if (!overlapsRange(occurrence.start, occurrence.end, rangeStart, rangeEnd)) {
        continue;
      }

      const startsSoon =
        occurrence.start.getTime() > now.getTime() &&
        occurrence.start.getTime() - now.getTime() <= highlightWindowMinutes * 60_000;
      const isNow = occurrence.start.getTime() <= now.getTime() && occurrence.end.getTime() >= now.getTime();

      eventList.push({
        id: `${calendar.id}:${item.uid ?? item.summary ?? occurrence.start.toISOString()}:${occurrence.start.toISOString()}`,
        calendarId: calendar.id,
        calendarName: calendar.name,
        calendarColor: calendar.color,
        title: String(item.summary ?? 'Ohne Titel'),
        startAt: occurrence.start.toISOString(),
        endAt: occurrence.end.toISOString(),
        isAllDay: Boolean(item.datetype === 'date' || item.start?.dateOnly || item.end?.dateOnly),
        isRecurring: Boolean(item.rrule),
        location: typeof item.location === 'string' ? item.location : null,
        isToday: getCalendarDayKey(occurrence.start) === dayKey,
        isNow,
        startsSoon,
        nextcloudUrl,
      });
    }
  }

  return eventList;
}

async function resolveNextcloudUsername(userId: string) {
  const configuredUsername = config.NEXTCLOUD_USERNAME?.trim();
  if (configuredUsername) {
    return configuredUsername;
  }

  const profile = await db.userProfile.findUnique({
    where: { userId },
    select: { nextcloudUsername: true },
  });

  const profileUsername = profile?.nextcloudUsername?.trim();
  if (profileUsername) {
    return profileUsername;
  }

  const identity = await db.externalIdentity.findFirst({
    where: {
      userId,
      provider: 'oidc',
    },
    select: {
      username: true,
      email: true,
    },
    orderBy: { createdAt: 'asc' },
  });

  const resolvedUsername = identity?.username?.trim() || getEmailUsernameFallback(identity?.email);
  return resolvedUsername || null;
}

async function resolveNextcloudCredentials(userId: string): Promise<NextcloudCredentials | null> {
  const username = await resolveNextcloudUsername(userId);
  if (!username) {
    return null;
  }

  const profile = await db.userProfile.findUnique({
    where: { userId },
    select: {
      nextcloudAppPassword: true,
    },
  });

  const profilePassword = profile?.nextcloudAppPassword?.trim();
  if (profilePassword) {
    return {
      username,
      password: profilePassword,
      source: 'user-profile',
    };
  }

  const globalPassword = config.NEXTCLOUD_APP_PASSWORD?.trim();
  if (!globalPassword) {
    return null;
  }

  return {
    username,
    password: globalPassword,
    source: 'global-env',
  };
}

async function fetchNextcloudCalendarStateForUser(userId: string, settings: CalendarWidgetSettings): Promise<CalendarDashboardState> {
  const nextcloudUrl = getNextcloudCalendarUrl();
  if (!getNextcloudInternalBaseUrl()) {
    return buildCalendarSetupState('NEXTCLOUD_INTERNAL_URL bzw. NEXTCLOUD_URL ist im Backend noch nicht konfiguriert.');
  }

  const credentials = await resolveNextcloudCredentials(userId);
  if (!credentials?.username) {
    return buildCalendarSetupState('Der gemeinsame OIDC-Login liefert aktuell noch keinen nutzbaren Nextcloud-Benutzernamen.');
  }

  if (!credentials.password) {
    return buildCalendarSetupState('Fuer diesen Benutzer ist noch kein Nextcloud-App-Passwort hinterlegt.');
  }

  const credentialUser = getConfiguredNextcloudCredentialUser();
  if (credentials.source === 'global-env' && credentialUser && credentialUser !== credentials.username) {
    return buildCalendarSetupState(
      `Das aktuell konfigurierte Nextcloud-App-Passwort gehoert zu ${credentialUser}. Fuer ${credentials.username} ist ein eigenes App-Passwort noetig.`
    );
  }

  const cacheKey = getCalendarCacheKey(settings, credentials.username);
  const cached = calendarCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  try {
    const calendarsXml = await requestCalDav(`/remote.php/dav/calendars/${encodeURIComponent(credentials.username)}/`, credentials, {
      method: 'PROPFIND',
      headers: {
        Depth: '1',
        'Content-Type': 'application/xml; charset=utf-8',
      },
      body: `<?xml version="1.0" encoding="UTF-8"?>
        <d:propfind xmlns:d="DAV:" xmlns:cs="http://calendarserver.org/ns/" xmlns:oc="http://owncloud.org/ns/">
          <d:prop>
            <d:displayname />
            <oc:calendar-color />
            <d:resourcetype />
          </d:prop>
        </d:propfind>`,
    });

    const calendars = parseCalDavCalendars(calendarsXml);
    const selectedCalendars = settings.calendarIds?.length
      ? calendars.filter((calendar) => settings.calendarIds?.includes(calendar.id))
      : calendars;

    const rangeStart = new Date();
    rangeStart.setHours(0, 0, 0, 0);
    const rangeEnd = new Date(rangeStart);
    rangeEnd.setDate(rangeEnd.getDate() + config.NEXTCLOUD_CALENDAR_LOOKAHEAD_DAYS);

    const eventResponses = await Promise.all(
      selectedCalendars.map(async (calendar) => {
        const eventsXml = await requestCalDav(calendar.href, credentials, {
          method: 'REPORT',
          headers: {
            Depth: '1',
            'Content-Type': 'application/xml; charset=utf-8',
          },
          body: `<?xml version="1.0" encoding="UTF-8"?>
            <c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
              <d:prop>
                <d:getetag />
                <c:calendar-data />
              </d:prop>
              <c:filter>
                <c:comp-filter name="VCALENDAR">
                  <c:comp-filter name="VEVENT">
                    <c:time-range start="${formatCalDavDate(rangeStart)}" end="${formatCalDavDate(rangeEnd)}" />
                  </c:comp-filter>
                </c:comp-filter>
              </c:filter>
            </c:calendar-query>`,
        });

        const dataBlocks = parseCalendarDataBlocks(eventsXml);
        return dataBlocks.flatMap((icsData) =>
          extractEventsFromCalendarData(
            calendar,
            icsData,
            rangeStart,
            rangeEnd,
            settings.highlightWindowMinutes ?? 90,
            nextcloudUrl
          )
        );
      })
    );

    const dedupe = new Map<string, CalendarEventSummary>();
    for (const event of eventResponses.flat()) {
      dedupe.set(event.id, event);
    }

    const data: CalendarDashboardState = {
      status: 'ready',
      message: null,
      nextcloudUrl,
      calendars: selectedCalendars.map(({ href, ...calendar }) => calendar),
      events: [...dedupe.values()].sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime()),
      lastSyncedAt: new Date().toISOString(),
    };

    calendarCache.set(cacheKey, {
      expiresAt: Date.now() + CALENDAR_CACHE_TTL_MS,
      data,
    });

    return data;
  } catch (error: any) {
    return {
      status: 'error',
      message: error?.message || 'Nextcloud-Kalender konnte nicht geladen werden.',
      nextcloudUrl,
      calendars: [],
      events: [],
      lastSyncedAt: null,
    };
  }
}

async function geocodeAddress(query: string) {
  const response = await fetch(
    `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(query)}`,
    {
      headers: {
        'User-Agent': 'FlatHacksWiki/1.0 (dashboard commute widget)',
        Accept: 'application/json',
      },
    }
  );

  if (!response.ok) {
    throw new Error('Geokodierung nicht verfügbar');
  }

  const results = (await response.json()) as Array<{ lat: string; lon: string; display_name: string }>;
  const match = results[0];
  if (!match) {
    throw new Error(`Adresse nicht gefunden: ${query}`);
  }

  return {
    latitude: Number(match.lat),
    longitude: Number(match.lon),
    label: match.display_name,
  };
}

async function fetchRouteSummary(profile: CommuteProfile) {
  try {
    const [source, destination] = await Promise.all([
      geocodeAddress(profile.sourceAddress),
      geocodeAddress(profile.destinationAddress),
    ]);

    const routeUrl = `https://router.project-osrm.org/route/v1/driving/${source.longitude},${source.latitude};${destination.longitude},${destination.latitude}?overview=full&geometries=geojson&steps=false&alternatives=false`;
    const response = await fetch(routeUrl, {
      headers: {
        'User-Agent': 'FlatHacksWiki/1.0 (dashboard commute widget)',
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error('Routing-Dienst nicht verfügbar');
    }

    const payload = (await response.json()) as {
      code?: string;
      routes?: Array<{
        distance: number;
        duration: number;
        geometry?: {
          type?: string;
          coordinates?: Array<[number, number]>;
        };
      }>;
    };

    const route = payload.routes?.[0];
    if (!route || payload.code !== 'Ok') {
      throw new Error('Keine Route gefunden');
    }

    const minutes = Math.round(route.duration / 60);
    const kilometers = Math.round((route.distance / 1000) * 10) / 10;

    return {
      status: 'ok',
      source,
      destination,
      distanceKm: kilometers,
      durationMinutes: minutes,
      summary: `${kilometers} km in ca. ${minutes} Minuten`,
      geometry: Array.isArray(route.geometry?.coordinates)
        ? route.geometry.coordinates
            .filter((coordinate) => Array.isArray(coordinate) && coordinate.length >= 2)
            .map(([longitude, latitude]) => ({ latitude, longitude }))
        : [],
      trafficNote:
        'Live-Verkehrsdaten sind für diese freie Routing-Quelle nicht verfügbar. Die Schätzung basiert auf dem aktuellen Routing ohne separate Stau-API.',
    };
  } catch (error: any) {
    return {
      status: 'fallback',
      message: error.message || 'Route konnte nicht geladen werden',
      trafficNote: 'Es werden aktuell keine Verkehrsdaten angezeigt.',
    };
  }
}

class DashboardService {
  async getWeather(city: string) {
    const trimmedCity = city.trim();
    if (!trimmedCity) {
      throw new ValidationError('Ein Ort für das Wetter wird benötigt');
    }

    const geocodingResponse = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(trimmedCity)}&count=1&language=de&format=json`,
      {
        headers: {
          'User-Agent': 'FlatHacksWiki/1.0 (dashboard weather widget)',
          Accept: 'application/json',
        },
      }
    );

    if (!geocodingResponse.ok) {
      throw new ValidationError('Wetterdienst derzeit nicht erreichbar');
    }

    const geocodingData = (await geocodingResponse.json()) as {
      results?: Array<{
        latitude: number;
        longitude: number;
        name: string;
        country?: string;
      }>;
    };

    const location = geocodingData.results?.[0];
    if (!location) {
      throw new ValidationError('Ort für Wetterdaten nicht gefunden');
    }

    const weatherParams = new URLSearchParams({
      latitude: String(location.latitude),
      longitude: String(location.longitude),
      current: 'temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m',
      hourly: 'temperature_2m,precipitation_probability,precipitation,weather_code,uv_index',
      daily: 'precipitation_sum,sunshine_duration,daylight_duration,uv_index_max,sunrise,sunset',
      wind_speed_unit: 'kmh',
      forecast_days: '1',
      timezone: 'auto',
    });

    const weatherResponse = await fetch(
      `https://api.open-meteo.com/v1/forecast?${weatherParams.toString()}`,
      {
        headers: {
          'User-Agent': 'FlatHacksWiki/1.0 (dashboard weather widget)',
          Accept: 'application/json',
        },
      }
    );

    if (!weatherResponse.ok) {
      throw new ValidationError('Wetterdienst derzeit nicht erreichbar');
    }

    const data = (await weatherResponse.json()) as {
      current?: {
        temperature_2m?: number;
        relative_humidity_2m?: number;
        weather_code?: number;
        wind_speed_10m?: number;
      };
      hourly?: {
        time?: string[];
        temperature_2m?: number[];
        precipitation_probability?: number[];
        precipitation?: number[];
        weather_code?: number[];
        uv_index?: number[];
      };
      daily?: {
        time?: string[];
        precipitation_sum?: number[];
        sunshine_duration?: number[];
        daylight_duration?: number[];
        uv_index_max?: number[];
        sunrise?: string[];
        sunset?: string[];
      };
    };

    const current = data.current;
    if (!current) {
      throw new ValidationError('Keine Wetterdaten verfügbar');
    }

    const todayKey = data.daily?.time?.[0] || new Date().toISOString().slice(0, 10);
    const now = Date.now();
    const hourlyTimes = data.hourly?.time ?? [];
    const hourlyForecast = hourlyTimes
      .map((time, index) => {
        const forecastDate = new Date(time);
        return {
          time,
          timestamp: forecastDate.getTime(),
          hour: forecastDate.getHours(),
          temperatureC: formatWeatherValue(data.hourly?.temperature_2m?.[index]),
          rainChance: formatWeatherValue(data.hourly?.precipitation_probability?.[index]),
          rainMm: formatWeatherValue(data.hourly?.precipitation?.[index], 1),
          uvIndex: formatWeatherValue(data.hourly?.uv_index?.[index], 1),
          description: getWeatherDescription(data.hourly?.weather_code?.[index]),
        };
      })
      .filter((entry) => entry.time.startsWith(todayKey) && entry.timestamp >= now - 60 * 60 * 1000)
      .filter((entry, index) => index === 0 || entry.hour % 3 === 0)
      .slice(0, 8)
      .map((entry) => ({
        time: new Date(entry.time).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }),
        temperatureC: entry.temperatureC,
        rainChance: entry.rainChance,
        rainMm: entry.rainMm,
        uvIndex: entry.uvIndex,
        description: entry.description,
      }));
    const precipitationSum = data.daily?.precipitation_sum?.[0];
    const sunshineDuration = data.daily?.sunshine_duration?.[0];
    const daylightDuration = data.daily?.daylight_duration?.[0];
    const uvIndexMax = data.daily?.uv_index_max?.[0];
    const sunscreenAdvice = getSunscreenAdvice(uvIndexMax, sunshineDuration);

    return {
      location: location.country ? `${location.name}, ${location.country}` : location.name,
      temperatureC: formatWeatherValue(current.temperature_2m),
      description: getWeatherDescription(current.weather_code),
      humidity: formatWeatherValue(current.relative_humidity_2m),
      windKph: formatWeatherValue(current.wind_speed_10m),
      rainMm: formatWeatherValue(precipitationSum, 1),
      sunshineHours: formatWeatherValue(typeof sunshineDuration === 'number' ? sunshineDuration / 3600 : undefined, 1),
      daylightHours: formatWeatherValue(typeof daylightDuration === 'number' ? daylightDuration / 3600 : undefined, 1),
      uvIndexMax: formatWeatherValue(uvIndexMax, 1),
      sunrise: data.daily?.sunrise?.[0]
        ? new Date(data.daily.sunrise[0]).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
        : '-',
      sunset: data.daily?.sunset?.[0]
        ? new Date(data.daily.sunset[0]).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
        : '-',
      sunscreenAdvice,
      hourlyForecast,
    };
  }

  private async ensureDashboard(userId: string) {
    const existing = await db.userDashboard.findUnique({
      where: { userId },
      include: { widgets: true },
    });

    if (existing) {
      const sortedWidgets = [...existing.widgets].sort((a, b) => a.mobileOrder - b.mobileOrder);
      const knownTypes = new Set<DashboardWidgetType>();
      const duplicateIds: string[] = [];

      for (const widget of sortedWidgets) {
        if (knownTypes.has(widget.type)) {
          duplicateIds.push(widget.id);
          continue;
        }

        knownTypes.add(widget.type);
      }

      if (duplicateIds.length > 0) {
        const operations: Prisma.PrismaPromise<unknown>[] = [];

        if (duplicateIds.length > 0) {
          operations.push(
            db.userDashboardWidget.deleteMany({
              where: {
                id: { in: duplicateIds },
              },
            })
          );
        }

        await db.$transaction(operations);

        return db.userDashboard.findUniqueOrThrow({
          where: { userId },
          include: { widgets: true },
        });
      }

      return existing;
    }

    return db.userDashboard.create({
      data: {
        userId,
        widgets: {
          create: defaultWidgetOrder.map((type, index) => createDefaultWidget(type, index)),
        },
      },
      include: { widgets: true },
    });
  }

  async getDashboard(userId: string) {
    const dashboard = await this.ensureDashboard(userId);
    const calendarWidget = dashboard.widgets.find((widget) => widget.type === 'CALENDAR');
    const calendarSettings = normalizeCalendarSettings((calendarWidget?.settings ?? {}) as Record<string, unknown>);
    const [bookmarksRaw, commuteProfile, spaces, projects, recentEntries, runningEntry, telegramMessages, calendar, amazonExpenses, mail] = await Promise.all([
      bookmarkDb.findMany({ where: { userId }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] }),
      db.commuteProfile.findUnique({ where: { userId } }),
      db.space.findMany({ orderBy: { updatedAt: 'desc' }, include: { owner: { select: { id: true, name: true } } } }),
      db.timeTrackingProject.findMany({ where: { userId }, orderBy: [{ isArchived: 'asc' }, { name: 'asc' }] }),
      db.timeEntry.findMany({
        where: { userId },
        include: { project: true },
        orderBy: { startTime: 'desc' },
        take: 12,
      }),
      db.timeEntry.findFirst({
        where: { userId, endTime: null },
        include: { project: true },
        orderBy: { startTime: 'desc' },
      }),
      db.telegramChatMessage.findMany({
        where: { userId },
        orderBy: { createdAt: 'asc' },
        take: 40,
      }),
      calendarWidget ? fetchNextcloudCalendarStateForUser(userId, calendarSettings) : Promise.resolve(buildCalendarDisabledState()),
      amazonExpensesService.getSummary(userId),
      mailService.getWidgetState(userId),
    ]);

    const todayStart = getStartOfDay(new Date());
    const weekStart = getStartOfWeek(new Date());

    const [todayEntries, weekEntries] = await Promise.all([
      db.timeEntry.findMany({ where: { userId, startTime: { gte: todayStart } } }),
      db.timeEntry.findMany({ where: { userId, startTime: { gte: weekStart } } }),
    ]);

    const bookmarks = await hydrateBookmarkFavicons(bookmarksRaw);
    const favoriteWidget = dashboard.widgets.find((widget) => widget.type === 'FAVORITE_SPACES');
    const favoriteKeys = Array.isArray((favoriteWidget?.settings as Record<string, unknown> | null)?.spaceKeys)
      ? ((favoriteWidget?.settings as Record<string, unknown>).spaceKeys as string[])
      : [];
    const bookmarkTree = buildBookmarkTree(bookmarks);
    const bookmarkStats = getBookmarkStats(bookmarkTree);

    const todayMode = commuteProfile
      ? commuteProfile.officeDays.includes(getWeekdayKey())
        ? 'office'
        : commuteProfile.homeOfficeDays.includes(getWeekdayKey())
          ? 'homeOffice'
          : 'unspecified'
      : 'unset';
    const telegramWidget = dashboard.widgets.find((widget) => widget.type === 'TELEGRAM_CHAT');
    const telegramSettings = (telegramWidget?.settings ?? {}) as Record<string, unknown>;

    return {
      widgets: dashboard.widgets.sort((a, b) => a.mobileOrder - b.mobileOrder).map(sanitizeWidgetType),
      bookmarks: {
        tree: bookmarkTree.map(sanitizeBookmarkNode),
        toolbar: bookmarkTree.filter((item) => item.showInToolbar).map(sanitizeBookmarkNode),
        ...bookmarkStats,
      },
      calendar,
      commute: {
        profile: commuteProfile,
        todayMode,
        route: commuteProfile && todayMode === 'office' ? await fetchRouteSummary(commuteProfile) : null,
      },
      timeTracking: {
        projects,
        runningEntry,
        entries: recentEntries,
        summary: {
          todayMinutes: todayEntries.reduce((sum, entry) => sum + (entry.durationMinutes ?? 0), 0),
          weekMinutes: weekEntries.reduce((sum, entry) => sum + (entry.durationMinutes ?? 0), 0),
        },
      },
      spaces: {
        total: spaces.length,
        publicCount: spaces.filter((space) => space.visibility === 'PUBLIC').length,
        items: spaces,
        favorites: spaces.filter((space) => favoriteKeys.includes(space.key)),
      },
      telegramChat: {
        messages: telegramMessages.map(sanitizeTelegramMessage),
        configured: Boolean(process.env.OPENCLAW_BOT_WEBHOOK_URL || process.env.TELEGRAM_BOT_TOKEN),
        provider:
          process.env.OPENCLAW_BOT_WEBHOOK_URL
            ? 'openclaw-relay'
            : process.env.TELEGRAM_BOT_TOKEN
              ? 'telegram-proxy'
              : 'local-preview',
        settings: {
          chatId: typeof telegramSettings.chatId === 'string' ? telegramSettings.chatId : '',
          pollIntervalMs:
            typeof telegramSettings.pollIntervalMs === 'number' ? telegramSettings.pollIntervalMs : 15000,
          greetingText:
            typeof telegramSettings.greetingText === 'string'
              ? telegramSettings.greetingText
              : 'Verbinde dieses Widget mit deinem OpenClaw-Assistenten.',
          botUsername:
            typeof telegramSettings.botUsername === 'string' ? telegramSettings.botUsername : 'OpenClaw Assistent',
        },
      },
      amazonExpenses,
      mail,
    };
  }

  async sendTelegramMessage(userId: string, content: string) {
    const trimmedContent = content.trim();
    if (!trimmedContent) {
      throw new ValidationError('Bitte gib eine Nachricht ein');
    }

    const telegramWidget = await this.getTelegramWidgetForUser(userId);
    const settings = (telegramWidget.settings ?? {}) as Record<string, unknown>;
    const configuredChatId = typeof settings.chatId === 'string' ? settings.chatId.trim() : '';

    const userMessage = await db.telegramChatMessage.create({
      data: {
        userId,
        senderRole: TELEGRAM_ROLES.USER,
        provider: TELEGRAM_PROVIDERS.LOCAL_PREVIEW,
        content: trimmedContent,
        chatId: configuredChatId || null,
      },
    });

    const relayUrl = process.env.OPENCLAW_BOT_WEBHOOK_URL?.trim();
    const relayToken =
      process.env.OPENCLAW_BOT_WEBHOOK_BEARER_TOKEN?.trim() ||
      process.env.OPENCLAW_BOT_WEBHOOK_AUTH_TOKEN?.trim() ||
      process.env.OPENCLAW_BOT_WEBHOOK_TOKEN?.trim();
    if (relayUrl) {
      try {
        const usesResponsesApi = /\/v1\/responses\/?$/i.test(relayUrl);
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        };

        if (relayToken) {
          headers.Authorization = `Bearer ${relayToken}`;
        }

        const response = await fetch(relayUrl, {
          method: 'POST',
          headers,
          body: JSON.stringify(
            usesResponsesApi
              ? {
                  model: 'openclaw',
                  input: trimmedContent,
                  metadata: {
                    userId,
                    ...(configuredChatId ? { chatId: configuredChatId } : {}),
                  },
                }
              : {
                  userId,
                  chatId: configuredChatId || null,
                  message: trimmedContent,
                },
          ),
        });

        if (!response.ok) {
          const errorBody = await response.text();
          throw new Error(errorBody.trim() || 'OpenClaw-Relay nicht erreichbar');
        }

        const payload = (await response.json()) as unknown;
        const reply = extractOpenClawReply(payload) || 'OpenClaw hat geantwortet, aber keinen Text geliefert.';
        const botMessage = await db.telegramChatMessage.create({
          data: {
            userId,
            senderRole: TELEGRAM_ROLES.BOT,
            provider: TELEGRAM_PROVIDERS.OPENCLAW_RELAY,
            content: reply,
            chatId: configuredChatId || null,
          },
        });

        return {
          sent: sanitizeTelegramMessage(userMessage),
          reply: sanitizeTelegramMessage(botMessage),
        };
      } catch (error: any) {
        const systemMessage = await db.telegramChatMessage.create({
          data: {
            userId,
            senderRole: TELEGRAM_ROLES.SYSTEM,
            provider: TELEGRAM_PROVIDERS.OPENCLAW_RELAY,
            content: error.message || 'OpenClaw-Relay konnte nicht erreicht werden.',
            chatId: configuredChatId || null,
          },
        });

        return {
          sent: sanitizeTelegramMessage(userMessage),
          reply: sanitizeTelegramMessage(systemMessage),
        };
      }
    }

    const telegramToken = process.env.TELEGRAM_BOT_TOKEN?.trim();
    if (telegramToken && configuredChatId) {
      try {
        const response = await fetch(`https://api.telegram.org/bot${telegramToken}/sendMessage`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify({
            chat_id: configuredChatId,
            text: trimmedContent,
          }),
        });

        if (!response.ok) {
          throw new Error('Telegram-Nachricht konnte nicht gesendet werden');
        }

        const infoMessage = await db.telegramChatMessage.create({
          data: {
            userId,
            senderRole: TELEGRAM_ROLES.SYSTEM,
            provider: TELEGRAM_PROVIDERS.TELEGRAM_PROXY,
            content:
              'Nachricht über den Telegram-Fallback gesendet. Für direkte OpenClaw-Antworten im Widget konfiguriere OPENCLAW_BOT_WEBHOOK_URL im Backend.',
            chatId: configuredChatId,
          },
        });

        return {
          sent: sanitizeTelegramMessage(userMessage),
          reply: sanitizeTelegramMessage(infoMessage),
        };
      } catch (error: any) {
        const errorMessage = await db.telegramChatMessage.create({
          data: {
            userId,
            senderRole: TELEGRAM_ROLES.SYSTEM,
            provider: TELEGRAM_PROVIDERS.TELEGRAM_PROXY,
            content: error.message || 'Telegram konnte nicht erreicht werden.',
            chatId: configuredChatId,
          },
        });

        return {
          sent: sanitizeTelegramMessage(userMessage),
          reply: sanitizeTelegramMessage(errorMessage),
        };
      }
    }

    const fallbackMessage = await db.telegramChatMessage.create({
      data: {
        userId,
        senderRole: TELEGRAM_ROLES.SYSTEM,
        provider: TELEGRAM_PROVIDERS.LOCAL_PREVIEW,
        content:
          'OpenClaw ist noch nicht verbunden. Konfiguriere im Backend OPENCLAW_BOT_WEBHOOK_URL. Eine Konversations-ID im Widget ist optional; TELEGRAM_BOT_TOKEN bleibt nur für den Legacy-Fallback.',
        chatId: configuredChatId || null,
      },
    });

    return {
      sent: sanitizeTelegramMessage(userMessage),
      reply: sanitizeTelegramMessage(fallbackMessage),
    };
  }

  async createWidget(userId: string, data: { type: DashboardWidgetType; title?: string }) {
    const dashboard = await this.ensureDashboard(userId);
    const existing = dashboard.widgets.find((widget) => widget.type === data.type);

    if (existing) {
      throw new ConflictError('Dieses Widget ist bereits im Dashboard vorhanden');
    }

    const widgetCount = dashboard.widgets.length;
    const created = await db.userDashboardWidget.create({
      data: {
        ...createDefaultWidget(data.type, widgetCount),
        title: data.title?.trim() || widgetDefaults[data.type].title,
        dashboardId: dashboard.id,
        y: Math.max(0, ...dashboard.widgets.map((widget) => widget.y + widget.height)),
      },
    });

    return sanitizeWidgetType(created);
  }

  async updateWidget(userId: string, widgetId: string, data: { title?: string | null; isVisible?: boolean; isCollapsed?: boolean; settings?: Record<string, unknown> }) {
    const widget = await this.getWidgetForUser(userId, widgetId);

    const updated = await db.userDashboardWidget.update({
      where: { id: widget.id },
      data: {
        title: data.title === undefined ? undefined : normalizeNullableString(data.title) ?? widgetDefaults[widget.type].title,
        isVisible: data.isVisible,
        isCollapsed: data.isCollapsed,
        settings: data.settings === undefined ? undefined : (data.settings as Prisma.JsonObject),
      },
    });

    return sanitizeWidgetType(updated);
  }

  async updateWidgetLayout(userId: string, widgets: Array<{ id: string; x: number; y: number; width: number; height: number; mobileOrder: number }>) {
    const dashboard = await this.ensureDashboard(userId);
    const knownIds = new Set(dashboard.widgets.map((widget) => widget.id));

    for (const item of widgets) {
      if (!knownIds.has(item.id)) {
        throw new NotFoundError('Widget', item.id);
      }
    }

    await db.$transaction(
      widgets.map((item) =>
        db.userDashboardWidget.update({
          where: { id: item.id },
          data: {
            x: item.x,
            y: item.y,
            width: item.width,
            height: item.height,
            mobileOrder: item.mobileOrder,
          },
        })
      )
    );

    const refreshed = await db.userDashboardWidget.findMany({
      where: { dashboardId: dashboard.id },
      orderBy: { mobileOrder: 'asc' },
    });

    return refreshed.map(sanitizeWidgetType);
  }

  async deleteWidget(userId: string, widgetId: string) {
    const widget = await this.getWidgetForUser(userId, widgetId);
    await db.userDashboardWidget.delete({ where: { id: widget.id } });
    return { message: 'Widget entfernt' };
  }

  async listBookmarks(userId: string) {
    const itemsRaw = await bookmarkDb.findMany({
      where: { userId },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
    const items = await hydrateBookmarkFavicons(itemsRaw);
    const tree = buildBookmarkTree(items);
    return {
      tree: tree.map(sanitizeBookmarkNode),
      toolbar: tree.filter((item) => item.showInToolbar).map(sanitizeBookmarkNode),
      ...getBookmarkStats(tree),
    };
  }

  async createBookmark(userId: string, data: { itemType?: 'BOOKMARK' | 'FOLDER'; parentId?: string | null; title: string; url?: string | null; description?: string | null; notes?: string | null; category?: string | null; tags?: string[]; faviconUrl?: string | null; isFavorite?: boolean; isPinned?: boolean; isArchived?: boolean; showInToolbar?: boolean }) {
    const itemType = data.itemType ?? BOOKMARK_ITEM_TYPES.BOOKMARK;
    const parentId = data.parentId ?? null;
    const normalizedUrl = itemType === BOOKMARK_ITEM_TYPES.FOLDER ? null : normalizeBookmarkUrl(data.url);
    const domain = itemType === BOOKMARK_ITEM_TYPES.FOLDER ? null : getBookmarkDomain(data.url);

    if (parentId) {
      const parent = await this.getBookmarkForUser(userId, parentId);
      if (parent.itemType !== BOOKMARK_ITEM_TYPES.FOLDER) {
        throw new ValidationError('Neue Lesezeichen können nur in Ordner gelegt werden');
      }
    }

    if (itemType === BOOKMARK_ITEM_TYPES.BOOKMARK && !normalizedUrl) {
      throw new ValidationError('Für ein Lesezeichen wird eine URL benötigt');
    }

    const currentCount = await bookmarkDb.count({ where: { userId, parentId } });

    const faviconUrl =
      itemType === BOOKMARK_ITEM_TYPES.FOLDER
        ? null
        : normalizeNullableString(data.faviconUrl) ??
          (await downloadFaviconDataUrl(data.url)) ??
          deriveFaviconUrl(data.url);

    return bookmarkDb.create({
      data: {
        userId,
        parentId,
        itemType,
        title: data.title.trim(),
        url: itemType === BOOKMARK_ITEM_TYPES.FOLDER ? null : data.url?.trim() ?? null,
        normalizedUrl,
        domain,
        description: normalizeNullableString(data.description),
        notes: normalizeNullableString(data.notes),
        category: normalizeNullableString(data.category),
        tags: normalizeBookmarkTags(data.tags) ?? [],
        faviconUrl,
        isFavorite: data.isFavorite ?? false,
        isPinned: data.isPinned ?? false,
        isArchived: data.isArchived ?? false,
        showInToolbar: data.isArchived ? false : data.showInToolbar ?? parentId === null,
        sortOrder: currentCount,
      },
    });
  }

  async updateBookmark(userId: string, bookmarkId: string, data: Record<string, any>) {
    const bookmark = await this.getBookmarkForUser(userId, bookmarkId);
    const nextParentId = data.parentId === undefined ? bookmark.parentId : data.parentId;

    if (nextParentId === bookmark.id) {
      throw new ValidationError('Ein Eintrag kann nicht sein eigener Ordner sein');
    }

    if (nextParentId) {
      const parent = await this.getBookmarkForUser(userId, nextParentId);
      if (parent.itemType !== BOOKMARK_ITEM_TYPES.FOLDER) {
        throw new ValidationError('Lesezeichen können nur in Ordner verschoben werden');
      }
    }

    const nextItemType = data.itemType ?? bookmark.itemType;
    const nextUrl =
      nextItemType === BOOKMARK_ITEM_TYPES.FOLDER
        ? null
        : data.url === undefined
          ? bookmark.url
          : normalizeNullableString(data.url);
    const nextNormalizedUrl = nextItemType === BOOKMARK_ITEM_TYPES.FOLDER ? null : normalizeBookmarkUrl(nextUrl);
    const nextDomain = nextItemType === BOOKMARK_ITEM_TYPES.FOLDER ? null : getBookmarkDomain(nextUrl);

    if (nextItemType === BOOKMARK_ITEM_TYPES.BOOKMARK && !nextNormalizedUrl) {
      throw new ValidationError('Für ein Lesezeichen wird eine URL benötigt');
    }

    const nextFaviconUrl =
      data.faviconUrl === undefined
        ? undefined
        : nextItemType === BOOKMARK_ITEM_TYPES.FOLDER
          ? null
          : normalizeNullableString(data.faviconUrl) ??
            (await downloadFaviconDataUrl(nextUrl)) ??
            deriveFaviconUrl(nextUrl);

    return bookmarkDb.update({
      where: { id: bookmarkId },
      data: {
        title: data.title?.trim(),
        parentId: data.parentId,
        itemType: data.itemType,
        url: nextUrl,
        normalizedUrl: data.url === undefined && data.itemType === undefined ? undefined : nextNormalizedUrl,
        domain: data.url === undefined && data.itemType === undefined ? undefined : nextDomain,
        description: data.description === undefined ? undefined : normalizeNullableString(data.description),
        notes: data.notes === undefined ? undefined : normalizeNullableString(data.notes),
        category: data.category === undefined ? undefined : normalizeNullableString(data.category),
        tags: data.tags === undefined ? undefined : normalizeBookmarkTags(data.tags) ?? [],
        faviconUrl: nextFaviconUrl,
        isFavorite: data.isFavorite,
        isPinned: data.isPinned,
        isArchived: data.isArchived,
        showInToolbar: data.isArchived ? false : data.showInToolbar,
        linkStatus: data.linkStatus,
        httpStatus: data.httpStatus,
        lastCheckedAt: data.lastCheckedAt,
        lastOpenedAt: data.lastOpenedAt,
        sortOrder: data.sortOrder,
      },
    });
  }

  async deleteBookmark(userId: string, bookmarkId: string) {
    const bookmark = await this.getBookmarkForUser(userId, bookmarkId);
    await bookmarkDb.delete({ where: { id: bookmarkId } });
    return { message: 'Lesezeichen gelöscht' };
  }

  async reorderBookmarks(userId: string, items: Array<{ id: string; parentId: string | null; sortOrder: number; showInToolbar?: boolean }>) {
    const known = await bookmarkDb.findMany({ where: { userId }, select: { id: true } });
    const knownIds = new Set(known.map((item: { id: string }) => item.id));

    for (const item of items) {
      if (!knownIds.has(item.id)) {
        throw new NotFoundError('Bookmark', item.id);
      }
      if (item.parentId && !knownIds.has(item.parentId)) {
        throw new NotFoundError('Bookmark', item.parentId);
      }
    }

    await db.$transaction(
      items.map((item) =>
        bookmarkDb.update({
          where: { id: item.id },
          data: {
            parentId: item.parentId,
            sortOrder: item.sortOrder,
            showInToolbar: item.showInToolbar,
          },
        })
      )
    );

    return this.listBookmarks(userId);
  }

  async importBookmarks(userId: string, data: { html: string; mode?: 'append' | 'replace' }) {
    const parsed = parseBookmarkImport(data.html);
    if (parsed.length === 0) {
      throw new ValidationError('Die Importdatei enthält keine lesbaren Lesezeichen');
    }

    const createNodes = async (
      nodes: Array<Record<string, unknown>>,
      parentId: string | null
    ) => {
      for (let index = 0; index < nodes.length; index += 1) {
        const node = nodes[index];
        const itemType =
          node.itemType === BOOKMARK_ITEM_TYPES.FOLDER ? BOOKMARK_ITEM_TYPES.FOLDER : BOOKMARK_ITEM_TYPES.BOOKMARK;

        const resolvedFaviconUrl =
          itemType === BOOKMARK_ITEM_TYPES.BOOKMARK
            ? normalizeNullableString(typeof node.faviconUrl === 'string' ? node.faviconUrl : null) ??
              (await downloadFaviconDataUrl(typeof node.url === 'string' ? node.url : null)) ??
              deriveFaviconUrl(typeof node.url === 'string' ? node.url : null)
            : null;
        const importedUrl = itemType === BOOKMARK_ITEM_TYPES.BOOKMARK ? normalizeNullableString(String(node.url || '')) : null;

        const created = await bookmarkDb.create({
          data: {
            userId,
            parentId,
            itemType,
            title: String(node.title || (itemType === BOOKMARK_ITEM_TYPES.FOLDER ? 'Ordner' : 'Lesezeichen')),
            url: importedUrl,
            normalizedUrl: normalizeBookmarkUrl(importedUrl),
            domain: getBookmarkDomain(importedUrl),
            faviconUrl: resolvedFaviconUrl,
            isFavorite: false,
            showInToolbar: parentId === null,
            sortOrder: typeof node.sortOrder === 'number' ? node.sortOrder : index,
          },
        });

        if (itemType === BOOKMARK_ITEM_TYPES.FOLDER) {
          await createNodes((node.children as Array<Record<string, unknown>> | undefined) ?? [], created.id);
        }
      }
    };

    if (data.mode === 'replace') {
      await bookmarkDb.deleteMany({ where: { userId } });
    }

    const rootCount = await bookmarkDb.count({ where: { userId, parentId: null } });
    const shiftedParsed = parsed.map((node, index) => ({
      ...node,
      sortOrder: rootCount + index,
    }));

    await createNodes(shiftedParsed, null);

    return {
      message: `${flattenBookmarkTree(buildBookmarkTree(await bookmarkDb.findMany({ where: { userId } }))).length} Einträge stehen jetzt zur Verfügung.`,
      bookmarks: await this.listBookmarks(userId),
    };
  }

  async exportBookmarks(userId: string) {
    const tree = (await this.listBookmarks(userId)).tree;
    const html = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<!-- This is an automatically generated file. -->
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Bookmarks</TITLE>
<H1>FlatHacksWiki Lesezeichen</H1>
<DL><p>
${renderBookmarksAsHtml(tree)}
</DL><p>`;

    return {
      fileName: `flathackswiki-bookmarks-${new Date().toISOString().slice(0, 10)}.html`,
      html,
    };
  }

  async getCommute(userId: string) {
    const profile = await db.commuteProfile.findUnique({ where: { userId } });
    return {
      profile,
      todayMode: profile
        ? profile.officeDays.includes(getWeekdayKey())
          ? 'office'
          : profile.homeOfficeDays.includes(getWeekdayKey())
            ? 'homeOffice'
            : 'unspecified'
        : 'unset',
      route: profile && profile.officeDays.includes(getWeekdayKey()) ? await fetchRouteSummary(profile) : null,
    };
  }

  async upsertCommute(userId: string, data: {
    sourceAddress: string;
    destinationAddress: string;
    officeDays: string[];
    homeOfficeDays: string[];
    outboundLabel?: string | null;
    returnLabel?: string | null;
    departureTime?: string | null;
    returnDepartureTime?: string | null;
  }) {
    if (data.officeDays.some((day) => data.homeOfficeDays.includes(day))) {
      throw new ValidationError('Ein Wochentag kann nicht gleichzeitig Büro und Homeoffice sein');
    }

    return db.commuteProfile.upsert({
      where: { userId },
      update: {
        sourceAddress: data.sourceAddress.trim(),
        destinationAddress: data.destinationAddress.trim(),
        officeDays: data.officeDays,
        homeOfficeDays: data.homeOfficeDays,
        outboundLabel: normalizeNullableString(data.outboundLabel),
        returnLabel: normalizeNullableString(data.returnLabel),
        departureTime: normalizeNullableString(data.departureTime),
        returnDepartureTime: normalizeNullableString(data.returnDepartureTime),
      },
      create: {
        userId,
        sourceAddress: data.sourceAddress.trim(),
        destinationAddress: data.destinationAddress.trim(),
        officeDays: data.officeDays,
        homeOfficeDays: data.homeOfficeDays,
        outboundLabel: normalizeNullableString(data.outboundLabel),
        returnLabel: normalizeNullableString(data.returnLabel),
        departureTime: normalizeNullableString(data.departureTime),
        returnDepartureTime: normalizeNullableString(data.returnDepartureTime),
      },
    });
  }

  async getTimeTracking(userId: string) {
    return this.getDashboard(userId).then((dashboard) => dashboard.timeTracking);
  }

  async createTimeProject(userId: string, data: {
    name: string;
    description?: string | null;
    color?: string | null;
    client?: string | null;
    category?: string | null;
  }) {
    return db.timeTrackingProject.create({
      data: {
        userId,
        name: data.name.trim(),
        description: normalizeNullableString(data.description),
        color: normalizeNullableString(data.color),
        client: normalizeNullableString(data.client),
        category: normalizeNullableString(data.category),
      },
    });
  }

  async updateTimeProject(userId: string, projectId: string, data: Partial<TimeTrackingProject>) {
    const project = await db.timeTrackingProject.findFirst({ where: { id: projectId, userId } });
    if (!project) {
      throw new NotFoundError('Projekt', projectId);
    }

    return db.timeTrackingProject.update({
      where: { id: projectId },
      data: {
        name: data.name?.trim(),
        description: data.description === undefined ? undefined : normalizeNullableString(data.description),
        color: data.color === undefined ? undefined : normalizeNullableString(data.color),
        client: data.client === undefined ? undefined : normalizeNullableString(data.client),
        category: data.category === undefined ? undefined : normalizeNullableString(data.category),
        isArchived: data.isArchived,
      },
    });
  }

  async deleteTimeProject(userId: string, projectId: string) {
    const project = await db.timeTrackingProject.findFirst({ where: { id: projectId, userId } });
    if (!project) {
      throw new NotFoundError('Projekt', projectId);
    }

    await db.timeTrackingProject.delete({ where: { id: projectId } });
    return { message: 'Projekt gelöscht' };
  }

  async startTimer(userId: string, data: { projectId: string; note?: string | null }) {
    const runningEntry = await db.timeEntry.findFirst({ where: { userId, endTime: null } });
    if (runningEntry) {
      throw new ConflictError('Es läuft bereits ein Timer');
    }

    await this.ensureProjectForUser(userId, data.projectId);

    const startTime = new Date();
    await this.assertNoOverlap(userId, startTime, null, undefined);

    return db.timeEntry.create({
      data: {
        userId,
        projectId: data.projectId,
        entryType: TimeEntryType.TIMER,
        startTime,
        note: normalizeNullableString(data.note),
      },
      include: { project: true },
    });
  }

  async stopTimer(userId: string, entryId: string, endTimeInput?: string) {
    const entry = await db.timeEntry.findFirst({ where: { id: entryId, userId } });
    if (!entry) {
      throw new NotFoundError('Zeiteintrag', entryId);
    }
    if (entry.endTime) {
      throw new ConflictError('Dieser Timer wurde bereits beendet');
    }

    const endTime = endTimeInput ? new Date(endTimeInput) : new Date();
    if (endTime <= entry.startTime) {
      throw new ValidationError('Die Endzeit muss nach der Startzeit liegen');
    }

    await this.assertNoOverlap(userId, entry.startTime, endTime, entry.id);

    return db.timeEntry.update({
      where: { id: entry.id },
      data: {
        endTime,
        durationMinutes: calculateDurationMinutes(entry.startTime, endTime),
      },
      include: { project: true },
    });
  }

  async createTimeEntry(userId: string, data: { projectId: string; startTime: string; endTime: string; note?: string | null }) {
    await this.ensureProjectForUser(userId, data.projectId);

    const startTime = new Date(data.startTime);
    const endTime = new Date(data.endTime);

    if (endTime <= startTime) {
      throw new ValidationError('Die Endzeit muss nach der Startzeit liegen');
    }

    await this.assertNoOverlap(userId, startTime, endTime);

    return db.timeEntry.create({
      data: {
        userId,
        projectId: data.projectId,
        entryType: TimeEntryType.MANUAL,
        startTime,
        endTime,
        durationMinutes: calculateDurationMinutes(startTime, endTime),
        note: normalizeNullableString(data.note),
      },
      include: { project: true },
    });
  }

  async updateTimeEntry(userId: string, entryId: string, data: { projectId?: string; startTime?: string; endTime?: string | null; note?: string | null }) {
    const entry = await db.timeEntry.findFirst({ where: { id: entryId, userId } });
    if (!entry) {
      throw new NotFoundError('Zeiteintrag', entryId);
    }

    if (data.projectId) {
      await this.ensureProjectForUser(userId, data.projectId);
    }

    const startTime = data.startTime ? new Date(data.startTime) : entry.startTime;
    const endTime = data.endTime === undefined ? entry.endTime : data.endTime ? new Date(data.endTime) : null;

    if (endTime && endTime <= startTime) {
      throw new ValidationError('Die Endzeit muss nach der Startzeit liegen');
    }

    await this.assertNoOverlap(userId, startTime, endTime, entry.id);

    return db.timeEntry.update({
      where: { id: entry.id },
      data: {
        projectId: data.projectId,
        startTime,
        endTime,
        durationMinutes: endTime ? calculateDurationMinutes(startTime, endTime) : null,
        note: data.note === undefined ? undefined : normalizeNullableString(data.note),
      },
      include: { project: true },
    });
  }

  async deleteTimeEntry(userId: string, entryId: string) {
    const entry = await db.timeEntry.findFirst({ where: { id: entryId, userId } });
    if (!entry) {
      throw new NotFoundError('Zeiteintrag', entryId);
    }

    await db.timeEntry.delete({ where: { id: entry.id } });
    return { message: 'Zeiteintrag gelöscht' };
  }

  private async getWidgetForUser(userId: string, widgetId: string) {
    const widget = await db.userDashboardWidget.findFirst({
      where: {
        id: widgetId,
        dashboard: {
          userId,
        },
      },
    });

    if (!widget) {
      throw new NotFoundError('Widget', widgetId);
    }

    return widget;
  }

  private async getBookmarkForUser(userId: string, bookmarkId: string) {
    const bookmark = await bookmarkDb.findFirst({
      where: { id: bookmarkId, userId },
    });

    if (!bookmark) {
      throw new NotFoundError('Bookmark', bookmarkId);
    }

    return bookmark;
  }

  private async getTelegramWidgetForUser(userId: string) {
    const dashboard = await this.ensureDashboard(userId);
    const widget = dashboard.widgets.find((item) => item.type === 'TELEGRAM_CHAT');

    if (!widget) {
      throw new NotFoundError('Telegram-Widget');
    }

    return widget;
  }

  private async ensureProjectForUser(userId: string, projectId: string) {
    const project = await db.timeTrackingProject.findFirst({ where: { id: projectId, userId } });
    if (!project) {
      throw new NotFoundError('Projekt', projectId);
    }
    if (project.isArchived) {
      throw new ValidationError('Archivierte Projekte können nicht bebucht werden');
    }
    return project;
  }

  private async assertNoOverlap(userId: string, startTime: Date, endTime: Date | null, excludeId?: string) {
    const entries = await db.timeEntry.findMany({
      where: {
        userId,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: {
        id: true,
        startTime: true,
        endTime: true,
      },
    });

    const hasOverlap = entries.some((entry) => {
      const entryEnd = entry.endTime ?? new Date('2999-12-31T23:59:59.999Z');
      const nextEnd = endTime ?? new Date('2999-12-31T23:59:59.999Z');
      return startTime < entryEnd && nextEnd > entry.startTime;
    });

    if (hasOverlap) {
      throw new ConflictError('Der Zeitraum überschneidet sich mit einem bestehenden Zeiteintrag');
    }
  }
}

export const dashboardService = new DashboardService();
