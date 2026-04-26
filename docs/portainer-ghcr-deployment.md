# Portainer Deployment auf dem NAS

Diese Variante ist fuer Portainer gedacht und nutzt die produktionsnahen Images aus GHCR statt der lokalen Dev-Container.

## Zielbild

- Portainer deployed `docker-compose.ghcr.yml` als Stack.
- PostgreSQL, API und Frontend laufen auf dem NAS.
- OIDC und Nextcloud koennen ueber Umgebungsvariablen aktiviert werden.
- Benutzerbezogene Nextcloud-App-Passwoerter werden in der Datenbank gespeichert. Die globalen `NEXTCLOUD_*` Variablen sind nur noch optionaler Fallback.

## 1. Images bereitstellen

Du brauchst zwei Images in einer Registry, die dein NAS ziehen kann:

- `ghcr.io/<user-oder-org>/openclaw-wiki-backend:latest`
- `ghcr.io/<user-oder-org>/openclaw-wiki-frontend:latest`

Wenn dein GitHub-Repo die Workflow-Datei `.github/workflows/docker-publish.yml` nutzt, reicht ein Push auf `main` oder ein manueller Workflow-Run.

## 2. Stack-Datei in Portainer verwenden

Verwende als Stack-Datei den Inhalt von `docker-compose.ghcr.yml`.

Wichtig: Diese Datei ist fuer den produktiven Containerbetrieb gedacht. Sie mountet keinen Sourcecode und startet die API nicht im Watch-Modus.

## 3. Umgebungsvariablen setzen

Nutze `.env.ghcr.example` als Vorlage fuer die Portainer-Environment-Variablen.

Pflichtwerte:

- `BACKEND_IMAGE`
- `FRONTEND_IMAGE`
- `JWT_SECRET`
- `POSTGRES_PASSWORD`
- `DATABASE_URL`

Typisches Beispiel:

```env
BACKEND_IMAGE=ghcr.io/dein-user/openclaw-wiki-backend:latest
FRONTEND_IMAGE=ghcr.io/dein-user/openclaw-wiki-frontend:latest

POSTGRES_USER=wikiuser
POSTGRES_PASSWORD=<starkes-passwort>
POSTGRES_DB=flathacks_wiki
DATABASE_URL=postgresql://wikiuser:<starkes-passwort>@postgres:5432/flathacks_wiki?schema=public

JWT_SECRET=<mindestens-32-zeichen>

APP_ENV=production
APP_URL=https://wiki.deinedomain.tld/api
FRONTEND_URL=https://wiki.deinedomain.tld
CORS_ORIGIN=https://wiki.deinedomain.tld

API_PORT=3001
FRONTEND_PORT=8088
```

## 4. OIDC fuer Keycloak setzen

Wenn dein NAS-Deployment denselben zentralen Login wie lokal nutzen soll:

```env
OIDC_ENABLED=true
OIDC_PROVIDER_NAME=Zentrales Konto
OIDC_ISSUER=http://keycloak:8080/realms/flathackwiki
OIDC_PUBLIC_ISSUER=https://sso.deinedomain.tld/realms/flathackwiki
OIDC_CLIENT_ID=flathackwiki
OIDC_CLIENT_SECRET=<client-secret>
OIDC_REDIRECT_URI=https://wiki.deinedomain.tld/api/v1/auth/oidc/callback
OIDC_SCOPES=openid email profile
OIDC_TOKEN_AUTH_METHOD=client_secret_post
OIDC_DEFAULT_ROLE=VIEWER
OIDC_SUPER_ADMIN_EMAILS=admin@deinedomain.tld
```

`OIDC_ISSUER` ist die interne Container-Adresse.

`OIDC_PUBLIC_ISSUER` ist die von Browsern erreichbare URL.

## 5. Nextcloud-Kalender setzen

Fuer das neue Kalender-Widget gilt:

- Jeder Benutzer sollte sein eigenes Nextcloud-App-Passwort im Profil speichern.
- `NEXTCLOUD_APP_PASSWORD` ist nur noch ein optionaler globaler Fallback.

Typische Konfiguration:

```env
NEXTCLOUD_INTERNAL_URL=http://nextcloud
NEXTCLOUD_PUBLIC_URL=https://cloud.deinedomain.tld
NEXTCLOUD_CALENDAR_LOOKAHEAD_DAYS=14
```

Nur falls du weiterhin einen globalen Fallback willst:

```env
NEXTCLOUD_APP_PASSWORD_USER=steve
NEXTCLOUD_APP_PASSWORD=<app-passwort>
```

## 6. Portainer-Deploy

In Portainer:

1. `Stacks` oeffnen.
2. `Add stack`.
3. Stack-Namen vergeben, z. B. `openclaw-wiki`.
4. `docker-compose.ghcr.yml` einfuegen.
5. Unter `Environment variables` die Werte aus deiner `.env.ghcr.example`-Ableitung eintragen.
6. Falls GHCR privat ist, vorher unter `Registries` die GitHub-Registry anbinden.
7. `Deploy the stack`.

## 7. Nach dem ersten Start pruefen

- Frontend erreichbar
- `GET /api/health` liefert `status: ok`
- Login funktioniert
- Benutzer kann in den Profileinstellungen Nextcloud-Benutzername und App-Passwort speichern
- Kalender-Widget zeigt eigene und freigegebene Kalender und laesst Kalenderauswahl zu

## 8. Reverse Proxy Hinweis

Wenn Portainer oder dein NAS selbst einen Reverse Proxy davor setzt, dann muessen `APP_URL`, `FRONTEND_URL`, `CORS_ORIGIN` und `OIDC_REDIRECT_URI` auf die extern erreichbare URL zeigen.

Beispiel:

- Frontend extern: `https://wiki.deinedomain.tld`
- API extern ueber Nginx-Proxy im Frontend: `https://wiki.deinedomain.tld/api`

Dann sollte die API intern trotzdem weiter auf Port `3001` laufen.