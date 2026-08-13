// Draft rows for the workspace URL list. Keys stay stable while the user
// types; persisted state is the normalized href list (first = primary).

import { normalizeWebsiteUrl } from '../../../../shared/chat-workspace-site-info'

export type ChatWorkspaceUrlDraft = {
  key: string
  value: string
}

export function createUrlDraft(value = ''): ChatWorkspaceUrlDraft {
  return { key: crypto.randomUUID(), value }
}

export function draftsFromUrls(urls: string[]): ChatWorkspaceUrlDraft[] {
  return urls.map((url) => createUrlDraft(url))
}

export function urlsFromDrafts(drafts: readonly ChatWorkspaceUrlDraft[]): string[] {
  const seen = new Set<string>()
  const urls: string[] = []
  for (const draft of drafts) {
    const href = normalizeWebsiteUrl(draft.value)
    if (!href || seen.has(href)) {
      continue
    }
    seen.add(href)
    urls.push(href)
  }
  return urls
}

export function primaryDraftUrl(drafts: readonly ChatWorkspaceUrlDraft[]): string | undefined {
  for (const draft of drafts) {
    const href = normalizeWebsiteUrl(draft.value)
    if (href) {
      return href
    }
  }
  return undefined
}

export function moveUrlDraft(
  drafts: readonly ChatWorkspaceUrlDraft[],
  fromKey: string,
  toKey: string,
  after: boolean
): ChatWorkspaceUrlDraft[] {
  if (fromKey === toKey) {
    return [...drafts]
  }
  const fromIndex = drafts.findIndex((draft) => draft.key === fromKey)
  const toIndex = drafts.findIndex((draft) => draft.key === toKey)
  if (fromIndex < 0 || toIndex < 0) {
    return [...drafts]
  }
  const next = [...drafts]
  const [moved] = next.splice(fromIndex, 1)
  if (!moved) {
    return [...drafts]
  }
  const adjustedTo = fromIndex < toIndex ? toIndex - 1 : toIndex
  next.splice(adjustedTo + (after ? 1 : 0), 0, moved)
  return next
}
