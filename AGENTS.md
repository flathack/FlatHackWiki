# FlatHackWiki / OpenClawWiki Agent Guide

## Mission

FlatHackWiki ist ein persoenliches, lokal und auf dem NAS betriebenes Wiki- und Dashboard-System fuer den Alltag. Es ist kein Marketing-Produkt und keine Demo-App. Aenderungen sollen reale Nutzung verbessern: schnell, kompakt, robust, wartbar.

Agenten sollen in diesem Repository vor allem drei Dinge sicher beherrschen:

1. das Dashboard und seine Widgets weiterentwickeln, ohne das Layout oder Theme zu destabilisieren
2. Backend-Logik in `dashboard.service.ts` und angrenzenden Modulen gezielt anpassen, ohne unnoetige Seiteneffekte zu erzeugen
3. lokale und NAS-nahe Deployments pragmatisch unterstuetzen, ohne fremde Container oder Konfigurationen blind umzubauen

## Produktbild

Das System vereint mehrere Alltagstools in einer Oberflaeche:

- Wiki mit Spaces, Seiten, Kommentaren und Rollen
- persoenliches Dashboard mit frei platzierbaren Widgets
- Bookmark-Manager mit Baumstruktur, Import/Export und Websuche-Vorschlaegen
- Kalender-/Kontakt-Anbindung ueber Nextcloud
- Zeiterfassung
- Admin- und Identity-Funktionen
- OpenClaw-Chat als Dashboard-Widget ueber das bestehende Telegram-Widget-Modell

Wichtig: Das Dashboard soll wie ein Werkzeugbrett wirken, nicht wie eine Landingpage.

## Tech Stack

| Bereich | Technologie |
| --- | --- |
| Frontend | React 18, TypeScript, Vite, TailwindCSS |
| Backend | Node.js, TypeScript, Express |
| Datenbank | PostgreSQL, Prisma |
| Auth | JWT lokal, OIDC/Keycloak vorbereitet |
| Groupware | Nextcloud fuer Kalender/Kontakte |
| Deployment | Docker Compose lokal, GHCR, Portainer, NAS |

## Wichtigste Pfade

| Pfad | Zweck |
| --- | --- |
| `frontend/src/pages/Dashboard.tsx` | zentrale Dashboard-Seite, Widget-Rendering, Chat, Layout, Profil-Dialog |
| `frontend/src/index.css` | globale Styles fuer App, Theme, Dashboard und Widgets |
| `frontend/src/api/client.ts` | API-Typen und Frontend-Client |
| `frontend/src/components/dashboard/widgetRegistry.ts` | sichtbare Widget-Definitionen |
| `frontend/src/pages/Bookmarks.tsx` | vollwertiger Bookmark-Manager |
| `backend/src/modules/dashboard/dashboard.service.ts` | Kernlogik fuer Dashboard, Chat, Wetter, Bookmarks, Kalender, Zeit |
| `backend/src/modules/dashboard/dashboard.controller.ts` | Dashboard-Controller |
| `backend/src/modules/dashboard/dashboard.routes.ts` | Dashboard-Routen |
| `backend/prisma/schema.prisma` | Datenmodell |
| `docs/` | Spezifikationen, NAS- und Deployment-Dokumentation |
| `docker-compose.yml` | lokaler Hauptstack |
| `docker-compose.identity.yml` | Keycloak/OIDC-Erweiterung |
| `docker-compose.nextcloud.yml` | Nextcloud-Erweiterung |
| `docker-compose.ghcr.yml` | GHCR-/Portainer-Deployment |

## Aktuelle Schwerpunktbereiche

### Dashboard

- Hero mit Websuche und Bookmark-Vorschlaegen
- Wetter-Chip und Wetter-Widget nutzen dieselbe Datenbasis
- Widget-Layout ist benutzerspezifisch und muss zwischen Edit- und View-Mode konsistent bleiben
- OpenClaw-Chat nutzt im Frontend weiterhin den Widget-Typ `TELEGRAM_CHAT`

### Bookmarks

- der Bookmark-Manager unter `/bookmarks` ist die Hauptflaeche fuer Lesezeichenpflege
- das historische `BOOKMARKS`-Widget soll nicht als regulaeres Dashboard-Widget weiter ausgebaut werden
- Vorschlaege in der Websuche sollen Bookmarks direkt nutzbar machen

### Kalender / Kontakte

- Nextcloud ist die bevorzugte Integrationsbasis
- Kalenderdaten laufen ueber CalDAV
- Kontakte sind Folgeausbau, nicht quer im Dashboard improvisieren

### OpenClaw-Chat

- das bestehende Dashboard-Widget mit Typ `TELEGRAM_CHAT` ist semantisch als OpenClaw-Chat umgenutzt
- Backend-Relay nutzt `OPENCLAW_BOT_WEBHOOK_URL`
- fuer die neue Responses-API wird Bearer-Auth ueber `OPENCLAW_BOT_WEBHOOK_BEARER_TOKEN` unterstuetzt
- validierter Live-Pfad fuer das NAS war zuletzt `OPENCLAW_BOT_WEBHOOK_URL=http://100.127.251.119:18789/v1/responses`
- Bearer-Token wird getrennt als `OPENCLAW_BOT_WEBHOOK_BEARER_TOKEN=<token>` gesetzt
- akzeptiertes Request-Format fuer OpenClaw war zuletzt `model: "openclaw"`, `input: <string>`, `metadata: { userId, chatId? }`
- `chatId` nur mitsenden, wenn wirklich als String vorhanden; `null` fuehrt dort zu Fehlern

## Arbeitsregeln fuer Agenten

