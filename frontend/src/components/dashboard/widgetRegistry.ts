import type { DashboardWidgetType } from '../../api/client';

export interface WidgetDefinition {
  type: DashboardWidgetType;
  label: string;
  description: string;
  singleton: boolean;
}

export const widgetDefinitions: WidgetDefinition[] = [
  { type: 'CLOCK', label: 'Uhrzeit', description: 'Aktuelle Uhrzeit und Datum', singleton: true },
  { type: 'WIKI_SEARCH', label: 'Wiki-Suche', description: 'Schnellsuche im Wiki', singleton: true },
  { type: 'WEB_SEARCH', label: 'Websuche', description: 'Externe Suche mit auswählbarem Anbieter', singleton: true },
  { type: 'WEATHER', label: 'Wetter', description: 'Wetter für einen konfigurierbaren Ort', singleton: true },
  { type: 'FAVORITE_SPACES', label: 'Favorisierte Bereiche', description: 'Wichtige Wiki-Bereiche im Blick', singleton: true },
  { type: 'NOTES', label: 'Notizen', description: 'Persönliche Schnellnotizen', singleton: true },
  { type: 'STATS', label: 'Übersicht', description: 'Kennzahlen zum Arbeitsbereich', singleton: true },
  { type: 'SPACES', label: 'Bereiche', description: 'Bereiche und Schnellzugriffe', singleton: true },
  { type: 'COMMUTE', label: 'Arbeitsweg', description: 'Route, Büro-Tage und Homeoffice', singleton: true },
  { type: 'TIME_TRACKER', label: 'Zeiterfassung', description: 'Projekte, Timer und manuelle Zeiten', singleton: true },
  { type: 'BOOKMARKS', label: 'Browser-Lesezeichen', description: 'Eigene Web-Links mit Kategorien und Favoriten', singleton: true },
];

export const widgetDefinitionMap = Object.fromEntries(
  widgetDefinitions.map((definition) => [definition.type, definition])
) as Record<DashboardWidgetType, WidgetDefinition>;
