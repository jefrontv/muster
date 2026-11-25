// Shown when the page changed elsewhere while it had unsaved edits here.
import type React from 'react'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'

export function ProjectPageConflictBanner({
  onLoad
}: {
  /** True keeps this editor's text; false loads the stored version. */
  onLoad: (keepMine: boolean) => void
}): React.JSX.Element {
  return (
    <div
      role="alert"
      className="flex shrink-0 items-center gap-2 border-b border-border bg-muted/50 px-8 py-2 text-xs"
    >
      <span className="flex-1 text-foreground">
        {translate(
          'auto.components.projectPages.conflict',
          'This page changed somewhere else while you were editing.'
        )}
      </span>
      <Button size="xs" variant="outline" onClick={() => onLoad(false)}>
        {translate('auto.components.projectPages.useTheirs', 'Load their version')}
      </Button>
      <Button size="xs" onClick={() => onLoad(true)}>
        {translate('auto.components.projectPages.keepMine', 'Keep mine')}
      </Button>
    </div>
  )
}
