// The Pages "/" menu: the rich editor's blocks, with headings folded into one row per kind
// (level picked with chips or ←/→), plus page templates and "Database".
import type { Editor } from '@tiptap/react'
import { Database, LayoutTemplate } from 'lucide-react'
import { translate } from '@/i18n/i18n'
import { slashCommands } from '../editor/rich-markdown-slash-command-catalog'
import { filterRichMarkdownSlashCommands } from '../editor/rich-markdown-slash-command-filter'
import { icon, type SlashCommand } from '../editor/rich-markdown-slash-command-primitives'
import { PROJECT_PAGE_TEMPLATES } from './project-pages-templates'

export type PageSlashItem = {
  key: string
  label: string
  group: SlashCommand['group']
  icon: SlashCommand['icon']
  /** One command, or one per heading level. */
  variants: SlashCommand[]
}

const byId = (id: string): SlashCommand | undefined => slashCommands.find((c) => c.id === id)
const levels = (prefix: string): SlashCommand[] =>
  [1, 2, 3].flatMap((n) => byId(`${prefix}${n}`) ?? [])

const HEADINGS = levels('heading-')
const TOGGLE_HEADINGS = levels('toggle-h')
// Image and emoji need pickers the file editor owns; H4+ is rare enough to leave to markdown.
const HIDDEN = /^(image|emoji|heading-\d|toggle-h\d)$/

export function pageSlashCommands(actions: {
  insertMarkdown: (editor: Editor, markdown: string) => void
  makeDatabase?: () => void
}): SlashCommand[] {
  const templates = PROJECT_PAGE_TEMPLATES.map(
    (template): SlashCommand => ({
      id: `page-template-${template.id}`,
      label: template.label,
      aliases: ['template'],
      icon: icon(LayoutTemplate),
      group: 'Templates',
      description: template.label,
      run: (editor) => actions.insertMarkdown(editor, template.markdown())
    })
  )
  const { makeDatabase } = actions
  const database: SlashCommand[] = makeDatabase
    ? [
        {
          id: 'page-database',
          label: translate('auto.components.projectPages.templateDatabase', 'Database'),
          aliases: ['table', 'board', 'tracker'],
          icon: icon(Database),
          group: 'Templates',
          description: 'Turn this page into a database with table and board views',
          run: () => makeDatabase()
        }
      ]
    : []
  return [...templates, ...database]
}

/** Items matching the query, each with the heading level the query points at. */
export function filterPageSlashItems(
  extra: readonly SlashCommand[],
  query: string
): { item: PageSlashItem; level: number }[] {
  const items: PageSlashItem[] = [
    {
      key: 'heading',
      label: 'Heading',
      group: 'Headings',
      icon: HEADINGS[0].icon,
      variants: HEADINGS
    },
    {
      key: 'toggle-heading',
      label: 'Toggle heading',
      group: 'Headings',
      icon: TOGGLE_HEADINGS[0].icon,
      variants: TOGGLE_HEADINGS
    },
    ...[...slashCommands.filter((c) => !HIDDEN.test(c.id)), ...extra].map((c) => ({
      key: c.id,
      label: c.label,
      group: c.group,
      icon: c.icon,
      variants: [c]
    }))
  ]
  const needle = query.trim().toLowerCase()
  return items.flatMap((item) => {
    const hits = filterRichMarkdownSlashCommands(item.variants, query)
    const named = !needle || item.label.toLowerCase().includes(needle)
    if (!named && hits.length === 0) {
      return []
    }
    // A query naming one level ("h2", "heading 2") preselects it.
    const level = !named && hits.length === 1 ? item.variants.indexOf(hits[0]) : 0
    return [{ item, level }]
  })
}
