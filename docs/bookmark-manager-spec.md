# FlatHackWiki Bookmark-Manager - Produkt- und Funktionsspezifikation

## Annahmen

- FlatHackWiki besitzt bereits Authentifizierung, Dashboard, Benutzerprofile und eine PostgreSQL-Datenbank.
- Das vorhandene Lesezeichen-Widget bleibt als Schnellzugriff erhalten, wird aber durch ein eigenes Modul ergaenzt.
- Lesezeichen sind standardmaessig privat pro Benutzer. Gemeinsame Sammlungen sind ein spaeterer Ausbauschritt.
- Der Bookmark-Manager soll lokal/self-hosted funktionieren und keine externen Cloud-Dienste als Pflicht voraussetzen.

## Zielbild

Der Bookmark-Manager wird eine eigenstaendige Anwendung innerhalb von FlatHackWiki. Nutzer koennen Links schnell erfassen, grosse Sammlungen effizient durchsuchen, strukturieren, bereinigen, importieren und exportieren. Die UI soll im Alltag schnell sein, aber fuer Power-User genug Verwaltungstiefe bieten.

## 1. Erweiterte Feature-Wunschliste

| Bereich | Feature | Nutzen |
| --- | --- | --- |
| Erfassung | Quick Add per URL | Schnelles Speichern ohne Formularballast |
| Erfassung | Automatischer Titel, Beschreibung, Domain, Favicon | Weniger manuelle Pflege |
| Erfassung | Vollstaendiger Editor | Titel, URL, Beschreibung, Notizen, Ordner, Tags, Favorit, Archiv |
| Organisation | Ordnerbaum | Vertraut aus Browsern und gut fuer grobe Struktur |
| Organisation | Tags | Flexible Querstruktur fuer Themen und Projekte |
| Organisation | Collections | Projekt- oder Recherchelisten ohne harte Ordnerbindung |
| Organisation | Smart Lists | Automatisch: Favoriten, Angepinnt, Archiv, Defekte Links, Ohne Tags |
| Suche | Volltextsuche | Finden ueber Titel, URL, Domain, Beschreibung, Notizen, Tags |
| Suche | Filter | Eingrenzen nach Ordner, Tag, Domain, Status, Favorit, Archiv |
| Verwaltung | Bulk-Aktionen | Viele Eintraege schnell verschieben, taggen, archivieren oder loeschen |
| Qualitaet | Dublettenerkennung | Ordnung bei Importen und schnellem Speichern |
| Qualitaet | Linkpruefung | Tote Links und Redirects sichtbar machen |
| Darstellung | Kompaktliste | Schnellste Ansicht fuer viele Links |
| Darstellung | Kartenansicht | Visuellere Projekt- und Rechercheansicht |
| Darstellung | Tabellenansicht | Power-User-Ansicht fuer Sortierung und Massenpflege |
| Migration | HTML/JSON/CSV Import und Export | Browsermigration, Backup und Analyse |
| Betrieb | Hintergrundjobs | Metadaten und Linkpruefung duerfen die UI nicht blockieren |
| Performance | Pagination/Virtualisierung | Tausende Bookmarks bleiben bedienbar |
| Sicherheit | Nutzertrennung | Private Daten pro Konto |
| Komfort | Tastaturshortcuts | Schnelles Arbeiten fuer Power-User |

## 2. Muss-, Soll- und Kann-Features

| Klasse | Features |
| --- | --- |
| Muss | Eigene Modul-Seite, CRUD, Ordner, Tags, Suche, Filter, Favoriten, Archiv, Quick Add, responsive Listenansicht, HTML-Import, JSON/CSV-Export, Nutzertrennung |
| Soll | Detailpanel, Bulk-Aktionen, Dublettenerkennung, automatische Metadaten, Favicon, Tabellenansicht, Kartenansicht, Smart Lists, gespeicherte Filter |
| Kann | Screenshots, Browser-Extension, geteilte Collections, oeffentliche Freigabelinks, KI-Zusammenfassung, Verlauf/Audit pro Bookmark |

## 3. Informationsarchitektur

| Bereich | Aufgabe |
| --- | --- |
| `/bookmarks` | Hauptmodul mit Suche, Filtern, Ansichten und Verwaltung |
| Hauptnavigation | Eintrag "Lesezeichen" neben Dashboard und Kalender |
| Linke Spalte | Smart Lists, Ordner, Tags, Collections |
| Kopfbereich | Suche, Quick Add, Ansicht, Filter, Import/Export |
| Inhaltsbereich | Liste, Karten oder Tabelle |
| Rechte Spalte | Detailpanel und Editor |
| Einstellungen | Metadaten, Importregeln, Linkpruefung, Standardansicht |

## 4. UI/UX-Konzept

