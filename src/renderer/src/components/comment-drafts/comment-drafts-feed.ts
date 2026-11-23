// One shared feed of waiting comment drafts (bots and agents), so the sidebar tab, its badge and
// the Bots panel all read the same list and the app fetches it once per change.
import { useSyncExternalStore } from 'react'
import type {
  BotsCommentDraft,
  BotsCommentDraftTask
} from '../../../../shared/bots-comment-draft-types'

export type CommentDraftsFeed = {
  drafts: BotsCommentDraft[]
  tasks: Record<number, BotsCommentDraftTask>
  loaded: boolean
  error: string | null
}

type Listener = () => void

const EMPTY: CommentDraftsFeed = { drafts: [], tasks: {}, loaded: false, error: null }
let state = EMPTY
const listeners = new Set<Listener>()
const arrivalListeners = new Set<(drafts: BotsCommentDraft[]) => void>()
const requestedTasks = new Set<number>()
let stopChanges: (() => void) | null = null
let generation = 0

function set(next: Partial<CommentDraftsFeed>): void {
  state = { ...state, ...next }
  for (const listener of listeners) {
    listener()
  }
}

function lookUpTasks(drafts: BotsCommentDraft[]): void {
  for (const draft of drafts) {
    if (requestedTasks.has(draft.taskId)) {
      continue
    }
    requestedTasks.add(draft.taskId)
    void window.api.bots
      .commentDraftTask({ projectId: draft.projectId, taskId: draft.taskId })
      .then((result) => {
        if (result.ok) {
          set({ tasks: { ...state.tasks, [draft.taskId]: result.value } })
        } else {
          requestedTasks.delete(draft.taskId)
        }
      })
  }
}

export async function refreshCommentDrafts(): Promise<void> {
  const mine = ++generation
  const result = await window.api.bots.listCommentDrafts()
  if (mine !== generation) {
    return
  }
  if (!result.ok) {
    set({ error: 'message' in result ? result.message : null })
    return
  }
  const before = new Set(state.drafts.map((d) => d.id))
  const drafts = [...result.value].sort((a, b) => b.queuedAt - a.queuedAt)
  // The first read is a baseline, not an arrival.
  const arrived = state.loaded ? drafts.filter((d) => !before.has(d.id)) : []
  set({ drafts, loaded: true, error: null })
  lookUpTasks(drafts)
  if (arrived.length > 0) {
    for (const listener of arrivalListeners) {
      listener(arrived)
    }
  }
}

function subscribe(listener: Listener): () => void {
  listeners.add(listener)
  // Absent in web clients and tests that stub only part of the bridge.
  if (!stopChanges && window.api?.bots) {
    stopChanges = window.api.bots.onCommentDraftsChanged(() => void refreshCommentDrafts())
    void refreshCommentDrafts()
  }
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0 && stopChanges) {
      stopChanges()
      stopChanges = null
    }
  }
}

const getState = (): CommentDraftsFeed => state

export function useCommentDraftsFeed(): CommentDraftsFeed {
  return useSyncExternalStore(subscribe, getState, getState)
}

/** Drafts that appeared since the last read; the first read after start never counts. */
export function onCommentDraftsArrived(listener: (drafts: BotsCommentDraft[]) => void): () => void {
  arrivalListeners.add(listener)
  return () => arrivalListeners.delete(listener)
}

/** Test-only. */
export function resetCommentDraftsFeedForTests(): void {
  state = EMPTY
  listeners.clear()
  arrivalListeners.clear()
  requestedTasks.clear()
  stopChanges?.()
  stopChanges = null
  generation = 0
}
