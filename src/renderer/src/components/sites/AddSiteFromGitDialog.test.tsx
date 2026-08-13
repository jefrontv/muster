// @vitest-environment happy-dom
//
// The picker's search contract: the query goes to the provider, the provider's answer is shown as
// given, and only the newest answer may land. Everything here is about those three facts — the
// clone and setup steps have their own coverage.
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import type {
  CloneSourceListResult,
  CloneSourceProvider,
  CloneSourceRepo
} from '../../../../shared/site-clone-source-types'
import { AddSiteFromGitDialog } from './AddSiteFromGitDialog'

// The setup step mounts a whole site-configuration surface; the pick step is what is under test.
vi.mock('./SiteSetupContinuation', () => ({ SiteSetupContinuation: () => null }))

type ReposArgs = { provider: string; query?: string }
type ReposReply = { ok: true; value: CloneSourceListResult } | { ok: false; error: string }
type ReposMock = Mock<(args: ReposArgs) => Promise<ReposReply>>

const BITBUCKET: CloneSourceProvider = {
  id: 'bitbucket',
  label: 'Bitbucket',
  configured: true,
  reason: ''
}
const GITHUB: CloneSourceProvider = { id: 'github', label: 'GitHub', configured: true, reason: '' }

let root: Root | null = null
let container: HTMLDivElement | null = null
let reposMock: ReposMock

function repo(fullName: string, description = ''): CloneSourceRepo {
  return {
    provider: 'bitbucket',
    fullName,
    cloneUrl: `git@bitbucket.org:${fullName}.git`,
    description,
    updatedAt: null,
    isPrivate: true
  }
}

function listResult(overrides: Partial<CloneSourceListResult> = {}): CloneSourceListResult {
  return {
    provider: 'bitbucket',
    repos: [],
    error: '',
    truncated: false,
    searchesRemotely: true,
    ...overrides
  }
}

/** Every call answers with the same list — the shape most of these cases need. */
function alwaysReturns(overrides: Partial<CloneSourceListResult> = {}): ReposMock {
  return vi.fn(() => Promise.resolve({ ok: true as const, value: listResult(overrides) }))
}

function installApi(providers: CloneSourceProvider[], repos: ReposMock): void {
  reposMock = repos
  Reflect.set(globalThis.window, 'api', {
    siteCloneSources: {
      providers: vi.fn().mockResolvedValue({ ok: true, value: providers }),
      repos
    },
    repos: { onCloneProgress: () => () => {} },
    shell: { pickDirectory: vi.fn() },
    sites: { create: vi.fn() }
  })
}

async function render(): Promise<void> {
  await act(async () => {
    root?.render(
      <AddSiteFromGitDialog
        open
        destinationRoot="/tmp/muster-fixture/Sites"
        onOpenChange={() => {}}
        onAdded={() => {}}
      />
    )
  })
}

/** Radix portals the dialog out of the render container, so every query starts at the body. */
function listPane(): HTMLElement | null {
  return document.body.querySelector<HTMLElement>('.scrollbar-sleek')
}

function rows(): string[] {
  return [...(listPane()?.querySelectorAll('button') ?? [])].map(
    (row) => row.querySelector('span span')?.textContent ?? ''
  )
}

async function type(value: string): Promise<void> {
  const input = document.body.querySelector('input')
  await act(async () => {
    // React tracks the last value it wrote, so the native setter is the only way to make it see a
    // change event as a real edit.
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, value)
    input?.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

/** Past the debounce window, letting the queued request go out. */
async function settleSearch(): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(400)
  })
}

function queries(): (string | undefined)[] {
  return reposMock.mock.calls.map(([args]) => args.query)
}

beforeEach(() => {
  vi.useFakeTimers()
  installApi([BITBUCKET, GITHUB], alwaysReturns())
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  if (root) {
    act(() => root?.unmount())
  }
  container?.remove()
  root = null
  container = null
  vi.useRealTimers()
})

