export const PAGE_TEMPLATES = [
  {
    id: 'blank',
    name: 'Leere Seite',
    description: 'Mit einer leeren Seite beginnen',
    icon: '📄',
    content: '',
  },
  {
    id: 'documentation',
    name: 'Dokumentation',
    description: 'Technische Dokumentationsseite',
    icon: '📝',
    content: `# Seitentitel

## Überblick
Kurze Beschreibung dieses Themas.

## Details
Füge hier deine ausführlichen Inhalte ein.

## Verwandt
- [Link 1](#)
- [Link 2](#)

## Siehe auch
- [Verwandte Seite](#)
`,
  },
  {
    id: 'meeting-notes',
    name: 'Besprechungsnotizen',
    description: 'Besprechungen und Ergebnisse festhalten',
    icon: '📋',
    content: `# Besprechungsnotizen - [Datum]

## Teilnehmer
- Person 1
- Person 2

## Tagesordnung
1. Thema 1
2. Thema 2

## Besprechung
### Thema 1
Notizen...

### Thema 2
Notizen...

## Aufgaben
- [ ] Aufgabe 1 - @person
- [ ] Aufgabe 2 - @person
`,
  },
  {
    id: 'how-to',
    name: 'Anleitung',
    description: 'Schritt-für-Schritt-Anleitung',
    icon: '🔧',
    content: `# Anleitung: [Aufgabenname]

## Einleitung
Kurze Einführung in den Inhalt dieser Anleitung.

## Voraussetzungen
- Punkt 1
- Punkt 2

## Schritte
### Schritt 1: [Titel]
Beschreibung...

### Schritt 2: [Titel]
Beschreibung...

## Fehlerbehebung
| Problem | Lösung |
|---------|--------|
| Problem 1 | Lösung 1 |
`,
  },
  {
    id: 'decision',
    name: 'Entscheidungsprotokoll',
    description: 'Entscheidungen dokumentieren',
    icon: '✅',
    content: `# Entscheidungsprotokoll: [Titel]

## Status
Vorgeschlagen | Akzeptiert

## Kontext
Worum geht es?

## Entscheidung
Wie lautet die Entscheidung?

## Begründung
Warum ist das sinnvoll?

## Folgen
Was wird einfacher oder schwieriger?
`,
  },
];

export const getTemplate = (id: string) => PAGE_TEMPLATES.find((t) => t.id === id);
