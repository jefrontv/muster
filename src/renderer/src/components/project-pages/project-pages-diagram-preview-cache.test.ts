import { describe, expect, it, vi } from 'vitest'
import type { ProjectPagesChange } from '../../../../shared/project-pages-types'
import {
  createDiagramPreviewCache,
  type ReadyDiagramPreview
} from './project-pages-diagram-preview-cache'

const author = { kind: 'agent' } as ProjectPagesChange['author']

function change(pageId: string, revision: number, scopeKey = 'repo:a'): ProjectPagesChange {
  return { scopeKey, pageId, revision, author }
}

function ready(revision: number): ReadyDiagramPreview {
  return { svg: `<svg data-rev="${revision}"/>`, empty: false, title: 'Flow', revision }
}

function deferred() {
  let resolve!: (value: ReadyDiagramPreview | null) => void
  const promise = new Promise<ReadyDiagramPreview | null>((r) => (resolve = r))
  return { promise, resolve }
}

describe('createDiagramPreviewCache', () => {
  it('re-renders an embed when its diagram saves a newer revision', async () => {
    let revision = 1
    const source = vi.fn(async () => ready(revision))
    const cache = createDiagramPreviewCache(source)
    const redraw = vi.fn()
    cache.subscribe(redraw)
    cache.load('repo:a', 'p1')
    await vi.waitFor(() => expect(cache.get('p1')).toMatchObject({ state: 'ready', revision: 1 }))

    revision = 2
    cache.changed(change('p1', 2))
    expect(cache.get('p1')).toMatchObject({ state: 'loading', revision: 2 })
    await vi.waitFor(() => expect(cache.get('p1')).toMatchObject({ state: 'ready', revision: 2 }))
    expect(source).toHaveBeenLastCalledWith('repo:a', 'p1')
    expect(redraw).toHaveBeenCalledTimes(2)
  })

  it('ignores pages it does not show and revisions it already has', async () => {
    const source = vi.fn(async () => ready(3))
    const cache = createDiagramPreviewCache(source)
    cache.load('repo:a', 'p1')
    await vi.waitFor(() => expect(cache.get('p1')).toMatchObject({ state: 'ready' }))
    cache.changed(change('p1', 3))
    cache.changed(change('other', 9))
    cache.changed({ scopeKey: 'repo:a', pageId: null, revision: null, author })
    expect(source).toHaveBeenCalledTimes(1)
  })

  it('loads once when several open editors hear the same change', async () => {
    const source = vi.fn(async () => ready(1))
    const cache = createDiagramPreviewCache(source)
    cache.load('repo:a', 'p1')
    await vi.waitFor(() => expect(cache.get('p1')).toMatchObject({ state: 'ready' }))
    cache.changed(change('p1', 2))
    cache.changed(change('p1', 2))
    expect(source).toHaveBeenCalledTimes(2)
  })

  it('keeps the newest load when an older one finishes last', async () => {
    const first = deferred()
    const second = deferred()
    const source = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    const cache = createDiagramPreviewCache(source)
    cache.load('repo:a', 'p1')
    cache.changed(change('p1', 2))
    second.resolve(ready(2))
    await vi.waitFor(() => expect(cache.get('p1')).toMatchObject({ state: 'ready', revision: 2 }))
    first.resolve(ready(1))
    await Promise.resolve()
    await Promise.resolve()
    expect(cache.get('p1')).toMatchObject({ state: 'ready', revision: 2 })
  })

  it('retries a page that was not a diagram once it changes', async () => {
    const source = vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(ready(4))
    const cache = createDiagramPreviewCache(source)
    cache.load('repo:a', 'p1')
    await vi.waitFor(() => expect(cache.get('p1')).toEqual({ state: 'none' }))
    cache.changed(change('p1', 4))
    await vi.waitFor(() => expect(cache.get('p1')).toMatchObject({ state: 'ready', revision: 4 }))
  })
})
