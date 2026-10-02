// @vitest-environment happy-dom
//
// Pins what the Local card shows for each answer a stack can give: the header pill, the rows, and
// which action is on offer. Detection is the only input, so each state is one fixture.

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import type { LocalWpStackDetection } from '../../../../shared/site-stack-types'
import type { SiteLocalStack, SiteSummary } from '../../../../shared/site-types'
import { TooltipProvider } from '@/components/ui/tooltip'
import { SiteLocalStackCard } from './SiteLocalStackCard'
import { siteStackDatabaseLabel } from './site-local-stack-details'
import { siteStackPill } from './site-stack-status-pill'
import { resetSiteStackStatusForTests } from './use-site-stack-status'

const SITE_ID = 'site-1'

function summary(stack: SiteLocalStack, overrides: Partial<SiteSummary['site']> = {}): SiteSummary {
  return {
    site: {
      id: SITE_ID,
      path: '/Users/dev/Sites/alchemy',
      repoId: 'repo-1',
      displayName: 'Alchemy',
      localWpRoot: '',
      localDomain: 'alchemy.ddev.site:8843',
      localStack: stack,
      dbUser: 'db',
      dbSocket: '',
      dbPort: null,
      phpVersion: '8.3',
      activeEnvironment: 'production',
      environments: {},
      notes: '',
      searchReplaceTimeoutSeconds: 0,
      ...overrides
    },
    pathExists: true,
    branch: 'main',
    resolvedEnvironment: {
      environment: null,
      reason: 'no-environments',
      requiresConfirmation: false
    },
    secrets: {},
    importSelectedCount: 0,
    deploySelectedCount: 0
  } as unknown as SiteSummary
}

function detection(overrides: Partial<LocalWpStackDetection> = {}): LocalWpStackDetection {
  return {
    supported: true,
    reason: '',
    stack: 'ddev',
    appRunning: true,
    registered: true,
    siteId: 'alchemy',
    domain: 'alchemy.ddev.site:8843',
    socketPath: '',
    socketReady: true,
    phpVersion: '8.3',
    url: 'https://alchemy.ddev.site:8843',
    docroot: '',
    databaseHost: '127.0.0.1',
    databasePort: 32790,
    databaseName: 'db',
    ...overrides
  }
}

let root: Root | null = null
let container: HTMLDivElement | null = null
let detect: Mock
let start: Mock

function installApi(answer: LocalWpStackDetection): void {
  detect = vi.fn().mockResolvedValue({ ok: true, value: answer })
  start = vi.fn().mockResolvedValue({
    ok: true,
    value: { ok: true, socketPath: '', state: 'started', message: 'Started alchemy.' }
  })
  Reflect.set(globalThis.window, 'api', {
    siteStacks: {
      detect,
      start,
      stop: vi.fn(),
      available: vi.fn().mockResolvedValue({ ok: true, value: ['localwp', 'agent-local', 'ddev'] }),
      agentLocalStatus: vi.fn().mockResolvedValue({ ok: false, error: 'n/a' })
    },
    sites: {
      onChanged: () => () => {},
      update: vi.fn().mockResolvedValue({ ok: false, error: 'not in this test' })
    },
    shell: { openUrl: vi.fn(), openInFileManager: vi.fn() },
    localwpCert: { trust: vi.fn() }
  })
}

async function render(site: SiteSummary): Promise<string> {
  await act(async () => {
    root?.render(
      <TooltipProvider>
        <SiteLocalStackCard summary={site} />
      </TooltipProvider>
    )
  })
  return container?.textContent ?? ''
}

function buttonLabels(): string[] {
  return [...(container?.querySelectorAll('button') ?? [])].map((entry) => entry.textContent ?? '')
}

function button(label: string): HTMLButtonElement | undefined {
  return [...(container?.querySelectorAll('button') ?? [])].find(
    (entry) => entry.textContent === label
  )
}

beforeEach(() => {
  Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true)
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
  resetSiteStackStatusForTests()
})

