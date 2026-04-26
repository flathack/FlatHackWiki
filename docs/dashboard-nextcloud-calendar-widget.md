# Nextcloud Kalender-Widget fuer das Dashboard

## Ziel

Das Dashboard erhaelt ein echtes Kalender-Widget auf Basis von Nextcloud. Das Widget zeigt aktuelle und bevorstehende Termine platzsparend an, funktioniert responsiv und leitet bei Bedarf in die vollstaendige Nextcloud-Kalenderansicht weiter.

## Produktziel

- Termine aus Nextcloud im Dashboard sichtbar machen.
- Auch auf wenig Platz nutzbar bleiben.
- Heute und die naechsten Termine deutlich hervorheben.
- Farbige Unterscheidung mehrerer Kalender erlauben.
- Nextcloud als fuehrende Kalender-Anwendung beibehalten.
- Gute Lade-, Fehler- und Leerzustaende liefern.

## Bevorzugte Integrationsvariante

Empfohlen wird eine serverseitige read-only CalDAV-Anbindung im Wiki-Backend.

Begruendung:

- Das Widget kann dadurch echte Agenda-Daten kompakt und kontrolliert darstellen.
- Performance, Caching, Filterung und Fehlerbehandlung bleiben im Wiki steuerbar.
- Nextcloud bleibt fuer Bearbeitung, Einladungen, Serienlogik und Vollansicht verantwortlich.
- Ein Embed der kompletten Nextcloud-UI ist auf engem Dashboard-Platz UX-seitig schwach.

## Variantenvergleich

### 1. Serverseitige CalDAV-Anbindung

Vorteile:

- Beste Dashboard-UX
- Gute Performance durch Backend-Caching
- Saubere Filterung nach Kalendern und Zeitfenstern
- Gute Basis fuer spaetere Erweiterungen

Nachteile:

- Erfordert CalDAV- und ICS-Verarbeitung im Backend
- Zugangsdaten und Fehlerfaelle muessen sauber behandelt werden

Bewertung: Empfohlen

### 2. Einbettung der Nextcloud-Kalenderoberflaeche

Vorteile:

- Wenig eigene Fachlogik
- Nextcloud bleibt voll interaktiv

Nachteile:

- Schlechte Nutzung auf kleinem Platz
- Problematisch bei Cookies, CSP und OIDC
- Wirkt nicht wie ein echtes Dashboard-Widget

Bewertung: Nicht empfohlen

### 3. Nextcloud-nahe Sonderanbindung oder interne APIs

Vorteile:

- Tiefe Integration denkbar

Nachteile:

- Hohe Wartungskosten
- Starke Abhaengigkeit von Nextcloud-Details

Bewertung: Spaetere Ausbaustufe, nicht MVP

## Feature-Spezifikation

### Funktionsumfang

- Widget-Typ `CALENDAR`
- Anzeige von `Jetzt`, `Heute` und `Naechste Termine`
- Kompakte Agenda-Darstellung fuer kleine Widgets
- Farbige Kalenderindikatoren
- Ganztagstermine und Zeittermine unterscheiden
- Klick auf Header oder Termin oeffnet Nextcloud
- Widget-Einstellungen fuer Modus, Anzahl und sichtbare Kalender

### Datenmodell

Widget-Settings:

- `mode`: `agenda`, `today`, `next`
- `calendarIds`: Liste ausgewaehlter Kalender
- `maxItems`: maximale Zahl sichtbarer Termine
- `showCalendarColors`: Kalenderfarben ein oder aus
- `highlightWindowMinutes`: Zeitraum fuer `beginnt bald`

Dashboard-Payload:

- `status`: `disabled`, `setup_required`, `ready`, `error`
- `message`
- `nextcloudUrl`
- `calendars[]`
- `events[]`
- `lastSyncedAt`

Event-Felder:

- `id`
- `calendarId`
- `calendarName`
- `calendarColor`
- `title`
- `startAt`
- `endAt`
- `isAllDay`
- `isRecurring`
- `location`
- `isToday`
- `isNow`
- `startsSoon`
- `nextcloudUrl`

### Notwendige Zusatzfeatures

