// Property values of a database row, shown under its title.
import type React from 'react'
import type { ProjectPageMeta } from '../../../../shared/project-pages-types'
import { ProjectPagePropertyCell } from './ProjectPagePropertyCell'
import { useProjectPageDatabase } from './use-project-page-database'

type Props = {
  scopeKey: string
  row: ProjectPageMeta
  databaseId: string
  pages: ProjectPageMeta[]
}

export function ProjectPageRowProperties({
  scopeKey,
  row,
  databaseId,
  pages
}: Props): React.JSX.Element | null {
  const actions = useProjectPageDatabase(scopeKey, databaseId, pages)
  const properties = actions.database?.schema.properties ?? []
  if (properties.length === 0) {
    return null
  }
  return (
    <dl className="mx-8 mt-3 grid grid-cols-[minmax(6rem,10rem)_1fr] items-center gap-x-3 gap-y-0.5 border-b border-border pb-3 text-sm">
      {properties.map((property) => (
        <div key={property.id} className="contents">
          <dt className="truncate text-muted-foreground">{property.name}</dt>
          <dd className="min-w-0 max-w-xs">
            <ProjectPagePropertyCell
              property={property}
              value={row.properties?.[property.id] ?? null}
              onChange={(value) => void actions.setProperty(row.id, property.id, value)}
            />
          </dd>
        </div>
      ))}
    </dl>
  )
}
