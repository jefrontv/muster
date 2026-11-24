// Debounced, serial saves for one open page; a conflict stops saving until the user picks a side.

export type PagePatch = { title?: string; markdown?: () => string }
export type PageSaveResult =
  | { ok: true; revision: number; merged?: string }
  | { ok: false; conflict: boolean; message: string }
export type AutosaveState = 'saved' | 'pending' | 'saving' | 'conflict' | 'error'

type Options = {
  revision: number
  delayMs?: number
  save: (
    patch: { title?: string; markdown?: string },
    baseRevision: number
  ) => Promise<PageSaveResult>
  onState: (state: AutosaveState, message?: string) => void
  /** The store merged this save with newer ones; the editor must show `merged`. */
  onMerged?: (sent: string, merged: string) => void
}

export type PageAutosave = ReturnType<typeof createPageAutosave>

export function createPageAutosave({
  revision: initial,
  delayMs = 600,
  save,
  onState,
  onMerged
}: Options) {
  let revision = initial
  let pending: PagePatch | null = null
  let timer: ReturnType<typeof setTimeout> | null = null
  let running: Promise<void> | null = null
  let blocked = false

  function clearTimer(): void {
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
  }

  async function run(): Promise<void> {
    while (pending && !blocked) {
      const patch = pending
      pending = null
      onState('saving')
      const markdown = patch.markdown?.()
      const result = await save({ title: patch.title, markdown }, revision)
      if (result.ok) {
        revision = result.revision
        if (result.merged !== undefined && markdown !== undefined) {
          onMerged?.(markdown, result.merged)
        }
        continue
      }
      // Keep the unsaved edit so "keep mine" can retry it on top of the newer revision.
      // An edit queued while this save ran is newer than `patch` and wins.
      const queued = pending as PagePatch | null
      pending = { ...patch, ...queued }
      blocked = result.conflict
      onState(result.conflict ? 'conflict' : 'error', result.message)
      return
    }
    if (!blocked) {
      onState(pending ? 'pending' : 'saved')
    }
  }

  function flush(): Promise<void> {
    clearTimer()
    running ??= run().finally(() => {
      running = null
    })
    return running
  }

  return {
    queue(patch: PagePatch): void {
      pending = { ...pending, ...patch }
      if (!blocked) {
        onState('pending')
        clearTimer()
        timer = setTimeout(() => void flush(), delayMs)
      }
    },
    flush,
    isDirty: (): boolean => pending !== null || running !== null,
    revision: (): number => revision,
    /** After a reload or a "keep mine": continue from `next`, saving any kept edit on top of it. */
    resume(next: number, keepPending: boolean): Promise<void> {
      revision = next
      blocked = false
      if (!keepPending) {
        pending = null
      }
      return flush()
    }
  }
}
