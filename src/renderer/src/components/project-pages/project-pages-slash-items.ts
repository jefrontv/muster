// The Pages "/" menu: the rich editor's blocks, with headings folded into one row per kind
// (level picked with chips or ←/→), plus page templates and "Database".
import type { Editor } from '@tiptap/react'
import { Database, FolderKanban, Info, LayoutTemplate, SquareCheckBig } from 'lucide-react'
import { translate } from '@/i18n/i18n'
import { slashCommands } from '../editor/rich-markdown-slash-command-catalog'
import { filterRichMarkdownSlashCommands } from '../editor/rich-markdown-slash-command-filter'
import { icon, type SlashCommand } from '../editor/rich-markdown-slash-command-primitives'
import { activeCollabInstance } from './project-pages-activecollab-data'
import { openActiveCollabPicker } from './project-pages-activecollab-insert'
import { PROJECT_PAGE_TEMPLATES } from './project-pages-templates'

export type PageSlashItem = {
  key: string
  label: string
  group: SlashCommand['group']
  icon: SlashCommand['icon']
  /** One command, or one per variant (heading level, callout kind). */
  variants: SlashCommand[]
  /** Chip labels for the variants, when there is more than one. */
  chips?: string[]
}

const CALLOUTS = [
  ['note', 'Note'],
  ['tip', 'Tip'],
  ['warning', 'Warning'],
  ['caution', 'Caution']
] as const

const byId = (id: string): SlashCommand | undefined => slashCommands.find((c) => c.id === id)
const levels = (prefix: string): SlashCommand[] =>
  [1, 2, 3].flatMap((n) => byId(`${prefix}${n}`) ?? [])

const HEADINGS = levels('heading-')
const TOGGLE_HEADINGS = levels('toggle-h')
// H4+ is rare enough to leave to markdown.
const HIDDEN = /^(heading-\d|toggle-h\d)$/

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
  const callouts = CALLOUTS.map(
    ([kind, label]): SlashCommand => ({
      id: `page-callout-${kind}`,
      label: `${label} callout`,
      aliases: ['callout', 'alert', 'admonition', kind],
      icon: icon(Info),
      group: 'Basic blocks',
      description: `A highlighted ${kind} box`,
      run: (editor) =>
        editor
          .chain()
          .focus()
          .toggleBlockquote()
          // insertContent trims the trailing space; insertText keeps it.
          .command(({ tr }) => {
            tr.insertText(`[!${kind.toUpperCase()}] `)
            return true
          })
          .run()
    })
  )
  const activeCollab: SlashCommand[] = [
    {
      id: 'page-ac-task',
      label: 'ActiveCollab task',
      aliases: ['task', 'activecollab', 'ticket', 'quote'],
      icon: icon(SquareCheckBig),
      group: 'Basic blocks',
      description: 'Add a task as a card, link or quote',
      run: (editor) => openActiveCollabPicker(editor, 'task')
    },
    {
      id: 'page-ac-project',
      label: 'ActiveCollab project',
      aliases: ['project', 'activecollab'],
      icon: icon(FolderKanban),
      group: 'Basic blocks',
      description: 'Add a project card',
      run: (editor) => openActiveCollabPicker(editor, 'project')
    }
  ]
  return [...callouts, ...templates, ...database, ...activeCollab]
}

/** Items matching the query, each with the heading level the query points at. */
export function filterPageSlashItems(
  extra: readonly SlashCommand[],
  query: string
): { item: PageSlashItem; level: number }[] {
  const single = (c: SlashCommand): PageSlashItem => ({
    key: c.id,
    label: c.label,
    group: c.group,
    icon: c.icon,
    variants: [c]
  })
  const levelChips = ['H1', 'H2', 'H3']
  const callouts = extra.filter((c) => c.id.startsWith('page-callout-'))
  const base = slashCommands.filter((c) => !HIDDEN.test(c.id)).map(single)
  const lastBasic = base.map((item) => item.group).lastIndexOf('Basic blocks')
  base.splice(lastBasic + 1, 0, {
    key: 'callout',
    label: 'Callout',
    group: 'Basic blocks',
    icon: callouts[0]?.icon ?? icon(Info),
    variants: callouts,
    chips: CALLOUTS.map(([, label]) => label)
  })
  const items: PageSlashItem[] = [
    {
      key: 'heading',
      label: 'Heading',
      group: 'Headings',
      icon: HEADINGS[0].icon,
      variants: HEADINGS,
      chips: levelChips
    },
    {
      key: 'toggle-heading',
      label: 'Toggle heading',
      group: 'Headings',
      icon: TOGGLE_HEADINGS[0].icon,
      variants: TOGGLE_HEADINGS,
      chips: levelChips
    },
    ...base.filter((item) => item.variants.length > 0),
    ...extra
      .filter((c) => !c.id.startsWith('page-callout-'))
      // ActiveCollab rows only when it is connected.
      .filter((c) => !c.id.startsWith('page-ac-') || activeCollabInstance())
      .map(single)
  ]
  const needle = query.trim().toLowerCase()
  const matches = items.flatMap((item) => {
    const hits = filterRichMarkdownSlashCommands(item.variants, query)
    const named = !needle || item.label.toLowerCase().includes(needle)
    if (!named && hits.length === 0) {
      return []
    }
    // A query naming one level ("h2", "heading 2") preselects it.
    const level = !named && hits.length === 1 ? item.variants.indexOf(hits[0]) : 0
    return [{ item, level, named }]
  })
  // Rows named by the query come before alias hits, so "/task" lands on ActiveCollab task.
  return [...matches.filter((m) => m.named), ...matches.filter((m) => !m.named)].map(
    ({ item, level }) => ({ item, level })
  )
}