### Hauptansicht

- Oben steht eine breite Suchleiste mit sofortiger Filterung.
- Rechts daneben liegen Quick Add, Ansichtsauswahl und Import/Export.
- Links befinden sich Smart Lists, Ordner und Tags.
- Die Mitte zeigt die gefilterten Bookmarks.
- Rechts zeigt ein Detailpanel den aktiven Bookmark oder den Editor.

### Detailansicht

- Favicon, Titel, URL, Domain, Status, Tags und Notizen.
- Aktionen: Oeffnen, Favorit, Archivieren, Bearbeiten, Loeschen.
- Linkstatus und letzte Pruefung werden sichtbar, sobald die Linkpruefung umgesetzt ist.

### Erstellen/Bearbeiten

- Quick Add braucht nur eine URL und ermittelt sinnvolle Defaults.
- Erweiterter Editor erlaubt Titel, URL, Beschreibung, Notizen, Ordner, Tags, Favorit, Toolbar, Archiv.
- Bei doppelter normalisierter URL wird gewarnt.

### Suche und Filter

- Suche durchsucht Titel, URL, Domain, Beschreibung, Notizen und Tags.
- Filterchips zeigen aktive Filter.
- Smart Lists reduzieren Klickwege fuer Favoriten, Archiv, Defekte Links und unorganisierte Links.

### Bulk-Verwaltung

- Multi-Select per Checkbox.
- Bei Auswahl erscheint eine Aktionsleiste.
- Aktionen: Favorisieren, Archivieren, Tags setzen, Ordner verschieben, Loeschen, Export.

## 5. Ansichten

| Ansicht | Zweck | Startphase |
| --- | --- | --- |
| Kompaktliste | Alltag und grosse Mengen | MVP |
| Kartenansicht | Visuelle Recherche | Soll |
| Tabellenansicht | Sortieren und Massenpflege | Soll |
| Ordneransicht | Klassische Struktur | MVP |
| Archiv | Ausblenden statt loeschen | MVP |
| Dubletten | Bereinigung nach Importen | Soll |
| Defekte Links | Wartung | Soll |

## 6. Interaktionen

| Interaktion | Empfehlung |
| --- | --- |
| Quick Add | URL einfuegen, Enter speichert |
| Multi-Select | Checkboxen, spaeter Shift-Klick |
| Drag-and-Drop | Spaeter fuer Ordner und Collections |
| Shortcuts | `/` Suche, `n` neu, `e` bearbeiten, `f` Favorit, `a` Archiv |
| Kontextaktionen | Drei-Punkte-Menue fuer seltene Aktionen |
| Undo | Rueckgaengig nach Loeschen/Archivieren als spaeterer Komfort |

## 7. Metadatenmodell

| Feld | Beschreibung |
| --- | --- |
| `id` | UUID |
| `userId` | Besitzer |
| `parentId` | Ordnerzuordnung |
| `itemType` | BOOKMARK oder FOLDER |
| `title` | Anzeigename |
| `url` | Zieladresse |
| `normalizedUrl` | Normalisierte URL fuer Dubletten |
| `domain` | Hostname fuer Filter |
| `description` | Kurzbeschreibung |
| `notes` | Eigene Notizen |
| `tags` | Flexible Schlagworte |
| `category` | Bestehendes Kompatibilitaetsfeld |
| `faviconUrl` | Icon |
| `isFavorite` | Favorit |
| `isPinned` | Angepinnt |
| `isArchived` | Archiviert |
| `showInToolbar` | In Dashboard-Leiste sichtbar |
| `linkStatus` | UNKNOWN, OK, BROKEN, REDIRECTED |
| `httpStatus` | Letzter HTTP-Status |
| `lastCheckedAt` | Letzte Linkpruefung |
| `lastOpenedAt` | Letzter Aufruf |

## 8. Organisationsmechanismen

- Ordner fuer eine stabile Hauptstruktur.
- Tags fuer thematische Ueberschneidungen.
- Collections fuer Projekt- und Recherchesammlungen.
- Smart Lists fuer automatische Wartungsansichten.
- Domains als automatische Gruppierung.
- Archiv statt hartem Loeschen fuer Alltagssicherheit.

## 9. Import/Export und Migration

- HTML-Import im Netscape-Bookmark-Format fuer Browser.
- JSON-Export als vollstaendiges FlatHackWiki-Format.
- CSV-Export fuer Analyse und Tabellenprogramme.
- Importvorschau mit Anzahl neuer, doppelter und fehlerhafter Eintraege.
- Dublettenstrategie: ueberspringen, markieren oder zusammenfuehren.
- Importjob spaeter rueckgaengig machen.

## 10. Performance

