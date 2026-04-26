# Portainer Deployment auf dem NAS

Diese Variante ist fuer Portainer auf einem x86_64- beziehungsweise amd64-NAS gedacht und bildet den kompletten lokalen Stack nach: Wiki, PostgreSQL, Keycloak, Nextcloud, Redis, Caddy und die OIDC-Bootstraps.

## Zielbild

- Portainer deployed `docker-compose.ghcr.yml` als kompletten Stack.
- Die Datei nutzt GHCR-Images fuer Frontend und Backend.
- Keycloak- und Nextcloud-OIDC werden beim Start automatisch konfiguriert.
- Es gibt keine lokalen Sourcecode- oder Windows-Pfad-Bind-Mounts mehr.

## 1. Voraussetzungen

- Dein NAS muss Docker-Images fuer `linux/amd64` ziehen koennen.
- Fuer private GHCR-Repositories muss in Portainer unter `Registries` ein GitHub-Registry-Login hinterlegt sein.
- Fuer persistente Daten nutzt der Stack benannte Docker-Volumes.

## 2. Stack-Datei verwenden

Verwende in Portainer die Datei [docker-compose.ghcr.yml](c:\Users\steve\Github\AmazonChecker\OpenClawWiki\openclaw-wiki\docker-compose.ghcr.yml).

Die Stack-Datei ist auf produktionsnahen Betrieb ausgelegt und startet:

- Wiki API
- Wiki Frontend
- Wiki PostgreSQL
- Keycloak plus Keycloak-PostgreSQL
- Nextcloud plus Nextcloud-PostgreSQL und Redis
- Caddy als HTTPS-Terminator fuer Nextcloud
- einen Keycloak-Bootstrap-Job
- einen Nextcloud-OIDC-Bootstrap-Job

## 3. Environment-Variablen vorbereiten

Nutze [.env.ghcr.example](c:\Users\steve\Github\AmazonChecker\OpenClawWiki\openclaw-wiki\.env.ghcr.example) als allgemeine, github-taugliche Vorlage.

Lege deine echten NAS-Werte in einer privaten Datei wie `.env.ghcr.personal` oder `.env.ghcr.local` ab. Diese Dateien sind absichtlich in `.gitignore` eingetragen und gehoeren nicht ins Repository.

Mindestens anpassen solltest du:

- `POSTGRES_PASSWORD`
- `DATABASE_URL`
- `JWT_SECRET`
- `KEYCLOAK_DB_PASSWORD`
- `KEYCLOAK_ADMIN_PASSWORD`
- `OIDC_CLIENT_SECRET`
- `NEXTCLOUD_DB_PASSWORD`
- `NEXTCLOUD_ADMIN_PASSWORD`
- `NEXTCLOUD_OIDC_CLIENT_SECRET`
- `APP_URL`
- `FRONTEND_URL`
- `CORS_ORIGIN`
- `OIDC_PUBLIC_ISSUER`
- `OIDC_REDIRECT_URI`
- `NEXTCLOUD_PUBLIC_URL`
- `NEXTCLOUD_TRUSTED_DOMAINS`
- `NEXTCLOUD_OVERWRITEHOST`

Typischer Startpunkt fuer dein NAS:

```env
BACKEND_IMAGE=ghcr.io/flathack/openclaw-wiki-backend:latest
FRONTEND_IMAGE=ghcr.io/flathack/openclaw-wiki-frontend:latest

APP_URL=https://wiki.deinedomain.tld
FRONTEND_URL=https://wiki.deinedomain.tld
CORS_ORIGIN=https://wiki.deinedomain.tld
FRONTEND_PORT=3002

KEYCLOAK_PORT=8081
OIDC_ISSUER=http://keycloak:8080/realms/flathackwiki
OIDC_PUBLIC_ISSUER=https://sso.deinedomain.tld/realms/flathackwiki
OIDC_REDIRECT_URI=https://wiki.deinedomain.tld/api/v1/auth/oidc/callback

NEXTCLOUD_HTTP_PORT=8080
NEXTCLOUD_HTTPS_PORT=8443
NEXTCLOUD_PUBLIC_URL=https://cloud.deinedomain.tld
NEXTCLOUD_TRUSTED_DOMAINS=cloud.deinedomain.tld localhost 127.0.0.1
NEXTCLOUD_OVERWRITEHOST=cloud.deinedomain.tld
NEXTCLOUD_OVERWRITEPROTOCOL=https
```

