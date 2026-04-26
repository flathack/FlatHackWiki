# FlatHackWiki Agent Context

## Projekt in einem Satz

FlatHackWiki ist ein lokal selbst gehostetes Wiki- und Dashboard-System fuer den Familien-/Privatbetrieb, mit Docker-Setup, gemeinsamer Identity-Anbindung, Nextcloud-Integration, persoenlichem Dashboard, Lesezeichen-Manager, Kalender-/Kontakt-Planung und Admin-Funktionen.

## Wichtige Ziele

- Das System soll lokal und spaeter auf dem NAS in Docker laufen.
- FlatHackWiki ist die zentrale Weboberflaeche fuer Wiki, Dashboard, Lesezeichen, Kalender, Kontakte, Admin und persoenliche Schnellzugriffe.
- Nextcloud wird fuer Kalender/Kontakte als CalDAV/CardDAV-Quelle eingebunden.
- Benutzer sollen langfristig ueber eine gemeinsame FlatHackID/OIDC-Anmeldung arbeiten.
- Das Dashboard soll kompakt, alltagstauglich und nicht wie eine Marketing-Seite wirken.
- UI-Aenderungen sollen moderne, klare, effiziente Werkzeuge bauen, keine dekorativen Platzfresser.

## Tech Stack

| Bereich | Technologie |
| --- | --- |
| Frontend | React 18, TypeScript, Vite, TailwindCSS |
| Backend | Node.js, TypeScript, Express |
| Datenbank | PostgreSQL, Prisma |
| Auth | JWT lokal, OIDC/Keycloak vorbereitet |
| Groupware | Nextcloud fuer Kalender/Kontakte |
| Deployment | Docker Compose lokal, GHCR/Portainer/NAS vorbereitet |

## Wichtige Pfade

| Pfad | Bedeutung |
| --- | --- |
| `frontend/src/pages/Dashboard.tsx` | Hauptdashboard, Widgets, Profil-Dialog, Hero-Suche/Wetter |
| `frontend/src/pages/Bookmarks.tsx` | Vollwertiger Lesezeichen-Manager |
| `frontend/src/components/dashboard/BookmarkManager.tsx` | Lesezeichenleiste und alte Dialog-Komponenten |
| `frontend/src/components/dashboard/widgetRegistry.ts` | Verfuegbare Dashboard-Widgets |
| `frontend/src/index.css` | Zentrale App-, Dashboard-, Widget- und Theme-Styles |
| `frontend/src/api/client.ts` | Frontend API-Typen und API-Client |
| `backend/src/modules/dashboard/dashboard.service.ts` | Dashboard-, Widget-, Wetter-, Kalender-, Bookmark- und Zeiterfassungslogik |
| `backend/src/modules/dashboard/dashboard.controller.ts` | Dashboard API Controller |
| `backend/prisma/schema.prisma` | Prisma Datenmodell |
| `docs/` | Architektur- und Feature-Spezifikationen |
| `docker-compose.yml` | Lokaler Hauptstack |
| `docker-compose.identity.yml` | Identity/Keycloak-Erweiterung |
| `docker-compose.nextcloud.yml` | Nextcloud-Erweiterung |
| `docker-compose.ghcr.yml` | GHCR/Portainer/NAS Deployment |

## Aktuelle Produktbereiche

### Wiki

- Spaces/Bereiche
- Seiten mit Markdown
- Kommentare
- Rollen/Rechte
- Admin-Bereich

### Dashboard

- Hero mit Websuche und Lesezeichen-Vorschlaegen
- Wetter-Kurzinformation neben der Suche
- Lesezeichenleiste
- Widgets mit Benutzerlayout
- Profil- und Design-Einstellungen

### Lesezeichen

- Neuer vollwertiger Bookmark-Manager unter `/bookmarks`
- Ordner-/Tree-Ansicht links
- Tags, Kategorien, Favoriten, Archiv, Import/Export
- Websuche soll Bookmarks vorschlagen und direkt oeffnen koennen
- Altes Bookmark-Widget wurde aus der Dashboard-Widget-Flaeche entfernt

### Kalender/Kontakte

