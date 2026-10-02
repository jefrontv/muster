// One pane identity per chat thread for the whole app run. The view mounts on it
// before any process exists and every launch (first send, resume, model switch)
// reuses it, so the conversation never remounts. A fresh launch token per launch
// keeps a superseded child's late hooks out.

import { makePaneKey } from '../../../shared/stable-pane-id'
import { createBrowserUuid } from './browser-uuid'

export type ChatThreadPaneIdentity = { tabId: string; leafId: string; paneKey: string }

const identities = new Map<string, ChatThreadPaneIdentity>()

/** Idempotent, so it is safe to call during render. */
export function chatThreadPaneIdentity(threadId: string): ChatThreadPaneIdentity {
  const existing = identities.get(threadId)
  if (existing) {
    return existing
  }
  const tabId = createBrowserUuid()
  const leafId = createBrowserUuid()
  const identity = { tabId, leafId, paneKey: makePaneKey(tabId, leafId) }
  identities.set(threadId, identity)
  return identity
}

export function forgetChatThreadPaneIdentity(threadId: string): void {
  identities.delete(threadId)
}
