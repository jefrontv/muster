// Paged Bitbucket JSON: follow `next` for small lists, otherwise fan out remaining `page=` URLs.

export type BitbucketPagedResponse = { ok: boolean; status: number; body: unknown }

export type BitbucketPagedFetch = (
  url: string,
  headers: Record<string, string>,
  signal?: AbortSignal
) => Promise<BitbucketPagedResponse>

export type BitbucketPageParse<T> = { items: T[]; next: string; size: number }

export type BitbucketPageCollect<T> = { items: T[]; error: string }

export async function mapPool<T, R>(
  items: readonly T[],
  limit: number,
  mapper: (item: T) => Promise<R>
): Promise<R[]> {
  if (items.length === 0) {
    return []
  }
  const results = Array.from({ length: items.length }) as R[]
  let cursor = 0
  const worker = async (): Promise<void> => {
    while (cursor < items.length) {
      const index = cursor
      cursor += 1
      results[index] = await mapper(items[index] as T)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()))
  return results
}

function remainingPageUrls(startUrl: string, lastPage: number): string[] {
  const urls: string[] = []
  for (let page = 2; page <= lastPage; page += 1) {
    const next = new URL(startUrl)
    next.searchParams.set('page', String(page))
    urls.push(next.toString())
  }
  return urls
}

export async function collectBitbucketPages<T>(args: {
  startUrl: string
  fetchJson: BitbucketPagedFetch
  headers: Record<string, string>
  signal?: AbortSignal
  parse: (body: unknown) => BitbucketPageParse<T>
  describeError: (status: number) => string
  pageLength: number
  maxPages: number
  maxItems?: number
  pageConcurrency: number
}): Promise<BitbucketPageCollect<T>> {
  const first = await fetchOnePage(args.startUrl, args)
  if (first.error.length > 0) {
    return first
  }
  const collected = [...first.items]
  const cap = args.maxItems
  if (doneCollecting(collected.length, cap) || first.next.length === 0) {
    return { items: sliceCap(collected, cap), error: '' }
  }

  // size > one page means we can address the rest by `page=` instead of walking `next`.
  if (first.size > args.pageLength) {
    const needed = cap && cap > 0 ? Math.min(first.size, cap) : first.size
    const lastPage = Math.min(args.maxPages, Math.ceil(needed / args.pageLength))
    const urls = remainingPageUrls(args.startUrl, lastPage)
    const pages = await mapPool(urls, args.pageConcurrency, (url) => fetchOnePage(url, args))
    for (const page of pages) {
      collected.push(...page.items)
      if (page.error.length > 0) {
        return { items: sliceCap(collected, cap), error: page.error }
      }
      if (doneCollecting(collected.length, cap)) {
        break
      }
    }
    return { items: sliceCap(collected, cap), error: '' }
  }

  return collectByNextLink(first.next, collected, args)
}

async function collectByNextLink<T>(
  start: string,
  collected: T[],
  args: Parameters<typeof collectBitbucketPages<T>>[0]
): Promise<BitbucketPageCollect<T>> {
  const seen = new Set<string>()
  let url = start
  for (let page = 1; page < args.maxPages && url.length > 0; page += 1) {
    if (seen.has(url) || doneCollecting(collected.length, args.maxItems)) {
      break
    }
    seen.add(url)
    const next = await fetchOnePage(url, args)
    collected.push(...next.items)
    if (next.error.length > 0) {
      return { items: sliceCap(collected, args.maxItems), error: next.error }
    }
    url = next.next
  }
  return { items: sliceCap(collected, args.maxItems), error: '' }
}

async function fetchOnePage<T>(
  url: string,
  args: Parameters<typeof collectBitbucketPages<T>>[0]
): Promise<BitbucketPageCollect<T> & BitbucketPageParse<T>> {
  const empty = { items: [] as T[], next: '', size: 0 }
  let response: BitbucketPagedResponse
  try {
    response = await args.fetchJson(url, args.headers, args.signal)
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    return { ...empty, error: `Could not reach Bitbucket: ${reason}` }
  }
  if (!response.ok) {
    return { ...empty, error: args.describeError(response.status) }
  }
  const parsed = args.parse(response.body)
  return { ...parsed, error: '' }
}

function doneCollecting(count: number, cap: number | undefined): boolean {
  return typeof cap === 'number' && cap > 0 && count >= cap
}

function sliceCap<T>(items: T[], cap: number | undefined): T[] {
  return typeof cap === 'number' && cap > 0 && items.length > cap ? items.slice(0, cap) : items
}
