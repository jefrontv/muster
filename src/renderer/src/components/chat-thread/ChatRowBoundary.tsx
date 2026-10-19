import type React from 'react'
import { AlertTriangle } from 'lucide-react'
import { RecoverableRenderErrorBoundary } from '@/components/error-boundaries/RecoverableRenderErrorBoundary'
import { translate } from '@/i18n/i18n'

// Items keep identity until they change, so a new object is the retry signal.
const resetIds = new WeakMap<object, number>()
let nextResetId = 0
const resetIdOf = (item: object): number => {
  let id = resetIds.get(item)
  if (id === undefined) {
    id = nextResetId++
    resetIds.set(item, id)
  }
  return id
}

/** One crashing renderer costs one row, not the transcript. */
export function ChatRowBoundary(props: {
  rowId: string
  item: object
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <RecoverableRenderErrorBoundary
      boundaryId={`chat-thread-row:${props.rowId}`}
      surface="page"
      resetKey={resetIdOf(props.item)}
      fallback={() => (
        <div className="flex h-6 items-center gap-2 text-[13px] text-muted-foreground">
          <AlertTriangle className="size-3.5 text-destructive" />
          {translate('components.chat-thread.rowFailed', 'This step could not be shown.')}
        </div>
      )}
    >
      {props.children}
    </RecoverableRenderErrorBoundary>
  )
}