describe('SiteLocalStackCard', () => {
  it('shows a running DDEV site with its URL, PHP, docroot and database', async () => {
    installApi(detection())
    const text = await render(summary('ddev'))
    expect(text).toContain('Running')
    expect(text).toContain('alchemy.ddev.site:8843')
    expect(text).toContain('8.3')
    expect(text).toContain('127.0.0.1:32790 · db')
    expect(button('Stop')?.disabled).toBe(false)
    expect(button('Restart')?.disabled).toBe(false)
    expect(container?.querySelector('[aria-label="More actions"]')).not.toBeNull()
  })

  it('holds the sidebar card at its served height until detection answers', async () => {
    installApi(detection())
    detect.mockReturnValue(new Promise(() => {}))
    await act(async () => {
      root?.render(
        <TooltipProvider>
          <SiteLocalStackCard summary={summary('ddev')} compact />
        </TooltipProvider>
      )
    })
    const text = container?.textContent ?? ''
    expect(text).toContain('Site')
    expect(text).toContain('Database')
    expect(container?.querySelectorAll('.animate-pulse').length).toBe(5)
    expect(buttonLabels()).not.toContain('Stop')
  })

  it('holds the Sites page card at its served layout until detection answers', async () => {
    installApi(detection())
    detect.mockReturnValue(new Promise(() => {}))
    const text = await render(summary('ddev'))
    expect(text).toContain('Database')
    // Site, PHP and Database bars, plus Stop, Restart and ⋯ in the header.
    expect(container?.querySelectorAll('.animate-pulse').length).toBe(6)
    expect(buttonLabels()).not.toContain('Stop')
  })

  it('offers Start for a stopped site and keeps Restart in place but disabled', async () => {
    installApi(detection({ socketReady: false }))
    const text = await render(summary('ddev'))
    expect(text).toContain('Stopped')
    expect(button('Start')?.disabled).toBe(false)
    expect(button('Restart')?.disabled).toBe(true)
  })

  it('offers setup when the chosen stack does not serve the folder', async () => {
    installApi(detection({ stack: 'plain', socketReady: false }))
    const text = await render(summary('ddev'))
    expect(text).toContain('Not set up')
    expect(buttonLabels()).toContain('Set up with DDEV')
  })

  it('says Muster manages nothing when None is chosen', async () => {
    installApi(detection({ stack: 'plain' }))
    const text = await render(summary('plain', { localDomain: '' }))
    expect(text).toContain('doesn’t manage a local stack')
    expect(buttonLabels()).not.toContain('Start')
  })

  it('reports Docker down as unavailable with a Start Docker action', async () => {
    installApi(
      detection({ appRunning: false, socketReady: false, providerNote: "Docker isn't running." })
    )
    const text = await render(summary('ddev'))
    expect(text).toContain('Unavailable')
    expect(text).toContain("Docker isn't running.")
    expect(buttonLabels()).toContain('Start Docker')
    expect(button('Start')?.disabled).toBe(true)
  })

  it('surfaces a different stack serving the folder with a switch', async () => {
    installApi(detection({ stack: 'agent-local', domain: 'alchemy.local' }))
    const text = await render(summary('ddev'))
    expect(text).toContain('Agent Local serves this folder.')
    expect(buttonLabels()).toContain('Switch to it')
  })
})

describe('card helpers', () => {
  it('lets a transition win over the reported state', () => {
    expect(siteStackPill({ stack: 'ddev', detection: detection(), transition: 'stopping' })).toBe(
      'stopping'
    )
    expect(siteStackPill({ stack: 'plain', detection: detection(), transition: null })).toBeNull()
  })

  it('never shows more than an endpoint and schema for the database', () => {
    expect(siteStackDatabaseLabel('localwp', detection({ socketPath: '/tmp/mysqld.sock' }))).toBe(
      'socket'
    )
    expect(
      siteStackDatabaseLabel(
        'agent-local',
        detection({ databasePort: 10360, databaseName: 'al_alchemy' })
      )
    ).toBe('127.0.0.1:10360 · al_alchemy')
  })
})
