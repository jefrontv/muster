// Extra system-prompt text a view attaches to one chat thread, read when its session first starts.
const providers = new Map<string, () => string | null>()

export function setChatThreadExtraBrief(
  threadId: string,
  provider: (() => string | null) | null
): void {
  if (provider) {
    providers.set(threadId, provider)
  } else {
    providers.delete(threadId)
  }
}

export function chatThreadExtraBrief(threadId: string): string | null {
  return providers.get(threadId)?.() ?? null
}
