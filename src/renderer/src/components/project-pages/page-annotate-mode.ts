// Annotate mode for plain pages: on, a selection opens the note box. Session-wide, off at start.
import { useSyncExternalStore } from 'react'

let annotating = false
const listeners = new Set<() => void>()

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function isPageAnnotateMode(): boolean {
  return annotating
}

export function setPageAnnotateMode(next: boolean): void {
  if (next === annotating) {
    return
  }
  annotating = next
  for (const listener of listeners) {
    listener()
  }
}

export function togglePageAnnotateMode(): void {
  setPageAnnotateMode(!annotating)
}

export function usePageAnnotateMode(): boolean {
  return useSyncExternalStore(subscribe, isPageAnnotateMode)
}
