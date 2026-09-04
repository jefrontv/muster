// @vitest-environment happy-dom
//
// Covers the Source screen (repo picker + destination field) and the link target rows it hands
// off to Review for a link source. Both share this file because they are the two pieces this task
// owns and neither warrants its own fixture-heavy suite.

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  CloneSourceProvider,
  CloneSourceRepo
} from '../../../../shared/site-clone-source-types'
import type { PendingSiteBind } from '../../../../shared/site-bind-types'
import { TooltipProvider } from '@/components/ui/tooltip'
import { SiteSetupSourceScreen } from './SiteSetupSourceScreen'
import { SiteSetupLinkTargetRows, type SiteSetupLinkTarget } from './SiteSetupLinkTargetRows'

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const BITBUCKET: CloneSourceProvider = {
  id: 'bitbucket',
  label: 'Bitbucket',
  configured: true,
  reason: ''
}
const GITHUB_UNCONFIGURED: CloneSourceProvider = {
  id: 'github',
  label: 'GitHub',
  configured: false,
  reason: 'Run `gh auth login` in a terminal, then come back.'
}

const REPO: CloneSourceRepo = {
  provider: 'bitbucket',
  fullName: 'efront_au/flex',
  cloneUrl: 'git@bitbucket.org:efront_au/flex.git',
  description: 'Flex theme',
  updatedAt: null,
  isPrivate: false
}

let root: Root | null = null
let container: HTMLDivElement | null = null

function flush(): Promise<void> {
  return act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root?.unmount())
  container?.remove()
  root = null
  container = null
  vi.restoreAllMocks()
})

describe('SiteSetupSourceScreen', () => {
  it('picks a repo and calls onPick when a destination is already configured', async () => {
    Reflect.set(globalThis.window, 'api', {
      siteCloneSources: {
        providers: vi.fn().mockResolvedValue({ ok: true, value: [BITBUCKET] }),
        repos: vi.fn().mockResolvedValue({
          ok: true,
          value: {
            provider: 'bitbucket',
            repos: [REPO],
            error: '',
            truncated: false,
            searchesRemotely: true
          }
        })
      },
      shell: { pickDirectory: vi.fn() },
      ui: { writeClipboardText: vi.fn() }
    })

    const onPick = vi.fn()
    await act(async () => {
      root?.render(
        <TooltipProvider>
          <SiteSetupSourceScreen
            destinationRoot="/Users/j/Documents/Sites"
            onDestinationChange={() => {}}
            onPick={onPick}
            onCancel={() => {}}
          />
        </TooltipProvider>
      )
    })
    await flush()

    const repoButton = Array.from(document.body.querySelectorAll('button')).find((el) =>
      el.textContent?.includes('efront_au/flex')
    )
    expect(repoButton).toBeTruthy()
    act(() => repoButton?.click())

    expect(onPick).toHaveBeenCalledWith(REPO)
  })

  it('refuses the pick and shows the guard when no destination is configured', async () => {
    Reflect.set(globalThis.window, 'api', {
      siteCloneSources: {
        providers: vi.fn().mockResolvedValue({ ok: true, value: [BITBUCKET] }),
        repos: vi.fn().mockResolvedValue({
          ok: true,
          value: {
            provider: 'bitbucket',
            repos: [REPO],
            error: '',
            truncated: false,
            searchesRemotely: true
          }
        })
      },
      shell: { pickDirectory: vi.fn() },
      ui: { writeClipboardText: vi.fn() }
    })

    const onPick = vi.fn()
    await act(async () => {
      root?.render(
        <TooltipProvider>
          <SiteSetupSourceScreen
            destinationRoot=""
            onDestinationChange={() => {}}
            onPick={onPick}
            onCancel={() => {}}
          />
        </TooltipProvider>
      )
    })
    await flush()

    const repoButton = Array.from(document.body.querySelectorAll('button')).find((el) =>
      el.textContent?.includes('efront_au/flex')
    )
    act(() => repoButton?.click())

    expect(onPick).not.toHaveBeenCalled()
    expect(document.body.textContent).toContain('Choose a folder first.')
  })

  it('shows the reason and a Copy command button for an unconfigured GitHub', async () => {
    Reflect.set(globalThis.window, 'api', {
      siteCloneSources: {
        providers: vi.fn().mockResolvedValue({ ok: true, value: [GITHUB_UNCONFIGURED] }),
        repos: vi.fn().mockResolvedValue({
          ok: true,
          value: {
            provider: 'github',
            repos: [],
            error: '',
            truncated: false,
            searchesRemotely: true
          }
        })
      },
      shell: { pickDirectory: vi.fn() },
      ui: { writeClipboardText: vi.fn() }
    })

    await act(async () => {
      root?.render(
        <TooltipProvider>
          <SiteSetupSourceScreen
            destinationRoot="/Users/j/Documents/Sites"
            onDestinationChange={() => {}}
            onPick={() => {}}
            onCancel={() => {}}
          />
        </TooltipProvider>
      )
    })
    await flush()

    expect(document.body.textContent).toContain(GITHUB_UNCONFIGURED.reason)
    const copyButton = Array.from(document.body.querySelectorAll('button')).find((el) =>
      el.textContent?.includes('Copy command')
    )
    expect(copyButton).toBeTruthy()
  })
})

