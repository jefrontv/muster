// Where the Pages view opens: the last place for this session, or a page an entry point picked.
const lastPageByScope = new Map<string, string>()
let lastScopeKey: string | null = null

export function rememberPagesLocation(scopeKey: string | null, pageId?: string | null): void {
  lastScopeKey = scopeKey
  if (scopeKey && pageId) {
    lastPageByScope.set(scopeKey, pageId)
  }
}

export function lastPagesScope(): string | null {
  return lastScopeKey
}

export function lastPageIn(scopeKey: string | null): string | undefined {
  return scopeKey ? lastPageByScope.get(scopeKey) : undefined
}
