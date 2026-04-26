# Kalender und Kontakte in FlathackWiki

## Zielbild

FlathackWiki bleibt das persoenliche Portal und Dashboard. Kalender- und Kontaktdaten werden in einer eigenen self-hosted Groupware-Komponente gespeichert, die offene Standards fuer mobile Synchronisation bereitstellt. Die zentrale Datenquelle ist die lokale Docker-Umgebung, nicht Apple, Google oder Microsoft.

## Annahmen

- FlathackWiki laeuft lokal in Docker Compose.
- Der bestehende Wiki-Stack bleibt stabil und wird nicht direkt mit Groupware-Daten vermischt.
- Mindestens zwei Benutzer sollen getrennte Datenbestaende haben.
- iPhone/iPad sollen per CalDAV/CardDAV angebunden werden.
- Android soll per DAVx5 angebunden werden.
- Nextcloud wird zunaechst lokal unter `http://localhost:8080` gestartet.
- Fuer produktiven mobilen Zugriff braucht die Installation spaeter HTTPS, Reverse Proxy und echte Secrets.

## Muss-Features

- Kalender und Kontakte als Weboberflaeche.
- CalDAV fuer Kalender.
- CardDAV fuer Kontakte.
- Multiuser-Betrieb.
- Getrennte private Kalender und Adressbuecher.
- Gemeinsame Familienkalender und Familienkontakte.
- Import und Export von `.ics` und `.vcf`.
- App-Passwoerter fuer Smartphone-/Tablet-Sync.
- Backup aller relevanten Daten auf NAS.
- Restore-Prozess mit Test.
- FlathackWiki-Seite `Kalender und Kontakte`.
- Dashboard-Schnellzugriff auf Kalender und Kontakte.

Fuer einen konkreten Umzug von Microsoft/Outlook nach Nextcloud siehe `docs/microsoft-calendar-to-nextcloud.md`.

## Sinnvolle Zusatzfeatures

- Geburtstagskalender aus Kontakten.
- Freigaben mit Lese-/Schreibrechten.
- Kalenderabonnements fuer externe ICS-Feeds.
- Dashboard-Widget fuer naechste Termine.
- Dashboard-Widget fuer Geburtstage.
- Healthchecks und Monitoring.
- Update-Dokumentation.
- SSO/OIDC zwischen FlathackWiki und Nextcloud.

## Zielarchitektur

```text
Browser / Smartphone / Tablet
        |
        | HTTPS spaeter via Caddy/Traefik
        |
+-------------------+       +------------------------+
| FlathackWiki      |       | Nextcloud Groupware    |
| Dashboard / Wiki  |       | Calendar + Contacts    |
+---------+---------+       +-----------+------------+
          |                             |
          | Links / spaeter Widgets     | CalDAV/CardDAV
          |                             |
+---------v---------+       +-----------v------------+
| FlathackWiki DB   |       | Nextcloud PostgreSQL   |
+-------------------+       +------------------------+
                                      |
                              +-------v--------+
                              | Redis + Cron   |
                              +----------------+
                                      |
                              NAS Backup / Restic
```

## Empfohlene Variante

Nextcloud wird als eigenstaendige Groupware neben FlathackWiki betrieben. FlathackWiki integriert Nextcloud als Portalbereich, nicht als selbstgebauten DAV-Server.

Begruendung:

- CalDAV/CardDAV korrekt und mobil kompatibel umzusetzen ist aufwendig.
- Nextcloud bietet Weboberflaeche, Multiuser, Freigaben, Kalender, Kontakte und Imports bereits ausgereift.
- FlathackWiki kann sich auf Dashboard, Wiki und Integration konzentrieren.
- Die Daten bleiben exportierbar und nutzen offene Standards.

## Umsetzungsvarianten

| Variante | Vorteile | Nachteile | Bewertung |
|---|---|---|---|
| Nextcloud Groupware | Vollstaendige Web UI, CalDAV/CardDAV, Multiuser, Freigaben, Imports | Groesserer Stack, Updatepflege noetig | Empfohlen |
| Baikal + eigene UI | Schlank, DAV-fokussiert | Eigene Web UI und Sharing fehlen weitgehend | Zweite Wahl |
| Radicale + eigene UI | Sehr leichtgewichtig, gut fuer einfache DAV-Dienste | Komfort und Weboberflaeche schwach | Spezialfall |
| Eigener DAV-Server in FlathackWiki | Maximale Integration | Hoher Aufwand, hohes Sync-Risiko | Nicht empfohlen |

## Benutzer- und Rechtekonzept

- Nextcloud-Benutzer:
  - `steve`
  - `frau`
  - optional separater `admin`
- Gruppe:
  - `family`
- Kalender:
  - `Privat Steve`
  - `Privat Frau`
  - `Familie`
- Adressbuecher:
  - `Kontakte Steve`
  - `Kontakte Frau`
  - `Familienkontakte`
- Rechte:
  - Private Kalender/Adressbuecher nur Besitzer.
  - Familienkalender fuer beide Benutzer schreibbar.
  - Familienkontakte fuer beide Benutzer schreibbar.
- Geraete:
  - Je Geraet ein eigenes App-Passwort.
  - App-Passwort bei Verlust sofort widerrufen.

## Backup und Restore

Zu sichern:

- `nextcloud_data`
- `nextcloud_config`
- `nextcloud_apps`
- `nextcloud_db`
- Compose-Dateien und `.env`
- FlathackWiki DB und Uploads

Empfehlung:

