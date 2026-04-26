# Microsoft-Kalender nach Nextcloud importieren

Diese Anleitung ist fuer den einmaligen Umzug eines bestehenden Microsoft-Kalenders nach Nextcloud gedacht.

Ziel:

1. Den Kalender aus Microsoft als `.ics` exportieren.
2. Die Datei in Nextcloud Calendar importieren.
3. Danach neue Termine direkt in Nextcloud pflegen.

## Welche Microsoft-Variante du hast

Es gibt meistens zwei brauchbare Ausgangspunkte:

- `Outlook im Browser` beziehungsweise Microsoft 365 oder Outlook.com
- `Outlook fuer Windows` als Desktop-App

Wenn du nicht sicher bist, nimm zuerst den Weg ueber die Weboberflaeche. Falls dort kein direkter Export sichtbar ist, nutze die Desktop-App und speichere den Kalender als `.ics`.

## Variante A: Outlook im Browser exportieren

1. Outlook Kalender im Browser oeffnen.
2. In die Kalender-Einstellungen gehen.
3. Nach `Freigegebene Kalender`, `Veroeffentlichen` oder `Publish calendar` suchen.
4. Den gewuenschten Kalender auswaehlen.
5. Berechtigung auf eine Ansicht mit allen Details setzen, falls noetig.
6. Den generierten `ICS`-Link verwenden oder die `ICS`-Datei herunterladen.

Wichtig:

- Fuer einen echten Einmal-Import ist eine heruntergeladene `.ics`-Datei am saubersten.
- Ein veroeffentlichter ICS-Link ist eher fuer Abonnements gedacht, nicht fuer einen abgeschlossenen Umzug.

## Variante B: Outlook fuer Windows als ICS speichern

1. Outlook oeffnen.
2. In die Kalenderansicht wechseln.
3. Den Kalender markieren, den du migrieren willst.
4. `Datei` oeffnen.
5. `Kalender speichern` oder `Save Calendar` waehlen.
6. Als Format `.ics` speichern.
7. Die Datei an einem leicht auffindbaren Ort ablegen.

Wenn mehrere Kalender existieren, wiederhole das pro Kalender einzeln. Das ist sauberer als spaeter alles in Nextcloud wieder auseinanderzuziehen.

## In Nextcloud importieren

1. Nextcloud oeffnen.
2. In die Kalender-App wechseln.
3. Links in der Kalenderliste das Menu fuer den Zielkalender oeffnen oder einen neuen Kalender anlegen.
4. `Importieren` waehlen.
5. Die exportierte `.ics`-Datei auswaehlen.
6. Den Zielkalender bestaetigen.

Empfehlung:

- Fuer den ersten Import einen neuen Kalender wie `Microsoft Import 2026-04-26` anlegen.
- Danach kurz pruefen, ob Uhrzeiten, Serientermine und Ganztagstermine korrekt angekommen sind.
- Wenn alles passt, kannst du Termine spaeter in deinen eigentlichen Kalender verschieben oder den Import-Kalender umbenennen.

## Nachkontrolle

Nach dem Import solltest du direkt pruefen:

1. Stimmen Zeitzonen und Uhrzeiten.
2. Sind Serientermine vorhanden.
3. Sind Ganztagstermine korrekt.
4. Sind Erinnerungen noch sinnvoll oder muessen sie neu gesetzt werden.
5. Wurden Einladungen oder Anhange eventuell nicht mit uebernommen.

## Wichtige Einschraenkungen

- `.ics` ist gut fuer Termine, aber nicht jeder Microsoft-spezifische Zusatz kommt perfekt mit.
- Manche Erinnerungen, Kategorien, Besprechungslinks oder proprietaeren Outlook-Felder koennen vereinfacht oder verloren gehen.
- Kontakte sind nicht Teil des Kalender-Exports. Dafuer brauchst du getrennt einen Kontakt-Export, typischerweise als `.csv` oder `.vcf`.

## Empfohlener sicherer Ablauf

1. Den Microsoft-Kalender zuerst als `.ics` lokal sichern.
2. In Nextcloud einen neuen Test-Kalender anlegen.
3. Import in diesen Test-Kalender ausfuehren.
4. Termine stichprobenartig pruefen.
5. Erst danach den Kalender produktiv verwenden.

## Fuer deinen Stack

In deinem Setup erreichst du Nextcloud aktuell ueber die Kalender-und-Kontakte-Seite im Wiki oder direkt ueber die Nextcloud-URL auf dem NAS. Fuer mobile Geraete solltest du nach dem Import anschliessend nur noch Nextcloud per CalDAV weiterverwenden, nicht weiter parallel Microsoft und Nextcloud pflegen.