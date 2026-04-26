# NAS Remote Management

Das NAS ist per SSH erreichbar, und Synology nutzt Docker an nicht standardmaessigen Pfaden.

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
- Docker-Binary auf dem NAS: `/Volume1/@apps/DockerEngine/dockerd/bin/docker`
- Docker Compose auf dem NAS: `/Volume1/@apps/DockerEngine/dockerd/bin/docker-compose`

Der native Docker-Context ist bereits angelegt, aber die Synology-SSH-Konfiguration nimmt den lokalen Key noch nicht an. Der Python-Wrapper ist deshalb aktuell der robuste Weg fuer die direkte Verwaltung.
