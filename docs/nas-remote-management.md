# NAS Remote Management

Das NAS ist per SSH erreichbar. Die Werte in `.env.nas.example` sind jetzt auf einen normalen Docker-CLI-Aufruf ausgelegt, wie er auf einem TerraMaster- oder allgemeinen Linux-NAS ueblich ist.

## Lokale Einrichtung

1. `.env.nas.example` nach `.env.nas` uebernehmen.
2. Die echten Werte in `.env.nas` setzen.
3. Danach lassen sich Docker-Befehle direkt auf dem NAS ausfuehren.

## Beispiele

Container auf dem NAS anzeigen:

```powershell
python scripts/nas-docker.py docker ps
```

Images auf dem NAS anzeigen:

```powershell
python scripts/nas-docker.py docker images
```

Compose auf dem NAS ausfuehren:

```powershell
python scripts/nas-docker.py compose ps
```

Beliebigen Shell-Befehl auf dem NAS ausfuehren:

```powershell
python scripts/nas-docker.py shell "uname -a"
```

## Technische Details

- SSH-Ziel: `NAS_HOST` und `NAS_USER`
- Authentifizierung: Passwort ueber `NAS_PASSWORD`
- Docker-Binary auf dem NAS: standardmaessig `docker`
- Docker Compose auf dem NAS: standardmaessig `docker compose`

Wenn dein TerraMaster abweichende Pfade oder ein eigenes Compose-Binary nutzt, kannst du `NAS_DOCKER_BIN` und `NAS_DOCKER_COMPOSE_BIN` entsprechend anpassen.