1. Erst den engsten entscheidenden Pfad lesen. Fuer Dashboard-Arbeiten meist `Dashboard.tsx`, `client.ts`, `dashboard.service.ts` und `index.css`.
2. Bestehende Muster weiterfuehren, keine neue Architektur aufmachen, wenn ein vorhandener Pfad nur leicht angepasst werden muss.
3. Keine fremden lokalen Aenderungen revertieren.
4. Keine unnoetigen Umbenennungen, keine grossen Stil-Rewrites.
5. Frontend- und Backend-Aenderungen immer gegen die existierenden API-Typen pruefen.
6. Wenn Layout oder Widget-Verhalten betroffen ist, Edit- und View-Mode gemeinsam denken. Ein Fix nur fuer einen Modus ist meistens unvollstaendig.
7. Bei Chat-/Polling-Aenderungen Full-Reloads vermeiden. Lokale State-Updates bevorzugen, wenn nur ein Teilbereich aktualisiert werden muss.
8. NAS-Deployments nur gezielt und minimal. Keine fremden Container oder Stacks blind umbauen.

## UI- und UX-Regeln

- Widgets muessen kompakt sein und ihren Inhalt ohne unnoetige Leerraeume zeigen.
- Keine Landingpage-Optik, keine dekorativen Platzfresser.
- Dense ist erlaubt, aber nur wenn scanbar.
- Light, Sepia und Midnight muessen lesbar bleiben.
- Eingabefelder im hellen Theme duerfen keinen hellen Text auf hellem Hintergrund haben.
- Dropdowns, Menues und Overlays duerfen nicht an Containergrenzen abgeschnitten werden.
- Bestehende Dashboard- und Widget-Konventionen bevorzugen, bevor neue Styling-Systeme eingefuehrt werden.

## Bekannte Fallen

- Aeltere Textstellen in `Dashboard.tsx` koennen in PowerShell-Ausgaben mojibake-artig wirken. Nicht blind grosse Textbloecke anfassen.
- Wetter-Chip und Wetter-Widget sollen dieselbe zentrale Wetterdatenbasis verwenden, nicht getrennt nachladen.
- Das Dashboard hatte bereits Bugs, bei denen Chat-Senden oder Widget-Aenderungen das ganze Dashboard neu geladen haben. Solche Full-Reloads nur verwenden, wenn wirklich mehrere Teilbereiche synchronisiert werden muessen.
- Das Dashboard hatte bereits Inkonsistenzen zwischen Edit-Mode und View-Mode, wenn View ein anderes Layoutsystem als Edit nutzte.
- `BOOKMARKS` ist im Typmodell historisch noch vorhanden, aber kein primaerer Ausbaupfad mehr.
- Nextcloud- und Keycloak-Orphans beim Compose-Bauen sind nicht automatisch Fehler.
- Ein laufender OpenClaw-Container soll nicht ohne ausdrueckliche Absprache veraendert werden. Lesen ist ok, invasive Container-Aenderungen nur nach Freigabe.

## Lokale Entwicklung

### Frontend

```bash
cd frontend
npm run build
```

### Backend

```bash
cd backend
npm run build
```

### Prisma lokal anwenden

```bash
cd backend
$env:DATABASE_URL='postgresql://wikiuser:wikipass@localhost:5432/flathacks_wiki?schema=public'
npx prisma db push
```

### Lokaler Docker-Neubau

```bash
docker compose up -d --build api frontend
```

Nur Frontend:

```bash
docker compose up -d --build frontend
```

## NAS- und Live-Workflow

- Live-Wiki-Stack lag zuletzt unter `/Volume1/@apps/Portainer/compose/21`
- OpenClaw-Stack lag zuletzt unter `/Volume1/@apps/Portainer/compose/20`
- Vor Aenderungen an Live-Configs erst die bestehende Datei sichern
- Wenn nur Frontend-Assets oder Backend-`dist` aktualisiert werden muessen, ist Hot-Deploy in laufende Container oft schneller als kompletter Rebuild
- Bei Container-Adressierung aus dem Wiki-API-Container zunaechst reale Erreichbarkeit testen; auf dem NAS funktionierte zuletzt `http://100.127.251.119:18789`

## Validierungspflicht

- Nach Frontend-Aenderungen mindestens `npm run build` in `frontend`
- Nach Backend-Aenderungen mindestens `npm run build` in `backend`
- Bei OpenClaw-Relay-Aenderungen nach Moeglichkeit einen echten Request gegen den konfigurierten Endpoint pruefen
- Bei Layout-Aenderungen nicht nur Build pruefen, sondern konsistente Positionierung in Edit- und View-Mode mitdenken

## Dokumentation

- `docs/bookmark-manager-spec.md`
- `docs/calendar-contacts-nextcloud-plan.md`
- `docs/dashboard-nextcloud-calendar-widget.md`
- `docs/shared-identity-oidc.md`
- `docs/nas-remote-management.md`
- `docs/nas-update-from-git.md`
- `docs/portainer-ghcr-deployment.md`

## Kurzfassung fuer Agenten

Wenn die Aufgabe das Dashboard betrifft, beginne fast immer in `frontend/src/pages/Dashboard.tsx` und `backend/src/modules/dashboard/dashboard.service.ts`.

Wenn die Aufgabe das Live-System betrifft, aendere nur den kleinsten moeglichen Pfad und validiere gegen den echten Endpoint oder Container, statt breit umzubauen.

Wenn UI oder Layout betroffen sind, denke immer in diesen Paaren:

- Edit-Mode und View-Mode
- Light, Sepia, Midnight
- lokale State-Aktualisierung und Server-Persistenz

