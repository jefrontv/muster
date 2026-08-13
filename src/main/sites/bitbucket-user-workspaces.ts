// CHANGE-2770: list the caller's workspaces. Unscoped GET /repositories is gone.

import {
  collectBitbucketPages,
  type BitbucketPageCollect,
  type BitbucketPagedFetch
} from './bitbucket-page-collection'

const BITBUCKET_API_BASE = 'https://api.bitbucket.org/2.0'

const PAGE_LENGTH = 100
const MAX_PAGES = 100
const WORKSPACE_FIELDS = 'size,next,values.workspace.slug,values.slug'

let cachedWorkspaceSlugs: string[] | null = null

export function bitbucketUserWorkspacesUrl(): string {
  const params = new URLSearchParams({
    pagelen: String(PAGE_LENGTH),
    fields: WORKSPACE_FIELDS
  })
  return `${BITBUCKET_API_BASE}/user/workspaces?${params.toString()}`
}

export function clearBitbucketWorkspaceSlugCache(): void {
  cachedWorkspaceSlugs = null
}

export async function listBitbucketUserWorkspaceSlugs(args: {
  fetchJson: BitbucketPagedFetch
  headers: Record<string, string>
  signal?: AbortSignal
  describeError: (status: number) => string
}): Promise<BitbucketPageCollect<string>> {
  if (cachedWorkspaceSlugs) {
    return { items: cachedWorkspaceSlugs, error: '' }
  }
  const workspaces = await collectBitbucketPages({
    startUrl: bitbucketUserWorkspacesUrl(),
    fetchJson: args.fetchJson,
    headers: args.headers,
    signal: args.signal,
    parse: toWorkspaceSlugs,
    describeError: args.describeError,
    pageLength: PAGE_LENGTH,
    maxPages: MAX_PAGES,
    pageConcurrency: 1
  })
  if (workspaces.error.length === 0) {
    cachedWorkspaceSlugs = workspaces.items
  }
  return workspaces
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {}
}

function asText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function workspaceSlugFromEntry(raw: unknown): string {
  const entry = asRecord(raw)
  return asText(asRecord(entry.workspace).slug) || asText(entry.slug)
}

function toWorkspaceSlugs(body: unknown): { items: string[]; next: string; size: number } {
  const page = asRecord(body)
  const size = page.size
  const values = Array.isArray(page.values) ? page.values : []
  const items: string[] = []
  const seen = new Set<string>()
  for (const raw of values) {
    const slug = workspaceSlugFromEntry(raw)
    if (slug.length === 0 || seen.has(slug)) {
      continue
    }
    seen.add(slug)
    items.push(slug)
  }
  return {
    items,
    next: asText(page.next),
    size: typeof size === 'number' && Number.isFinite(size) && size > 0 ? size : 0
  }
}
