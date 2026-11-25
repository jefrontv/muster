// A database page's rows: view tabs, sort and filter, then the table or board.
import { ArrowUpDown, Filter } from 'lucide-react'
import type React from 'react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'
import { applyDatabaseView } from '../../../../shared/project-pages-database-query'
import type { PageDatabaseView } from '../../../../shared/project-pages-database-types'
import type { ProjectPageMeta } from '../../../../shared/project-pages-types'
import { ProjectPageAddProperty } from './ProjectPageAddProperty'
import { ProjectPageDatabaseBoard } from './ProjectPageDatabaseBoard'
import { ProjectPageDatabaseTable } from './ProjectPageDatabaseTable'
import { useProjectPageDatabase } from './use-project-page-database'

type Props = {
  scopeKey: string
  pageId: string
  pages: ProjectPageMeta[]
  onOpenPage: (pageId: string) => void
}

export function ProjectPageDatabaseView({
  scopeKey,
  pageId,
  pages,
  onOpenPage
}: Props): React.JSX.Element | null {
  const actions = useProjectPageDatabase(scopeKey, pageId, pages)
  const [viewId, setViewId] = useState<string | null>(null)
  const { database } = actions
  if (!database) {
    return actions.error ? <p className="mx-8 text-sm text-destructive">{actions.error}</p> : null
  }
  const { schema } = database
  const view = schema.views.find((v) => v.id === viewId) ?? schema.views[0]
  const rows = applyDatabaseView(
    database.rows.map((r) => ({ id: r.id, title: r.title, properties: r.properties ?? {} })),
    schema,
    view
  )
  const saveView = (patch: Partial<PageDatabaseView>): void => {
    void actions.saveSchema({
      ...schema,
      views: schema.views.map((v) => (v.id === view.id ? { ...v, ...patch } : v))
    })
  }
  const columns = [
    { id: 'title', name: translate('auto.components.projectPages.columnTitle', 'Name') },
    ...schema.properties
  ]
  const addProperty = <ProjectPageAddProperty schema={schema} onSave={actions.saveSchema} />

  return (
    <section
      className="mx-8 mb-6 mt-2"
      aria-label={translate('auto.components.projectPages.database', 'Database')}
    >
      <div className="mb-2 flex items-center gap-1 border-b border-border pb-1.5">
        {schema.views.map((v) => (
          <button
            key={v.id}
            type="button"
            aria-pressed={v.id === view.id}
            className={cn(
              'rounded-md px-2 py-1 text-sm',
              v.id === view.id
                ? 'bg-accent text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            )}
            onClick={() => setViewId(v.id)}
          >
            {v.name}
          </button>
        ))}
        <span className="flex-1" />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant={view.sort ? 'secondary' : 'ghost'}
              size="icon-sm"
              aria-label={translate('auto.components.projectPages.sort', 'Sort')}
            >
              <ArrowUpDown className="size-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {columns.flatMap((column) =>
              (['asc', 'desc'] as const).map((direction) => (
                <DropdownMenuItem
                  key={`${column.id}-${direction}`}
                  onSelect={() => saveView({ sort: { propertyId: column.id, direction } })}
                >
                  {column.name} {direction === 'asc' ? '↑' : '↓'}
                </DropdownMenuItem>
              ))
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => saveView({ sort: null })}>
              {translate('auto.components.projectPages.clearSort', 'No sort')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant={view.filter ? 'secondary' : 'ghost'}
              size="icon-sm"
              aria-label={translate('auto.components.projectPages.filter', 'Filter')}
            >
              <Filter className="size-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="max-h-80 overflow-y-auto scrollbar-sleek">
            {schema.properties.map((property) => (
              <div key={property.id}>
                <DropdownMenuLabel className="text-xs text-muted-foreground">
                  {property.name}
                </DropdownMenuLabel>
                {(property.options ?? []).map((option) => (
                  <DropdownMenuItem
                    key={option.id}
                    onSelect={() =>
                      saveView({ filter: { propertyId: property.id, op: 'is', value: option.id } })
                    }
                  >
                    {option.name}
                  </DropdownMenuItem>
                ))}
                {(['empty', 'not_empty'] as const).map((op) => (
                  <DropdownMenuItem
                    key={op}
                    onSelect={() => saveView({ filter: { propertyId: property.id, op } })}
                  >
                    {op === 'empty'
                      ? translate('auto.components.projectPages.filterEmpty', 'Is empty')
                      : translate('auto.components.projectPages.filterNotEmpty', 'Is not empty')}
                  </DropdownMenuItem>
                ))}
              </div>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => saveView({ filter: null })}>
              {translate('auto.components.projectPages.clearFilter', 'No filter')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        {view.kind === 'board' ? addProperty : null}
      </div>
      {view.kind === 'board' ? (
        <ProjectPageDatabaseBoard
          groupBy={schema.properties.find((p) => p.id === view.groupBy && p.type === 'select')}
          rows={rows}
          actions={actions}
          onOpenPage={onOpenPage}
        />
      ) : (
        <ProjectPageDatabaseTable
          schema={schema}
          rows={rows}
          actions={actions}
          onOpenPage={onOpenPage}
          addProperty={addProperty}
          rowPages={new Map(database.rows.map((page) => [page.id, page]))}
        />
      )}
    </section>
  )
}
