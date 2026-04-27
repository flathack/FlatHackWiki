# NAS Update aus dem Git-Repository

Diese Anleitung beschreibt den echten Update-Weg fuer dein aktuelles NAS-Setup.

Stand heute:

- Der produktive NAS-Stack laeuft ueber Portainer.
- Portainer verwendet den Compose-Ordner `/Volume1/@apps/Portainer/compose/21`.
- Das Frontend nutzt `ghcr.io/flathack/openclaw-wiki-frontend:latest`.
- Das Backend nutzt `ghcr.io/flathack/openclaw-wiki-backend:latest`.
- Die Stack-Variablen liegen in `/Volume1/@apps/Portainer/compose/21/stack.env`.

## Zielbild

Der saubere Update-Weg ist:

1. Code im Git-Repository aendern.
2. Commit und Push ins Remote-Repository.
3. Neue GHCR-Images fuer Frontend und Backend bauen und veroeffentlichen.
4. Den Portainer-Stack auf dem NAS mit den neuen Images neu deployen.

Das ist der dauerhafte Weg. Ein direktes `docker cp` in laufende Container ist nur ein Notfall-Hotfix und ersetzt keinen echten Image-Rollout.

## 1. Lokal aendern und testen

Typischer Ablauf lokal:

```powershell
git status
git add .
git commit -m "Fix Nextcloud links on NAS"
git push
```

Vor dem Push sollte der relevante Teil lokal gebaut oder getestet werden.

Fuer das Frontend zum Beispiel:

```powershell
Set-Location frontend
npm run build
```

## 2. GHCR Images aktualisieren

Dein NAS zieht aktuell GHCR-Images. Deshalb muss nach einem Git-Push ein neues Image in GHCR landen.

Es gibt zwei uebliche Varianten:

- GitHub Actions baut und pusht automatisch bei Push auf `main`.
- Du baust und pushst die Images manuell.

Manueller Ablauf:

```powershell
docker build -t ghcr.io/flathack/openclaw-wiki-backend:latest .\backend
docker build -t ghcr.io/flathack/openclaw-wiki-frontend:latest .\frontend
docker push ghcr.io/flathack/openclaw-wiki-backend:latest
docker push ghcr.io/flathack/openclaw-wiki-frontend:latest
```

Optional sauberer als `latest` sind zusaetzliche versionierte Tags, zum Beispiel mit dem Commit-Hash:

```powershell
git rev-parse --short HEAD
```

Zum Beispiel `5048129`.

Dann koennen Images auch so getaggt werden:

```powershell
docker tag ghcr.io/flathack/openclaw-wiki-frontend:latest ghcr.io/flathack/openclaw-wiki-frontend:5048129
docker tag ghcr.io/flathack/openclaw-wiki-backend:latest ghcr.io/flathack/openclaw-wiki-backend:5048129
docker push ghcr.io/flathack/openclaw-wiki-frontend:5048129
docker push ghcr.io/flathack/openclaw-wiki-backend:5048129
```

## 3. NAS Stack aktualisieren

Dein NAS-Stack wird von Portainer verwaltet. Relevant sind dort:

- Compose-Datei: `/Volume1/@apps/Portainer/compose/21/docker-compose.yml`
- Env-Datei: `/Volume1/@apps/Portainer/compose/21/stack.env`

Die aktuell wichtigen Werte dort sind:

```env
BACKEND_IMAGE=ghcr.io/flathack/openclaw-wiki-backend:latest
FRONTEND_IMAGE=ghcr.io/flathack/openclaw-wiki-frontend:latest
APP_URL=https://alpha-nas.tail2b5c2.ts.net:3002
FRONTEND_URL=https://alpha-nas.tail2b5c2.ts.net:3002
CORS_ORIGIN=https://alpha-nas.tail2b5c2.ts.net:3002
NEXTCLOUD_INTERNAL_URL=http://nextcloud
NEXTCLOUD_PUBLIC_URL=https://alpha-nas.tail2b5c2.ts.net:8443
OIDC_PUBLIC_ISSUER=https://alpha-nas.tail2b5c2.ts.net:8081/realms/flathackwiki
OIDC_REDIRECT_URI=https://alpha-nas.tail2b5c2.ts.net:3002/api/v1/auth/oidc/callback
```

