import {
  DashboardWidgetType,
  Prisma,
  TimeEntryType,
  type Bookmark,
  type CommuteProfile,
  type TimeEntry,
  type TimeTrackingProject,
  type UserDashboardWidget,
} from '@prisma/client';
import { db } from '../../config/database.js';
import { ConflictError, NotFoundError, ValidationError } from '../../core/errors/app.errors.js';

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
  FAVORITE_SPACES: {
    title: 'Favorisierte Bereiche',
    x: 4,
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
    y: 3,
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
};

const defaultWidgetOrder: DashboardWidgetType[] = [
  DashboardWidgetType.CLOCK,
  DashboardWidgetType.WIKI_SEARCH,
  DashboardWidgetType.WEB_SEARCH,
  DashboardWidgetType.WEATHER,
  DashboardWidgetType.FAVORITE_SPACES,
  DashboardWidgetType.NOTES,
  DashboardWidgetType.STATS,
  DashboardWidgetType.SPACES,
  DashboardWidgetType.COMMUTE,
  DashboardWidgetType.TIME_TRACKER,
  DashboardWidgetType.BOOKMARKS,
];

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

    const routeUrl = `https://router.project-osrm.org/route/v1/driving/${source.longitude},${source.latitude};${destination.longitude},${destination.latitude}?overview=false&steps=false&alternatives=false`;
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
      routes?: Array<{ distance: number; duration: number }>;
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

    const weatherResponse = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${location.latitude}&longitude=${location.longitude}&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m&wind_speed_unit=kmh`,
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
    };

    const current = data.current;
    if (!current) {
      throw new ValidationError('Keine Wetterdaten verfügbar');
    }

    return {
      location: location.country ? `${location.name}, ${location.country}` : location.name,
      temperatureC: String(current.temperature_2m ?? '-'),
      description: getWeatherDescription(current.weather_code),
      humidity: String(current.relative_humidity_2m ?? '-'),
      windKph: String(current.wind_speed_10m ?? '-'),
    };
  }

  private async ensureDashboard(userId: string) {
    const existing = await db.userDashboard.findUnique({
      where: { userId },
      include: { widgets: true },
    });

    if (existing) {
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
    const [bookmarks, commuteProfile, spaces, projects, recentEntries, runningEntry] = await Promise.all([
      db.bookmark.findMany({ where: { userId }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] }),
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
    ]);

    const todayStart = getStartOfDay(new Date());
    const weekStart = getStartOfWeek(new Date());

    const [todayEntries, weekEntries] = await Promise.all([
      db.timeEntry.findMany({ where: { userId, startTime: { gte: todayStart } } }),
      db.timeEntry.findMany({ where: { userId, startTime: { gte: weekStart } } }),
    ]);

    const favoriteWidget = dashboard.widgets.find((widget) => widget.type === DashboardWidgetType.FAVORITE_SPACES);
    const favoriteKeys = Array.isArray((favoriteWidget?.settings as Record<string, unknown> | null)?.spaceKeys)
      ? ((favoriteWidget?.settings as Record<string, unknown>).spaceKeys as string[])
      : [];

    const todayMode = commuteProfile
      ? commuteProfile.officeDays.includes(getWeekdayKey())
        ? 'office'
        : commuteProfile.homeOfficeDays.includes(getWeekdayKey())
          ? 'homeOffice'
          : 'unspecified'
      : 'unset';

    return {
      widgets: dashboard.widgets.sort((a, b) => a.mobileOrder - b.mobileOrder).map(sanitizeWidgetType),
      bookmarks,
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
    return db.bookmark.findMany({ where: { userId }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] });
  }

  async createBookmark(userId: string, data: { title: string; url: string; description?: string | null; category?: string | null; faviconUrl?: string | null; isFavorite?: boolean }) {
    const currentCount = await db.bookmark.count({ where: { userId } });

    return db.bookmark.create({
      data: {
        userId,
        title: data.title.trim(),
        url: data.url.trim(),
        description: normalizeNullableString(data.description),
        category: normalizeNullableString(data.category),
        faviconUrl: normalizeNullableString(data.faviconUrl),
        isFavorite: data.isFavorite ?? false,
        sortOrder: currentCount,
      },
    });
  }

  async updateBookmark(userId: string, bookmarkId: string, data: Partial<Bookmark>) {
    const bookmark = await db.bookmark.findFirst({ where: { id: bookmarkId, userId } });
    if (!bookmark) {
      throw new NotFoundError('Bookmark', bookmarkId);
    }

    return db.bookmark.update({
      where: { id: bookmarkId },
      data: {
        title: data.title?.trim(),
        url: data.url?.trim(),
        description: data.description === undefined ? undefined : normalizeNullableString(data.description),
        category: data.category === undefined ? undefined : normalizeNullableString(data.category),
        faviconUrl: data.faviconUrl === undefined ? undefined : normalizeNullableString(data.faviconUrl),
        isFavorite: data.isFavorite,
        sortOrder: data.sortOrder,
      },
    });
  }

  async deleteBookmark(userId: string, bookmarkId: string) {
    const bookmark = await db.bookmark.findFirst({ where: { id: bookmarkId, userId } });
    if (!bookmark) {
      throw new NotFoundError('Bookmark', bookmarkId);
    }

    await db.bookmark.delete({ where: { id: bookmarkId } });
    return { message: 'Lesezeichen gelöscht' };
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
