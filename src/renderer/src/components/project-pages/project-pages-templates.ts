// Starting points offered on a blank page. List items need text: a bare "- " parses as a dash.
import { translate } from '@/i18n/i18n'

export type ProjectPageTemplate = { id: string; label: string; markdown: () => string }

const blocks = (...parts: string[]): string => parts.join('\n\n')

export const PROJECT_PAGE_TEMPLATES: ProjectPageTemplate[] = [
  {
    id: 'meeting',
    label: translate('auto.components.projectPages.templateMeeting', 'Meeting notes'),
    markdown: () =>
      blocks(
        `**Date:** ${new Date().toLocaleDateString()}`,
        '**Attendees:** ',
        '## Agenda',
        '- First topic',
        '## Notes',
        '- What was said',
        '## Actions',
        '- [ ] Who does what'
      )
  },
  {
    id: 'brief',
    label: translate('auto.components.projectPages.templateBrief', 'Project brief'),
    markdown: () =>
      blocks(
        '## Goal',
        'What this project should achieve.',
        '## Scope',
        '- In scope',
        '## Out of scope',
        '- Not doing',
        '## Open questions',
        '- Question'
      )
  },
  {
    id: 'checklist',
    label: translate('auto.components.projectPages.templateChecklist', 'Checklist'),
    markdown: () => ['- [ ] First item', '- [ ] Second item', '- [ ] Third item'].join('\n')
  },
  {
    id: 'decision',
    label: translate('auto.components.projectPages.templateDecision', 'Decision record'),
    markdown: () =>
      blocks(
        '## Context',
        'What prompted this decision.',
        '## Options',
        '1. Option',
        '## Decision',
        'What was chosen and why.',
        '## Consequences',
        '- What changes'
      )
  }
]