- Serverseitige Filter und Pagination fuer grosse Datenmengen.
- Datenbankindizes auf `userId`, `parentId`, `domain`, `isArchived`, `isFavorite`, `normalizedUrl`.
- Frontend-Virtualisierung fuer Tabellen/Listendarstellung.
- Metadatenabruf und Linkpruefung als Hintergrundjobs.
- Favicons und Previews cachen.

## 11. Barrierefreiheit und Responsive Design

- Alle Hauptaktionen sind per Tastatur erreichbar.
- Sichtbare Fokuszustaende.
- Keine Aktion ist nur per Hover erreichbar.
- Mobile Filter als Drawer/Bottom Sheet.
- Detailpanel wird mobil zur eigenen Ansicht.
- Touch-Ziele mindestens 40 px.
- Kontrast im hellen und dunklen Theme beachten.

## 12. Risiken und Stolpersteine

| Risiko | Gegenmassnahme |
| --- | --- |
| UI wird ueberladen | Progressive Disclosure: einfache Liste zuerst, Details im Panel |
| Zu viele Organisationsmodelle verwirren | Ordner, Tags und Collections klar trennen |
| Imports erzeugen Chaos | Vorschau, Dublettencheck, Rollback |
| Linkpruefung ist langsam | Hintergrundjobs und Statusanzeige |
| Screenshots kosten Speicher | Optional und spaeter |
| Grosse Listen werden traege | Pagination, Indizes, Virtualisierung |

## 13. Roadmap

| Phase | Ergebnis | Inhalte |
| --- | --- | --- |
| MVP 1 | Eigenes Modul | Route, Navigation, Suche, Liste, Editor, Ordner, Tags, Favorit, Archiv |
| MVP 2 | Verwaltung | Bulk-Aktionen, Import/Export, Dublettenerkennung |
| Ausbau 1 | Qualitaet | Metadatenabruf, Favicons, Linkstatus, defekte Links |
| Ausbau 2 | Power-User | Tabellenansicht, Kartenansicht, gespeicherte Filter, Shortcuts |
| Ausbau 3 | Teilen | Collections, Freigaben, Familien-/Teamlisten |
| Ausbau 4 | Komfort | Browser-Extension, Screenshots, KI-Zusammenfassung |

## 14. Akzeptanzkriterien

- Es gibt eine eigene Seite `/bookmarks`.
- Die Hauptnavigation enthaelt "Lesezeichen".
- Nutzer sehen nur eigene Bookmarks.
- Nutzer koennen Bookmarks und Ordner erstellen, bearbeiten, archivieren und loeschen.
- Suche findet Titel, URL, Beschreibung, Notizen und Tags.
- Filter fuer Favoriten, Archiv, Ordner und Tags funktionieren.
- Favoriten und Archiv werden als Smart Lists angeboten.
- HTML-Import und HTML-Export bleiben nutzbar.
- Die UI ist auf Desktop und Mobile bedienbar.
- Mindestens 1.000 Bookmarks bleiben in der Listenansicht sinnvoll bedienbar.

## Finale konsolidierte Featureliste

- Eigenes Bookmark-Modul
- Dashboard-Schnellzugriff bleibt erhalten
- CRUD fuer Links und Ordner
- Titel, URL, Beschreibung, Notizen, Tags, Domain, Favicon
- Favoriten, Pins, Archiv
- Suche, Filter, Sortierung, Smart Lists
- Kompaktliste, spaeter Karten und Tabelle
- Detailpanel und Editor
- Quick Add
- Bulk-Aktionen
- Dublettenerkennung
- Linkpruefung
- Import/Export HTML, JSON, CSV
- Nutzertrennung
- Spaeter geteilte Collections

## Empfohlene UI-Struktur

1. AppHeader mit Modulnavigation.
2. Bookmark-Hero mit Suche und Quick Add.
3. Linke Sidebar fuer Smart Lists, Ordner und Tags.
4. Zentrale Ergebnisliste.
5. Rechtes Detail-/Editorpanel.
6. Kontextuelle Bulk-Leiste bei Auswahl.

## Naechste Umsetzungsschritte

1. Spezifikation versionieren.
2. Datenmodell um Archiv, Pins, Tags, Notizen, Domain und Linkstatus erweitern.
3. API-DTOs fuer neue Felder erweitern.
4. Bestehende Bookmark-Services kompatibel erweitern.
5. Route `/bookmarks` im Frontend anlegen.
6. Navigation um "Lesezeichen" erweitern.
7. Hauptseite mit Suche, Sidebar, Liste und Detailpanel bauen.
8. Editor fuer Bookmarks/Ordner bauen.
9. Archiv/Favorit/Toolbar als Quick Actions integrieren.
10. Build, Prisma Sync und Docker-Test lokal ausfuehren.
