import type React from 'react'
import { SourceControlTreeRowScrollContext } from './source-control-tree-contexts'
import type { SourceControlTreeKeyboard } from './use-source-control-tree-keyboard'

// Why: rows own varied root classNames, so the ring is applied from the tree via the `ring` focus token.
const TREE_ITEM_FOCUS_CLASS =
  'outline-none [&_[role=treeitem]]:outline-none [&_[role=treeitem]:focus-visible]:ring-1 [&_[role=treeitem]:focus-visible]:ring-inset [&_[role=treeitem]:focus-visible]:ring-ring'

export function SourceControlKeyboardTree({
  keyboard,
  label,
  children
}: {
  keyboard: SourceControlTreeKeyboard
  label: string
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <SourceControlTreeRowScrollContext.Provider value={keyboard.rowScroller}>
      <div
        {...keyboard.containerProps}
        aria-label={keyboard.containerProps.role ? label : undefined}
        className={TREE_ITEM_FOCUS_CLASS}
      >
        {children}
      </div>
    </SourceControlTreeRowScrollContext.Provider>
  )
}
