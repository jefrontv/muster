// Loads a database page and writes schema and row changes as the user.
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import type {
  PageDatabaseSchema,
  PagePropertyValue,
  ProjectPageDatabase
} from '../../../../shared/project-pages-database-types'
import type { ProjectPageMeta, ProjectPagesResult } from '../../../../shared/project-pages-types'

function report<T>(result: ProjectPagesResult<T>): ProjectPagesResult<T> {
  if (!result.ok) {
    toast.error(result.message)
  }
  return result
}

export function useProjectPageDatabase(
  scopeKey: string,
  pageId: string,
  /** The space's page list; a new list means something changed, so the rows reload. */
  pages: ProjectPageMeta[]
) {
  const [database, setDatabase] = useState<ProjectPageDatabase | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let stale = false
    void window.api.projectPages.database(scopeKey, pageId).then((result) => {
      if (stale) {
        return
      }
      setDatabase(result.ok ? result.value : null)
      setError(result.ok ? null : result.message)
    })
    return () => {
      stale = true
    }
  }, [scopeKey, pageId, pages])

  return {
    database,
    error,
    setProperty: (rowId: string, propertyId: string, value: PagePropertyValue) =>
      window.api.projectPages.setProperties(scopeKey, rowId, { [propertyId]: value }).then(report),
    renameRow: (row: ProjectPageMeta, title: string) =>
      window.api.projectPages
        .update(scopeKey, row.id, { baseRevision: row.revision, title })
        .then(report),
    addRow: (properties?: Record<string, PagePropertyValue>) =>
      window.api.projectPages.addRow(scopeKey, pageId, { title: '', properties }).then(report),
    saveSchema: async (schema: PageDatabaseSchema) => {
      const result = report(await window.api.projectPages.updateDatabase(scopeKey, pageId, schema))
      if (result.ok) {
        setDatabase(result.value)
      }
      return result
    }
  }
}

export type ProjectPageDatabaseActions = ReturnType<typeof useProjectPageDatabase>
