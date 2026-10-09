import React from 'react'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'

export function SourceControlNoMatchingFiles({
  query,
  onClearFilter
}: {
  query: string
  onClearFilter: () => void
}): React.JSX.Element {
  return (
    <div className="px-4 py-6">
      <div className="text-sm font-medium text-foreground">
        {translate(
          'auto.components.right.sidebar.SourceControl.noMatchingFiles.heading',
          'No matching files'
        )}
      </div>
      <div className="mt-1 text-xs text-muted-foreground">
        {translate(
          'auto.components.right.sidebar.SourceControl.noMatchingFiles.body',
          'No changed files match "{{query}}"',
          { query }
        )}
      </div>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="mt-2 -ml-3"
        onClick={onClearFilter}
      >
        {translate(
          'auto.components.right.sidebar.SourceControl.noMatchingFiles.clear',
          'Clear filter'
        )}
      </Button>
    </div>
  )
}
