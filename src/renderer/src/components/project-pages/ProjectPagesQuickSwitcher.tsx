// Cmd/Ctrl+P inside Pages: jump to a page by title, heading or text.
import { FileText } from 'lucide-react'
import type React from 'react'
import { useEffect, useMemo, useState } from 'react'
import {
  CommandDialog,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList
} from '@/components/ui/command'
import { translate } from '@/i18n/i18n'
import type {
  ProjectPageMeta,
  ProjectPageSearchResult
} from '../../../../shared/project-pages-types'
import { pageTitle } from './project-pages-tree-model'

type Props = {
  scopeKey: string
  pages: ProjectPageMeta[]
  open: boolean
  onOpenChange: (open: boolean) => void
  onPick: (pageId: string) => void
}

export function ProjectPagesQuickSwitcher({
  scopeKey,
  pages,
  open,
  onOpenChange,
  onPick
}: Props): React.JSX.Element {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<ProjectPageSearchResult[]>([])
  const recent = useMemo(
    () =>
      pages
        .filter((page) => page.archivedAt === null)
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .slice(0, 12)
        .map((page) => ({ page, snippet: '' })),
    [pages]
  )

  useEffect(() => {
    if (!open) {
      setQuery('')
      return undefined
    }
    if (!query.trim()) {
      setResults([])
      return undefined
    }
    let stale = false
    const timer = setTimeout(() => {
      void window.api.projectPages.search(scopeKey, query).then((result) => {
        if (!stale) {
          setResults(result.ok ? result.value : [])
        }
      })
    }, 120)
    return () => {
      stale = true
      clearTimeout(timer)
    }
  }, [open, query, scopeKey])

  const rows = query.trim() ? results : recent
  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      shouldFilter={false}
      title={translate('auto.components.projectPages.switcher', 'Go to page')}
      description={translate(
        'auto.components.projectPages.switcherHint',
        'Search page titles, headings and text.'
      )}
    >
      <CommandInput
        value={query}
        onValueChange={setQuery}
        placeholder={translate('auto.components.projectPages.switcherPlaceholder', 'Go to page…')}
      />
      <CommandList>
        <CommandEmpty>
          {translate('auto.components.projectPages.switcherEmpty', 'No pages match.')}
        </CommandEmpty>
        {rows.map(({ page, snippet }) => (
          <CommandItem
            key={page.id}
            value={page.id}
            onSelect={() => {
              onPick(page.id)
              onOpenChange(false)
            }}
          >
            <FileText className="size-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate">
              {pageTitle(page)}
              {snippet ? (
                <span className="ml-2 text-xs text-muted-foreground">{snippet}</span>
              ) : null}
            </span>
          </CommandItem>
        ))}
      </CommandList>
    </CommandDialog>
  )
}
