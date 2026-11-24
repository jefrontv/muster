// Board view: a column per option of a select property; drag cards between columns.
import { Plus } from 'lucide-react'
import type React from 'react'
import { useState } from 'react'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'
import {
  groupRowsByOption,
  type DatabaseRow
} from '../../../../shared/project-pages-database-query'
import type { PageProperty } from '../../../../shared/project-pages-database-types'
import type { ProjectPageDatabaseActions } from './use-project-page-database'

type Props = {
  groupBy: PageProperty | undefined
  rows: DatabaseRow[]
  actions: ProjectPageDatabaseActions
  onOpenPage: (pageId: string) => void
}

const DRAG_TYPE = 'application/x-muster-page-row'

export function ProjectPageDatabaseBoard({
  groupBy,
  rows,
  actions,
  onOpenPage
}: Props): React.JSX.Element {
  const [over, setOver] = useState<string | null>(null)
  if (!groupBy) {
    return (
      <p className="py-3 text-sm text-muted-foreground">
        {translate(
          'auto.components.projectPages.boardNeedsSelect',
          'A board groups rows by a select property. Add one to use this view.'
        )}
      </p>
    )
  }
  const untitled = translate('auto.components.projectPages.untitled', 'Untitled')
  return (
    <div className="flex gap-3 overflow-x-auto pb-2">
      {groupRowsByOption(rows, groupBy).map((column) => {
        const key = column.optionId ?? '__none'
        return (
          <section
            key={key}
            aria-label={column.name}
            className={cn(
              'flex w-56 shrink-0 flex-col gap-1.5 rounded-lg bg-muted/40 p-2',
              over === key && 'ring-1 ring-ring'
            )}
            onDragOver={(event) => {
              if (event.dataTransfer.types.includes(DRAG_TYPE)) {
                event.preventDefault()
                setOver(key)
              }
            }}
            onDragLeave={() => setOver((current) => (current === key ? null : current))}
            onDrop={(event) => {
              const rowId = event.dataTransfer.getData(DRAG_TYPE)
              setOver(null)
              if (rowId) {
                void actions.setProperty(rowId, groupBy.id, column.optionId)
              }
            }}
          >
            <h3 className="flex items-center justify-between px-1 text-xs font-medium text-muted-foreground">
              <span className="truncate">{column.name}</span>
              <span>{column.rows.length}</span>
            </h3>
            {column.rows.map((row) => (
              <button
                key={row.id}
                type="button"
                draggable
                className="rounded-md border border-border bg-background px-2 py-1.5 text-left text-sm shadow-xs hover:bg-accent/60"
                onDragStart={(event) => {
                  event.dataTransfer.setData(DRAG_TYPE, row.id)
                  event.dataTransfer.effectAllowed = 'move'
                }}
                onClick={() => onOpenPage(row.id)}
              >
                <span className="line-clamp-2">{row.title.trim() || untitled}</span>
              </button>
            ))}
            <button
              type="button"
              className="flex h-7 items-center gap-1.5 rounded-md px-1 text-xs text-muted-foreground hover:bg-accent/60 hover:text-foreground"
              onClick={() =>
                void actions.addRow(column.optionId ? { [groupBy.id]: column.optionId } : undefined)
              }
            >
              <Plus className="size-3.5" />
              {translate('auto.components.projectPages.newRow', 'New')}
            </button>
          </section>
        )
      })}
    </div>
  )
}
