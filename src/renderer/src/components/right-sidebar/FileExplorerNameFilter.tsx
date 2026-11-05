import React from 'react'
import { ListFilter, Loader2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { SEARCH_FIELD_INPUT, SEARCH_FIELD_SHELL } from '@/components/ui/input'
import { translate } from '@/i18n/i18n'

type FileExplorerNameFilterProps = {
  query: string
  loading?: boolean
  onQueryChange: (value: string) => void
  onClear: () => void
}

export function FileExplorerNameFilter({
  query,
  loading = false,
  onQueryChange,
  onClear
}: FileExplorerNameFilterProps): React.JSX.Element {
  return (
    <div className={SEARCH_FIELD_SHELL} data-ignore-file-explorer-keys="true">
      <ListFilter className="size-3.5 shrink-0 text-muted-foreground" />
      <input
        type="text"
        className={SEARCH_FIELD_INPUT}
        aria-label={translate(
          'auto.components.right.sidebar.FileExplorerNameFilter.26fb73c6e3',
          'Find files'
        )}
        placeholder={translate(
          'auto.components.right.sidebar.FileExplorerNameFilter.26fb73c6e3',
          'Find files'
        )}
        value={query}
        onChange={(event) => onQueryChange(event.currentTarget.value)}
        spellCheck={false}
      />
      {loading ? <Loader2 className="size-3 shrink-0 animate-spin text-muted-foreground" /> : null}
      {query ? (
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          className="hit-area -mr-1.5 size-5 text-muted-foreground hover:text-foreground"
          aria-label={translate(
            'auto.components.right.sidebar.FileExplorerNameFilter.4d5a6b2a49',
            'Clear file filter'
          )}
          onClick={onClear}
        >
          <X className="size-3" />
        </Button>
      ) : null}
    </div>
  )
}