- Nextcloud ist die bevorzugte Referenzarchitektur
- Kalender-Widget liest Events per CalDAV
- Kontakte sind als naechster Ausbau geplant
- Dokumentation: `docs/calendar-contacts-nextcloud-plan.md` und `docs/dashboard-nextcloud-calendar-widget.md`

### Zeiterfassung

- Dashboard-Widget `TIME_TRACKER`
- Projekte, Timer, manuelle Eintraege, Tages-/Wochensummen
- UI soll kompakt bleiben und nicht die ganze Startseite dominieren

## Lokale Entwicklung

### Frontend Build

```bash
cd frontend
npm run build
```

### Backend Build

```bash
cd backend
npm run build
```

### Prisma Schema lokal anwenden

```bash
cd backend
$env:DATABASE_URL='postgresql://wikiuser:wikipass@localhost:5432/flathacks_wiki?schema=public'
npx prisma db push
```

### Lokale Docker Images neu bauen

```bash
docker compose up -d --build api frontend
```

Nur Frontend:

```bash
docker compose up -d --build frontend
```

### Schnelltest

```bash
Invoke-WebRequest -UseBasicParsing http://localhost
Invoke-WebRequest -UseBasicParsing http://localhost/bookmarks
```

## UI-/UX-Regeln fuer dieses Projekt

- Dashboard-Widgets muessen kompakt sein und ihren Inhalt vollstaendig anzeigen.
- Keine grossen leeren Flaechen, keine Landingpage-Optik.
- Wiederkehrende Tools duerfen dense sein, muessen aber scanbar bleiben.
- Hauptnavigation soll einheitlich wirken.
- Light, Sepia und Midnight muessen lesbar sein.
- Eingabefelder im hellen Theme duerfen keinen weissen Text haben.
- Bookmark-Menues/Dropdowns duerfen nicht an Containergrenzen abgeschnitten werden.
- Fuer neue Funktionen bestehende Komponenten und CSS-Konventionen bevorzugen.

## Bekannte lokale Besonderheiten

- Einige aeltere Texte in `Dashboard.tsx` sehen in der PowerShell-Ausgabe mojibake-artig aus. Nicht blind grosse Textbloecke anfassen, wenn es nicht fuer die Aufgabe noetig ist.
- Die Wetterdaten werden im Dashboard zentral ueber `weatherCity`, `weather`, `weatherLoading` und `weatherError` geladen. Wetter-Chip und Wetter-Widget sollen dieselben Daten nutzen.
- Das alte `BOOKMARKS` Widget ist historisch noch im Typmodell vorhanden, soll aber nicht mehr als Dashboard-Widget genutzt werden.
- Nextcloud/Keycloak-Container koennen als Orphans gemeldet werden, wenn nur der Hauptcompose-Stack gebaut wird. Das ist nicht automatisch ein Fehler.

## Dokumentation

- Bookmark-Manager Spezifikation: `docs/bookmark-manager-spec.md`
- Kalender/Kontakte mit Nextcloud: `docs/calendar-contacts-nextcloud-plan.md`
- Nextcloud Kalender-Widget: `docs/dashboard-nextcloud-calendar-widget.md`
- Shared Identity/OIDC: `docs/shared-identity-oidc.md`
- NAS Remote Management: `docs/nas-remote-management.md`
- NAS Update von Git/GHCR: `docs/nas-update-from-git.md`
- Portainer/GHCR Deployment: `docs/portainer-ghcr-deployment.md`

## Arbeitsweise fuer Agenten

1. Erst vorhandene Patterns lesen, besonders `Dashboard.tsx`, `client.ts`, `dashboard.service.ts` und `index.css`.
2. Aenderungen eng auf die Aufgabe begrenzen.
3. Keine fremden lokalen Aenderungen revertieren.
4. Bei Schema-Aenderungen Prisma und API-Typen mitziehen.
5. Nach Frontend-Aenderungen mindestens `npm run build` im Frontend ausfuehren.
6. Nach Backend-Aenderungen mindestens `npm run build` im Backend ausfuehren.
7. Bei UI-Aenderungen Docker lokal neu bauen, wenn der Nutzer direkt testen will.

