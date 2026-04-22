export const PAGE_TEMPLATES = [
  {
    id: 'blank',
    name: 'Blank Page',
    description: 'Start with a blank page',
    icon: '📄',
    content: '',
  },
  {
    id: 'documentation',
    name: 'Documentation',
    description: 'Technical documentation page',
    icon: '📝',
    content: `# Page Title

## Overview
Brief description of this topic.

## Details
Add your detailed content here.

## Related
- [Link 1](#)
- [Link 2](#)

## See Also
- [Related Page](#)
`,
  },
  {
    id: 'meeting-notes',
    name: 'Meeting Notes',
    description: 'Record meeting discussions',
    icon: '📋',
    content: `# Meeting Notes - [Date]

## Attendees
- Person 1
- Person 2

## Agenda
1. Topic 1
2. Topic 2

## Discussion
### Topic 1
Notes...

### Topic 2
Notes...

## Action Items
- [ ] Task 1 - @person
- [ ] Task 2 - @person
`,
  },
  {
    id: 'how-to',
    name: 'How-To Guide',
    description: 'Step-by-step instructions',
    icon: '🔧',
    content: `# How To: [Task Name]

## Introduction
Brief intro to what this guide covers.

## Prerequisites
- Item 1
- Item 2

## Steps
### Step 1: [Title]
Description...

### Step 2: [Title]
Description...

## Troubleshooting
| Problem | Solution |
|---------|-----------|
| Issue 1 | Fix 1 |
`,
  },
  {
    id: 'decision',
    name: 'Decision Record',
    description: 'Document decisions',
    icon: '✅',
    content: `# Decision Record: [Title]

## Status
Proposed | Accepted

## Context
What is the issue?

## Decision
What is the decision?

## Rationale
Why is this appropriate?

## Consequences
What becomes easier or more difficult?
`,
  },
];

export const getTemplate = (id: string) => PAGE_TEMPLATES.find(t => t.id === id);