describe('SiteSetupLinkTargetRows', () => {
  const pending: PendingSiteBind = {
    requestId: 'req-1',
    receivedAt: Date.now(),
    fields: {
      reponame: 'efront_au/flex',
      hostname: 'tools.efront.dev',
      username: 'tools',
      rootPath: '/home/tools/flex',
      liveDomain: '',
      liveDomainProtocol: 'https',
      localDomain: 'flex.local',
      environment: 'main',
      checkoutBranch: 'main',
      deployCommand: '',
      themeDistPath: '',
      notes: ''
    },
    passwordProvided: true,
    candidates: [
      {
        path: '/Users/j/Documents/Sites/flex',
        displayName: 'flex',
        siteId: null,
        repoId: 'repo-1',
        exists: true
      }
    ],
    suggestedCloneUrl: 'git@bitbucket.org:efront_au/flex.git'
  }

  beforeEach(() => {
    Reflect.set(globalThis.window, 'api', { repos: { pickDirectory: vi.fn() } })
  })

  it('renders the existing candidate labelled as an existing checkout', async () => {
    await act(async () => {
      root?.render(
        <SiteSetupLinkTargetRows
          pending={pending}
          primaryRoot="/Users/j/Documents/Sites"
          cloneUrl="git@bitbucket.org:efront_au/flex.git"
          value={null}
          onChange={() => {}}
        />
      )
    })

    const options = [...document.body.querySelectorAll<HTMLButtonElement>('[role=radio]')]
    expect(options.length).toBeGreaterThanOrEqual(2)
    expect(options[0]?.textContent).toContain('flex')
    expect(options[0]?.textContent).toContain('Existing checkout')
    // The path is shown abbreviated, not as the raw absolute string.
    expect(options[0]?.textContent).toContain('~/Documents/Sites/flex')
  })

  it('emits a clone target when the clone option is selected', async () => {
    let value: SiteSetupLinkTarget | null = null
    const onChange = vi.fn((next: SiteSetupLinkTarget) => {
      value = next
    })
    await act(async () => {
      root?.render(
        <SiteSetupLinkTargetRows
          pending={pending}
          primaryRoot="/Users/j/Documents/Sites"
          cloneUrl="git@bitbucket.org:efront_au/flex.git"
          value={null}
          onChange={onChange}
        />
      )
    })

    const cloneOption = [...document.body.querySelectorAll<HTMLButtonElement>('[role=radio]')].find(
      (option) => /Clone efront_au\/flex/.test(option.textContent ?? '')
    )
    expect(cloneOption).toBeTruthy()
    act(() => cloneOption?.click())

    expect(onChange).toHaveBeenCalledWith({ kind: 'clone', root: '/Users/j/Documents/Sites' })
    expect(value).toEqual({ kind: 'clone', root: '/Users/j/Documents/Sites' })
  })
})