Wenn du bei `latest` bleibst, reicht in Portainer normalerweise ein Redeploy mit Pull der neuesten Images.

Wenn du versionierte Tags nutzt, aendere in `stack.env` gezielt diese beiden Werte:

```env
BACKEND_IMAGE=ghcr.io/flathack/openclaw-wiki-backend:5048129
FRONTEND_IMAGE=ghcr.io/flathack/openclaw-wiki-frontend:5048129
```

Danach den Stack in Portainer neu deployen.

## 4. Update direkt per NAS-CLI ausloesen

Wenn du nicht ueber die Portainer-Oberflaeche gehen willst, kannst du mit dem vorhandenen Hilfsskript direkt auf dem NAS arbeiten.

Containerstatus pruefen:

```powershell
c:/Users/steve/Github/FL-Lingo/.venv/Scripts/python.exe scripts/nas-docker.py docker ps
```

Einzelne Images neu ziehen:

```powershell
c:/Users/steve/Github/FL-Lingo/.venv/Scripts/python.exe scripts/nas-docker.py docker pull ghcr.io/flathack/openclaw-wiki-frontend:latest
c:/Users/steve/Github/FL-Lingo/.venv/Scripts/python.exe scripts/nas-docker.py docker pull ghcr.io/flathack/openclaw-wiki-backend:latest
```

Danach den Portainer-Compose-Ordner direkt neu starten:

```powershell
c:/Users/steve/Github/FL-Lingo/.venv/Scripts/python.exe scripts/nas-docker.py shell "cd /Volume1/@apps/Portainer/compose/21 && /Volume1/@apps/DockerEngine/dockerd/bin/docker-compose --env-file stack.env up -d"
```

Wichtig: Der NAS-Stack braucht `stack.env` auch bei normalen Redeploys. Ohne `--env-file stack.env` greifen Compose-Defaults wie `localhost`, wodurch Login-Redirects und CORS falsch werden koennen.

Falls du zusaetzlich eine lokale `.env` im Compose-Ordner synchronisieren willst:

```powershell
c:/Users/steve/Github/FL-Lingo/.venv/Scripts/python.exe scripts/nas-docker.py shell "cd /Volume1/@apps/Portainer/compose/21 && cp stack.env .env"
```

## 5. Verifikation nach dem Update

Nach dem Redeploy solltest du mindestens pruefen:

1. Wiki-Frontend oeffnet korrekt.
2. OIDC-Login erscheint.
3. Nextcloud-Links im Bereich Kalender/Kontakte zeigen nicht mehr auf `localhost`.
4. API und Frontend laufen beide im NAS-Stack.

Beispiel fuer schnellen Container-Check:

```powershell
c:/Users/steve/Github/FL-Lingo/.venv/Scripts/python.exe scripts/nas-docker.py docker ps --format "table {{.Names}}\t{{.Image}}\t{{.Status}}"
```

## 6. Notfall-Hotfix

Wenn GHCR oder Portainer gerade nicht sofort aktualisiert werden koennen, kannst du als temporaeren Hotfix das neue Frontend-Bundle in den laufenden Container kopieren.

Das wurde fuer den aktuellen Nextcloud-Link-Fix bereits gemacht.

Wichtig:

- Das ist nicht persistent gegen einen kompletten Container-Recreate oder Portainer-Redeploy.
- Danach muss trotzdem ein sauberer GHCR-/Portainer-Update folgen.

## Empfehlung

Fuer kuenftige Updates ist der stabilste Ablauf:

1. Aenderung committen und pushen.
2. GHCR-Images automatisch oder manuell bauen und pushen.
3. In Portainer redeployen oder die Image-Tags in `stack.env` auf einen Commit-Tag umstellen.
4. Danach kurz Frontend, API und Nextcloud-Links pruefen.