describe('AddSiteFromGitDialog search', () => {
  it('opens on the unfiltered list without waiting for a debounce', async () => {
    installApi([BITBUCKET, GITHUB], alwaysReturns({ repos: [repo('efront_au/117')] }))
    await render()

    expect(queries()).toEqual([''])
    expect(rows()).toEqual(['efront_au/117'])
  })

  it('debounces typing into one provider request carrying the query', async () => {
    await render()
    reposMock.mockClear()

    await type('s')
    await type('su')
    await type('sulo')
    expect(reposMock).not.toHaveBeenCalled()

    await settleSearch()
    expect(reposMock.mock.calls).toEqual([[{ provider: 'bitbucket', query: 'sulo' }]])
  })

  it('shows a provider match the local matcher would have hidden', async () => {
    // A host match on a field this component never reads: the point of not filtering twice.
    installApi([BITBUCKET, GITHUB], alwaysReturns({ repos: [repo('efront_au/117')] }))
    await render()
    await type('sulo')
    await settleSearch()

    expect(rows()).toEqual(['efront_au/117'])
  })

  it('ignores a slow earlier query so it cannot overwrite the newer one', async () => {
    const pending: ((reply: ReposReply) => void)[] = []
    installApi(
      [BITBUCKET, GITHUB],
      vi.fn((args: ReposArgs) => {
        if (args.query === '') {
          return Promise.resolve({ ok: true as const, value: listResult() })
        }
        const { promise, resolve } = Promise.withResolvers<ReposReply>()
        pending.push(resolve)
        return promise
      })
    )
    await render()

    await type('su')
    await settleSearch()
    await type('sulo')
    await settleSearch()
    expect(queries()).toEqual(['', 'su', 'sulo'])

    // The newest request answers first, then the stale one arrives late and must be dropped.
    await act(async () => {
      pending[1]?.({ ok: true, value: listResult({ repos: [repo('efront_au/sulo')] }) })
    })
    await act(async () => {
      pending[0]?.({ ok: true, value: listResult({ repos: [repo('efront_au/superseded')] }) })
    })

    expect(rows()).toEqual(['efront_au/sulo'])
  })

  it('names the term when nothing matched, and keeps a host error distinct from a miss', async () => {
    await render()
    await type('sulo')
    await settleSearch()
    expect(listPane()?.textContent).toContain('No repositories match “sulo”')

    reposMock.mockResolvedValue({
      ok: true,
      value: listResult({ error: 'Bitbucket rejected the stored credentials (HTTP 401).' })
    })
    await type('sulox')
    await settleSearch()
    const dialog = document.body.textContent ?? ''
    expect(dialog).toContain('Bitbucket rejected the stored credentials (HTTP 401).')
    // An error is not a miss: the "no match" line must not double up on it.
    expect(dialog).not.toContain('No repositories match')
  })

  it('reports an unconfigured provider as a reason instead of an empty search', async () => {
    installApi(
      [
        { ...BITBUCKET, configured: false, reason: 'Connect Bitbucket in Settings → Integrations.' }
      ],
      alwaysReturns()
    )
    await render()

    expect(document.body.textContent).toContain('Connect Bitbucket in Settings → Integrations.')
    expect(document.body.querySelector('input')).toBeNull()
  })

  it('filters locally and says so for a host that cannot search itself', async () => {
    installApi(
      [GITHUB],
      alwaysReturns({
        provider: 'github',
        repos: [repo('acme/api'), repo('acme/website', 'the marketing site')],
        truncated: true,
        searchesRemotely: false
      })
    )
    await render()
    expect(document.body.textContent).toContain('This host cannot search')

    await type('marketing')
    await settleSearch()

    // Filtered here, on description as well as name, and without a second request.
    expect(rows()).toEqual(['acme/website'])
    expect(queries()).toEqual([''])
  })
})