- Kurzer Backend-Cache fuer CalDAV-Daten
- Saubere Leer- und Fehlerzustaende
- Sichere Behandlung von Nextcloud-Zugangsdaten
- Keine sensiblen Kalenderdetails in Logs
- Robuste Behandlung von Tagesgrenzen und Zeitzonen

## UI- und UX-Konzept

### Standarddarstellung

Das Widget ist eine kompakte Agenda-Karte mit drei Ebenen:

1. Kopfbereich mit Titel, Status-Badge und Link nach Nextcloud
2. Hervorgehobener Bereich fuer laufenden oder naechsten Termin
3. Agenda-Liste fuer heute und die naechsten Eintraege

### Verhalten nach Widget-Groesse

Klein:

- Fokus auf naechsten Termin
- maximal zwei bis drei weitere Eintraege

Mittel:

- `Jetzt / Als Naechstes`
- heutige Termine
- erste Folgeeintraege ab morgen

Gross:

- vollstaendigere Agenda
- optional erweiterter Kontext fuer viele Eintraege

### Zustandsdesign

Laden:

- ruhiger Ladezustand mit kurzer Statusmeldung

Leer:

- `Heute sind keine Termine geplant`
- trotzdem naechste kommende Termine anzeigen, wenn vorhanden

Fehler:

- klare technische Fehlermeldung fuer Benutzer
- Aktionen `Erneut versuchen` oder `In Nextcloud oeffnen`

Setup:

- Hinweise auf fehlende Nextcloud-Konfiguration
- direkte Weiterleitung zur Kalender-/Kontakte-Seite oder zu Nextcloud

## Read-only vs. interaktiv

### Read-only

- Anzeige von Terminen
- Filterung und visuelle Verdichtung
- Weiterleitung in Nextcloud

### Interaktiv

- Termin anlegen oder bearbeiten
- Serien, Teilnehmer, Zusagen, Konflikte
- deutlich hoehere Komplexitaet

Empfehlung:

Das Dashboard-Widget bleibt im MVP read-only. Bearbeitung und Vollansicht finden in Nextcloud statt.

## MVP-Abgrenzung

### Im MVP enthalten

- Widget-Typ `CALENDAR`
- serverseitige Nextcloud-Anbindung
- Agenda fuer heute und die naechsten Termine
- Mehrkalender-Auswahl
- Kalenderfarben optional sichtbar
- Nextcloud-Weiterleitung
- Leer-, Lade-, Setup- und Fehlerzustaende

### Nicht im MVP

- Terminbearbeitung im Wiki
- Drag-and-drop
- Teilnehmerverwaltung
- Erinnerungen im Wiki
- vollwertige Monats- oder Wochenansicht

## Akzeptanzkriterien

- Ein Kalender-Widget kann im Dashboard angelegt werden.
- Das Widget zeigt bei gueltiger Nextcloud-Konfiguration echte Termine an.
- `Heute` und `Naechste Termine` werden sinnvoll hervorgehoben.
- Mehrere Kalender koennen farblich unterschieden werden.
- Auf kleiner Widget-Flaeche bleibt die Darstellung lesbar.
- Bei fehlender Konfiguration erscheint ein klarer Setup-Zustand.
- Bei Nextcloud-Ausfall erscheint ein klarer Fehlerzustand.
- Ein Klick im Widget fuehrt zu Nextcloud.

## Umsetzungs-Roadmap

### Phase 1

- Spezifikation dokumentieren
- Widget-Typ und Datenmodell einfuehren
- Backend-Response fuer Kalenderdaten aufbauen
- Erste Agenda-Darstellung im Frontend anschliessen

### Phase 2

- Kalenderauswahl und Widget-Einstellungen verfeinern
- Caching und Zeitfenster optimieren
- Serien- und Sonderfaelle weiter haerten

### Phase 3

- Erweiterte Kalenderseite im Wiki
- optionale Mini-Monatsansicht
- spaetere tiefergehende Interaktion nur bei echtem Bedarf

## Technische Startentscheidung

Bevorzugte Loesung: serverseitige read-only CalDAV-Anbindung mit kompakter Agenda im Dashboard und Deep Link nach Nextcloud fuer die Vollansicht.