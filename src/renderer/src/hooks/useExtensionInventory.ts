// One shared extension inventory for every consumer: the Settings pane, the sidebar badge and the
// update card all read the same snapshot and trigger the same single scan.
//
// Modelled on useSkillFreshness, and for the same reason: window focus fires on every alt-tab, and
// a scan walks PATH, reads harness configs and hits two registries. Without the shared store and
// the cooldown, a user switching between Muster and a terminal would start a scan per switch, per
// mounted component.

import { useEffect, useSyncExternalStore } from 'react'
import type { ExtensionInventory } from '../../../shared/extension-state-types'

const FOCUS_RESCAN_COOLDOWN_MS = 60_000

type Snapshot = {
  inventory: ExtensionInventory | null
  loading: boolean
  error: string | null
}

let snapshot: Snapshot = { inventory: null, loading: false, error: null }
let lastCompletedAt = 0
let sequence = 0
const subscribers = new Set<() => void>()

function publish(next: Snapshot): void {
  if (
    snapshot.inventory === next.inventory &&
    snapshot.loading === next.loading &&
    snapshot.error === next.error
  ) {
    return
  }
  snapshot = next
  for (const subscriber of subscribers) {
    subscriber()
  }
}

export async function refreshExtensionInventory(force = false): Promise<void> {
  const current = ++sequence
  // Why the previous inventory is kept on screen: a refresh that blanks the pane makes every
  // manual re-check look like the extensions disappeared.
  publish({ ...snapshot, loading: true, error: null })
  try {
    const result = await window.api.extensions.inventory({ force })
    if (current !== sequence) {
      return
    }
    lastCompletedAt = Date.now()
    if (result.ok) {
      publish({ inventory: result.value, loading: false, error: null })
    } else {
      publish({ ...snapshot, loading: false, error: result.error })
    }
  } catch (cause) {
    if (current === sequence) {
      publish({
        ...snapshot,
        loading: false,
        error: cause instanceof Error ? cause.message : 'Could not inspect extensions.'
      })
    }
  }
}

function onFocus(): void {
  if (Date.now() - lastCompletedAt >= FOCUS_RESCAN_COOLDOWN_MS) {
    void refreshExtensionInventory(false)
  }
}

function subscribe(subscriber: () => void): () => void {
  subscribers.add(subscriber)
  if (subscribers.size === 1) {
    window.addEventListener('focus', onFocus)
  }
  return () => {
    subscribers.delete(subscriber)
    if (subscribers.size === 0) {
      window.removeEventListener('focus', onFocus)
    }
  }
}

function getSnapshot(): Snapshot {
  return snapshot
}

export type ExtensionInventoryState = Snapshot & {
  refresh: (force?: boolean) => Promise<void>
}

export function useExtensionInventory(): ExtensionInventoryState {
  const current = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)

  useEffect(() => {
    if (!snapshot.inventory && !snapshot.loading) {
      void refreshExtensionInventory(false)
    }
  }, [])

  return { ...current, refresh: refreshExtensionInventory }
}

/** Lets a write handler publish the inventory the main process just returned, with no second scan. */
export function publishExtensionInventory(inventory: ExtensionInventory): void {
  lastCompletedAt = Date.now()
  sequence += 1
  publish({ inventory, loading: false, error: null })
}

export const _extensionInventoryForTests = {
  reset(): void {
    snapshot = { inventory: null, loading: false, error: null }
    lastCompletedAt = 0
    sequence = 0
  }
}