## 4. OIDC-Logik

Der Stack konfiguriert OIDC automatisch in zwei Schritten:

- `keycloak-bootstrap` legt Realm, Clients und den Admin-Benutzer an.
- Optionale Demo-Benutzer koennen ueber die `KEYCLOAK_DEMO_USER_*` Variablen gesetzt werden.
- `nextcloud-oidc-bootstrap` aktiviert `user_oidc` in Nextcloud und verdrahtet den Provider.

Wichtige Trennung:

- `OIDC_ISSUER` ist die interne Container-URL fuer die API.
- `OIDC_PUBLIC_ISSUER` ist die Browser-URL fuer das Wiki-Frontend.
- `OIDC_DISCOVERY_URI` zeigt fuer den Bootstrap intern auf Keycloak.

## 5. Nextcloud und Kalender

Das Kalender-Widget nutzt pro Benutzer eigene Nextcloud-Zugangsdaten aus dem Wiki-Profil. Die globalen `NEXTCLOUD_APP_PASSWORD_*` Werte bleiben nur ein optionaler Fallback.

Relevant auf dem NAS sind vor allem:

- `NEXTCLOUD_INTERNAL_URL=http://nextcloud`
- `NEXTCLOUD_PUBLIC_URL=https://cloud.deinedomain.tld`
- `NEXTCLOUD_CALENDAR_LOOKAHEAD_DAYS=14`

## 6. Deploy in Portainer

1. `Stacks` oeffnen.
2. `Add stack` waehlen.
3. Einen Namen wie `openclaw-wiki` vergeben.
4. Den Inhalt aus [docker-compose.ghcr.yml](c:\Users\steve\Github\AmazonChecker\OpenClawWiki\openclaw-wiki\docker-compose.ghcr.yml) einfuegen oder die Datei per Git-Stack referenzieren.
5. Unter `Environment variables` die Werte aus deiner `.env.ghcr.example`-Ableitung eintragen.
6. Den Stack deployen.

## 7. Nach dem ersten Start pruefen

- Frontend ist erreichbar.
- Die API antwortet auf `/api/health`.
- Keycloak ist auf dem konfigurierten Port erreichbar.
- Nextcloud ist ueber den HTTPS-Port erreichbar.
- Das Wiki zeigt den OIDC-Login an.
- Benutzer koennen im Profil ihren Nextcloud-Benutzernamen und ihr App-Passwort speichern.
- Das Kalender-Widget zeigt eigene und freigegebene Kalender mit Farben an.

## 8. Wichtige Hinweise fuer Portainer

- Die generische Stack-Datei verwendet absichtlich keine lokalen Script-Bind-Mounts.
- Der Nextcloud-OIDC-Bootstrap spricht den laufenden Nextcloud-Container ueber `/var/run/docker.sock` an.
- Wenn du schon alte lokale Testcontainer hast, beeinflusst das den NAS-Stack nicht. Relevant ist nur der Portainer-Deploy aus der aktuellen `docker-compose.ghcr.yml`.

## 9. Updates aus dem Git-Repository

Fuer den regulaeren Update-Weg vom Git-Repository bis zum NAS-Stack siehe [docs/nas-update-from-git.md](c:\Users\steve\Github\AmazonChecker\OpenClawWiki\openclaw-wiki\docs\nas-update-from-git.md).