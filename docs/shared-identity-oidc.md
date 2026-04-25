# Gemeinsame Benutzer fuer Wiki und Nextcloud

## Zielbild

FlatHacksWiki soll nicht direkt die Nextcloud-Datenbank lesen. Stattdessen gibt es einen zentralen Identity Provider per OpenID Connect (OIDC). Wiki und Nextcloud vertrauen diesem Provider, lokale Notfallkonten bleiben moeglich.

## Lokale Referenzarchitektur

| Komponente | Zweck | URL lokal |
| --- | --- | --- |
| Keycloak | Zentrale Benutzer, Login, OIDC Tokens | `http://localhost:8081` |
| FlatHacksWiki API | OIDC Client fuer Wiki-Login | `http://localhost:3001` |
| FlatHacksWiki UI | Login-Button und Callback-Verarbeitung | `http://localhost` |
| Nextcloud | Kalender, Kontakte, Dateien, DAV | `https://localhost:8443` |

## Umsetzung im Wiki

- Neuer Endpunkt `GET /api/v1/auth/oidc/config` liefert, ob zentrale Anmeldung aktiv ist.
- Neuer Endpunkt `GET /api/v1/auth/oidc/login` leitet zum Identity Provider weiter.
- Neuer Endpunkt `GET /api/v1/auth/oidc/callback` erstellt/verknuepft Wiki-Benutzer ueber `sub` und `email`.
- Neues Prisma-Modell `ExternalIdentity` speichert externe Identitaeten getrennt von lokalen Passwoertern.
- Neue OIDC-Benutzer bekommen automatisch die Rolle aus `OIDC_DEFAULT_ROLE`, standardmaessig `VIEWER`.
- E-Mail-Adressen in `OIDC_SUPER_ADMIN_EMAILS` bekommen beim ersten OIDC-Login automatisch `SUPER_ADMIN`.
- Die lokale Passwortanmeldung bleibt als Fallback erhalten.

## Keycloak starten

```powershell
docker compose -f docker-compose.identity.yml up -d
```

Admin-Konsole:

```text
http://localhost:8081
User: admin
Passwort: ChangeMeKeycloak1234
```

Angelegte Testbenutzer:

| Benutzer | Passwort |
| --- | --- |
| `admin` | `ChangeMeKeycloak1234` |
| `steve` | `ChangeMeSteve1234` |
| `frau` | `ChangeMeFrau1234` |

## Keycloak manuell einrichten

1. Realm `flathackwiki` anlegen.
2. Client `flathackwiki` anlegen:
   - Client authentication: `On`
   - Standard flow: `On`
   - Valid redirect URI: `http://localhost:3001/api/v1/auth/oidc/callback`
   - Web origin: `http://localhost`
3. Client Secret kopieren.
4. Die Werte aus `.env.oidc.example` in eine lokale `.env` uebernehmen und `OIDC_CLIENT_SECRET` setzen. `OIDC_ISSUER` ist fuer den API-Container, `OIDC_PUBLIC_ISSUER` fuer Browser-Redirects.
5. Wiki-Stack neu starten:

```powershell
docker compose up -d --build api frontend
docker compose exec api npx prisma db push
```

## Nextcloud anbinden

Nextcloud ist lokal mit der App `user_oidc` als OIDC-Client angebunden. Wegen Nextclouds OIDC-Sicherheitsanforderung muss der SSO-Login ueber HTTPS laufen:

```text
https://localhost:8443
```

Der lokale HTTP-Zugang `http://localhost:8080` bleibt fuer Tests erreichbar, aber OIDC wird dort von Nextcloud blockiert.

Der Keycloak-Client `nextcloud` nutzt als Callback:

```text
https://localhost:8443/apps/user_oidc/code
```

Fuer lokalen Docker-Betrieb ist `allow_local_remote_servers=true` gesetzt, damit Nextcloud den lokalen Keycloak-Provider erreichen kann.

Empfohlene Betriebsregel: Keycloak ist fuehrend fuer Benutzer und Login. Nextcloud und Wiki speichern weiterhin ihre fachlichen Daten in ihren eigenen Datenbanken.

## Offene Haertung

- Fuer produktiven Betrieb HTTPS und Reverse Proxy vor Keycloak, Wiki und Nextcloud setzen.
- Tokenuebergabe vom API-Callback zur UI spaeter auf HttpOnly-Cookies oder Backend-Session-Relay umstellen.
- Keycloak-Backup in die NAS-Backup-Strategie aufnehmen.
- Gruppen/Rollen-Mapping aus Keycloak-Gruppen ins Wiki ergaenzen, sobald die Familienrollen final feststehen.
