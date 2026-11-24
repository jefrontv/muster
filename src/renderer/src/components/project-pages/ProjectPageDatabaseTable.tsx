// Table view: one row per page, one column per property.
import { FileText, Plus } from 'lucide-react'
import type React from 'react'
import { useEffect, useState } from 'react'
import { translate } from '@/i18n/i18n'
import type { DatabaseRow } from '../../../../shared/project-pages-database-query'
import type { PageDatabaseSchema } from '../../../../shared/project-pages-database-types'
import type { ProjectPageMeta } from '../../../../shared/project-pages-types'
import { ProjectPagePropertyCell } from './ProjectPagePropertyCell'
import type { ProjectPageDatabaseActions } from './use-project-page-database'

type Props = {
  schema: PageDatabaseSchema
  rows: DatabaseRow[]
  actions: ProjectPageDatabaseActions
  onOpenPage: (pageId: string) => void
  addProperty: React.ReactNode
  rowPages: Map<string, ProjectPageMeta>
}

function RowTitle({
  title,
  placeholder,
  onRename
}: {
  title: string
  placeholder: string
  onRename: (title: string) => void
}): React.JSX.Element {
  const [draft, setDraft] = useState(title)
  useEffect(() => setDraft(title), [title])
  return (
    <input
      value={draft}
      placeholder={placeholder}
      aria-label={placeholder}
      className="h-7 min-w-0 flex-1 rounded-md bg-transparent px-1 text-sm text-foreground outline-none placeholder:text-muted-foreground/60 hover:bg-accent/60 focus:bg-accent/60"
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => {
        if (draft.trim() !== title.trim()) {
          onRename(draft.trim())
        }
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.currentTarget.blur()
        }
      }}
    />
  )
}

export function ProjectPageDatabaseTable({
  schema,
  rows,
  actions,
  onOpenPage,
  addProperty,
  rowPages
}: Props): React.JSX.Element {
  const untitled = translate('auto.components.projectPages.untitled', 'Untitled')
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[480px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs text-muted-foreground">
            <th className="w-[40%] px-1.5 py-1.5 font-medium">
              {translate('auto.components.projectPages.columnTitle', 'Name')}
            </th>
            {schema.properties.map((property) => (
              <th key={property.id} className="px-1.5 py-1.5 font-medium">
                {property.name}
              </th>
            ))}
            <th className="w-8 px-1 py-1">{addProperty}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-b border-border/60">
              <td className="px-0.5 py-0.5">
                <div className="flex min-w-0 items-center gap-0.5">
                  <button
                    type="button"
                    aria-label={translate('auto.components.projectPages.openRow', 'Open page')}
                    title={translate('auto.components.projectPages.openRow', 'Open page')}
                    className="grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-accent/60 hover:text-foreground"
                    onClick={() => onOpenPage(row.id)}
                  >
                    <FileText className="size-3.5" />
                  </button>
                  <RowTitle
                    title={row.title}
                    placeholder={untitled}
                    onRename={(title) => {
                      const page = rowPages.get(row.id)
                      if (page) {
                        void actions.renameRow(page, title)
                      }
                    }}
                  />
                </div>
              </td>
              {schema.properties.map((property) => (
                <td key={property.id} className="px-0.5 py-0.5">
                  <ProjectPagePropertyCell
                    property={property}
                    value={row.properties[property.id] ?? null}
                    onChange={(value) => void actions.setProperty(row.id, property.id, value)}
                  />
                </td>
              ))}
              <td />
            </tr>
          ))}
        </tbody>
      </table>
      <button
        type="button"
        className="mt-1 flex h-7 items-center gap-1.5 rounded-md px-1.5 text-sm text-muted-foreground hover:bg-accent/60 hover:text-foreground"
        onClick={() => void actions.addRow()}
      >
        <Plus className="size-3.5" />
        {translate('auto.components.projectPages.newRow', 'New')}
      </button>
    </div>
  )
}