- Restic oder BorgBackup auf NAS.
- Taeglich inkrementell.
- Woechentlich Prune/Check.
- Monatlicher Restore-Test.
- DB-Dump vor Dateisicherung oder konsistente Volume-Snapshots.
- Secrets verschluesselt ablegen.

## Migration

Apple/iCloud:

- Kalender als `.ics` exportieren.
- Kontakte als `.vcf` exportieren.
- In Nextcloud importieren.
- Danach iCloud nicht mehr als Standardziel fuer neue Kontakte/Termine nutzen.

Google:

- Kalender und Kontakte per Google Takeout exportieren.
- Kalender `.ics`, Kontakte `.vcf`.
- Import nach Nextcloud.

Microsoft/Outlook:

- Kalender `.ics`.
- Kontakte bevorzugt `.vcf`, notfalls CSV mit Nachbearbeitung.

## Mobile Synchronisation

iPhone/iPad:

- CalDAV/CardDAV nativ in iOS einrichten.
- Produktiv nur mit HTTPS.
- Serverpfad spaeter:
  - `https://cloud.example.tld/remote.php/dav/principals/users/<username>/`
- Standardaccount fuer neue Kalendertermine und Kontakte auf Nextcloud setzen.

Android:

- DAVx5 installieren.
- Nextcloud-Konto verbinden.
- Kalender und Kontakte fuer Android-Systemdaten aktivieren.
- Kalender-/Kontakte-App nutzt danach lokale Android-Daten aus DAVx5.

## Roadmap

| Phase | Ziel | Ergebnis |
|---|---|---|
| 1 | Nextcloud lokal starten | Web UI unter `localhost:8080` |
| 2 | Benutzer und Groupware konfigurieren | Kalender/Kontakte pro Benutzer |
| 3 | FlathackWiki integrieren | Seite `Kalender und Kontakte` |
| 4 | Mobile Sync testen | iOS/Android bidirektional |
| 5 | Migration | Apple/Google/Microsoft-Daten importiert |
| 6 | Backup | NAS-Backup plus Restore-Test |
| 7 | Reverse Proxy/TLS | produktiver Zugriff |
| 8 | Dashboard-Widgets | naechste Termine/Geburtstage |

## Akzeptanzkriterien

- Nextcloud startet per Compose.
- Kalender-App ist in Nextcloud nutzbar.
- Kontakte-App ist in Nextcloud nutzbar.
- Zwei Benutzer koennen getrennt arbeiten.
- Gemeinsamer Kalender ist fuer beide Benutzer schreibbar.
- Gemeinsames Adressbuch ist fuer beide Benutzer schreibbar.
- iPhone erstellt Termin in Nextcloud-Kalender.
- Web UI erstellt Termin, iPhone empfaengt ihn.
- Android erstellt Kontakt via DAVx5, Web UI zeigt ihn.
- `.ics` und `.vcf` Import funktionieren.
- Backup auf NAS laeuft automatisch.
- Restore wurde testweise dokumentiert.
- FlathackWiki hat einen Bereich `Kalender und Kontakte`.

## Priorisierte Umsetzung

| Prio | Aufgabe | Status |
|---:|---|---|
| 1 | Nextcloud Compose-Datei anlegen | gestartet |
| 2 | Beispiel-Env fuer Nextcloud anlegen | gestartet |
| 3 | Nextcloud lokal starten | erledigt |
| 4 | FlathackWiki-Seite anlegen | erledigt |
| 5 | Benutzer in Nextcloud anlegen | Grundstruktur erledigt |
| 6 | Kalender/Kontakte Apps pruefen/aktivieren | erledigt |
| 7 | iOS/Android Test-Sync | offen |
| 8 | NAS-Backup definieren | offen |
| 9 | Reverse Proxy/TLS planen | offen |
| 10 | Dashboard-Widget fuer Termine bauen | offen |

## Risiken

- Ohne HTTPS ist produktiver iOS-Sync nicht belastbar.
- Falsch gesetzte Standardaccounts erzeugen wieder Daten in iCloud/Google.
- Backups ohne DB-Konsistenz koennen unbrauchbar sein.
- Nextcloud braucht regelmaessige Updates.
- DAV hinter Reverse Proxy braucht korrekte `.well-known` Weiterleitungen.
- Kontakt-Dubletten nach Migration sind wahrscheinlich.

## Naechste 10 Schritte

1. `.env.nextcloud.example` in `.env.nextcloud` kopieren und Secrets aendern.
2. `docker compose --env-file .env.nextcloud -f docker-compose.nextcloud.yml up -d` starten.
3. Nextcloud unter `http://localhost:8080` oeffnen.
4. Admin-Login pruefen.
5. Apps `Calendar` und `Contacts` aktivieren.
6. Benutzer `steve` und `frau` anlegen.
7. Gruppe `family` anlegen.
8. Familienkalender und Familienadressbuch anlegen und teilen.
9. Testimport mit kleiner `.ics` und `.vcf` Datei machen.
10. iPhone/Android Test-Sync einrichten.

## Lokales Backup-Skript

Ein erstes Backup-Skript liegt unter:

```powershell
.\scripts\backup-nextcloud.ps1 -BackupRoot "D:\Backups\flathackwiki-nextcloud"
```

Das Skript erstellt:

- PostgreSQL Dump der Nextcloud-Datenbank
- Archiv von `nextcloud_data`
- Archiv von `nextcloud_config`
- Archiv von `nextcloud_apps`
- Kopie der Compose-/Env-Vorlagen

Fuer echte NAS-Nutzung sollte `-BackupRoot` auf ein eingebundenes NAS-Verzeichnis zeigen. Danach muss ein Restore-Test in einem separaten Verzeichnis erfolgen.
