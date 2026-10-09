import { createContext } from 'react'

export type SourceControlTreeScrollTarget = {
  /** Scrolls the row into view if this list owns it; false when it does not. */
  scrollToRow: (id: string) => boolean
}

export type SourceControlTreeRowScroller = {
  register: (target: SourceControlTreeScrollTarget) => () => void
  scrollToRow: (id: string) => boolean
}

export function createSourceControlTreeRowScroller(): SourceControlTreeRowScroller {
  const targets = new Set<SourceControlTreeScrollTarget>()
  return {
    register: (target) => {
      targets.add(target)
      return () => {
        targets.delete(target)
      }
    },
    scrollToRow: (id) => {
      for (const target of targets) {
        if (target.scrollToRow(id)) {
          return true
        }
      }
      return false
    }
  }
}

// Why: each section virtualises independently, so keyboard moves to an unmounted
// row ask the owning list to scroll it into the window first.
export const SourceControlTreeRowScrollContext = createContext<SourceControlTreeRowScroller | null>(
  null
)
