// @vitest-environment happy-dom
//
// Pins the quick-action gating and run streaming of the right-sidebar Site tab: a run must never
// start with zero enabled steps, must target the resolved environment, and must stream inline.

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import type { SiteRunEvent } from '../../../../shared/site-run-types'
import type { SiteSummary } from '../../../../shared/site-types'
import { TooltipProvider } from '@/components/ui/tooltip'
import { SitePanelContent } from './SitePanel'

const confirmMock = vi.hoisted(() => vi.fn())

vi.mock('@/components/confirmation-dialog', () => ({
  useConfirmationDialog: () => confirmMock
}))

const SITE_ID = 'site-1'

function makeSummary(overrides: Partial<SiteSummary> = {}): SiteSummary {
  return {
    site: {
      id: SITE_ID,
      path: '/Users/dev/Sites/acme',
      repoId: 'repo-1',
      displayName: 'Acme',
      localWpRoot: 'app/public',
      localDomain: 'acme.local',
      localStack: 'localwp',
      dbUser: 'root',
      dbSocket: '/tmp/mysql.sock',
      dbPort: null,
      phpVersion: '8.2',
      activeEnvironment: 'production',
      environments: {
        production: {
          hostname: 'dedicated-11.example.com',
          sshPort: '',
          username: 'acme',
          rootPath: 'public_html',
          liveDomain: 'acme.com',
          liveDomainProtocol: 'https',
          deployCommand: '',
          themeDistPath: '',
          exportDatabase: true,
          exportFiles: true,
          wpSearchReplace: true,
          wpUploadRewrite: false,
          gitPullOnServer: false,
          clearServerCache: false,
          deployThemes: false
        }
      },
      notes: '',
      searchReplaceTimeoutSeconds: 0
    },
    pathExists: true,
    branch: 'main',
    resolvedEnvironment: {
      environment: 'production',
      reason: 'branch-match',
      requiresConfirmation: false
    },
    secrets: { production: { ssh: true, db: true } },
    importSelectedCount: 3,
    deploySelectedCount: 2,
    ...overrides
  }
}

let root: Root | null = null
let container: HTMLDivElement | null = null
let startMock: Mock
let listMock: Mock
let onRunSettled: Mock
let runEventListeners: ((event: SiteRunEvent) => void)[]
let upsertEnvironmentMock: Mock

function emitRunEvent(event: SiteRunEvent): void {
  for (const listener of runEventListeners) {
    listener(event)
  }
}

function installApi(runs: unknown[] = []): void {
  startMock = vi.fn().mockResolvedValue({
    ok: true,
    value: {
      id: 'run-1',
      siteId: SITE_ID,
      siteName: 'Acme',
      group: 'import',
      environment: 'production',
      branch: 'main',
      status: 'running',
      startedAt: Date.now(),
      endedAt: null,
      error: null,
      logPath: ''
    }
  })
  listMock = vi.fn().mockResolvedValue({ ok: true, value: runs })
  runEventListeners = []
  Reflect.set(globalThis.window, 'api', {
    siteRuns: {
      start: startMock,
      cancel: vi.fn().mockResolvedValue({ ok: true, value: true }),
      list: listMock,
      active: vi.fn().mockResolvedValue({ ok: true, value: [] }),
      readLog: vi.fn().mockResolvedValue({
        ok: true,
        value: { run: null, lines: [], truncatedEarlier: 0, firstErrorIndex: -1 }
      }),
      onEvent: (callback: (event: SiteRunEvent) => void) => {
        runEventListeners.push(callback)
        return () => {
          runEventListeners = runEventListeners.filter((entry) => entry !== callback)
        }
      }
    },
    notifications: { dispatch: vi.fn().mockResolvedValue(undefined) },
    sites: { upsertEnvironment: upsertEnvironmentMock }
  })
}

async function render(summary: SiteSummary): Promise<void> {
  await act(async () => {
    root?.render(
      <TooltipProvider>
        <SitePanelContent summary={summary} onOpenInSites={() => {}} onRunSettled={onRunSettled} />
      </TooltipProvider>
    )
  })
}

function findButton(label: string): HTMLButtonElement {
  const button = [...(container?.querySelectorAll('button') ?? [])].find((entry) =>
    (entry.textContent ?? '').includes(label)
  )
  if (!button) {
    throw new Error(`button "${label}" not found`)
  }
  return button
}

beforeEach(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  confirmMock.mockReset().mockResolvedValue(true)
  onRunSettled = vi.fn()
  upsertEnvironmentMock = vi.fn().mockResolvedValue({ ok: true, value: {} })
  installApi()
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
})

describe('SitePanelContent', () => {
  it('renders the compact configuration rows', async () => {
    await render(makeSummary())
    const text = container?.textContent ?? ''
    expect(text).toContain('Acme')
    expect(text).toContain('/Users/dev/Sites/acme')
    expect(text).toContain('acme.local')
    expect(text).toContain('app/public')
    expect(text).toContain('dedicated-11.example.com')
    expect(text).toContain('acme.com')
    expect(text).toContain('Branch main targets production.')
  })

  it('disables Import at zero enabled steps and never starts a run', async () => {
    await render(makeSummary({ importSelectedCount: 0 }))
    const importButton = findButton('Import')
    expect(importButton.getAttribute('aria-disabled')).toBe('true')
    await act(async () => {
      importButton.click()
    })
    expect(startMock).not.toHaveBeenCalled()
  })

  it('starts an import against the resolved environment and streams its log', async () => {
    await render(makeSummary())
    await act(async () => {
      findButton('Import').click()
    })
    expect(startMock).toHaveBeenCalledWith({
      siteId: SITE_ID,
      group: 'import',
      environment: 'production'
    })
    expect(confirmMock).not.toHaveBeenCalled()

    await act(async () => {
      emitRunEvent({
        type: 'log',
        runId: 'run-1',
        line: { at: 1, level: 'info', text: 'Pulling database…' }
      })
    })
    expect(container?.textContent).toContain('Pulling database…')

    await act(async () => {
      emitRunEvent({ type: 'status', runId: 'run-1', status: 'succeeded' })
    })
    expect(container?.textContent).toContain('succeeded')
    expect(onRunSettled).toHaveBeenCalled()
  })

  it('adopts and streams a run started outside the panel', async () => {
    await render(makeSummary())
    const externalRun = {
      id: 'run-x',
      siteId: SITE_ID,
      siteName: 'Acme',
      group: 'deploy',
      environment: 'production',
      branch: 'main',
      status: 'running',
      startedAt: Date.now(),
      endedAt: null,
      error: null,
      logPath: ''
    }
    const api = Reflect.get(globalThis.window, 'api') as unknown as {
      siteRuns: { active: Mock; readLog: Mock }
    }
    api.siteRuns.active.mockResolvedValue({
      ok: true,
      value: [{ run: externalRun, progress: null }]
    })
    api.siteRuns.readLog.mockResolvedValue({
      ok: true,
      value: {
        run: externalRun,
        lines: [{ at: 1, level: 'info', text: 'Building theme…' }],
        truncatedEarlier: 0,
        firstErrorIndex: -1
      }
    })
    await act(async () => {
      emitRunEvent({
        type: 'log',
        runId: 'run-x',
        line: { at: 1, level: 'info', text: 'Building theme…' }
      })
    })
    // The adoption probe resolves across two promise hops; drain them before asserting.
    await act(async () => {})
    const text = container?.textContent ?? ''
    expect(text).toContain('deploy · production · running')
    expect(text).toContain('Building theme…')
  })

  it('asks for confirmation before running when the branch matches no environment', async () => {
    confirmMock.mockResolvedValue(false)
    await render(
      makeSummary({
        resolvedEnvironment: {
          environment: 'production',
          reason: 'active-environment',
          requiresConfirmation: true
        }
      })
    )
    await act(async () => {
      findButton('Deploy').click()
    })
    expect(confirmMock).toHaveBeenCalledTimes(1)
    expect(startMock).not.toHaveBeenCalled()

    confirmMock.mockResolvedValue(true)
    await act(async () => {
      findButton('Deploy').click()
    })
    expect(startMock).toHaveBeenCalledWith({
      siteId: SITE_ID,
      group: 'deploy',
      environment: 'production'
    })
  })

  it('renders the recent runs with their status', async () => {
    installApi([
      {
        id: 'run-9',
        siteId: SITE_ID,
        siteName: 'Acme',
        group: 'import',
        environment: 'production',
        branch: 'main',
        status: 'succeeded',
        startedAt: Date.now() - 120_000,
        endedAt: Date.now() - 60_000,
        error: null,
        logPath: ''
      },
      {
        id: 'run-8',
        siteId: SITE_ID,
        siteName: 'Acme',
        group: 'deploy',
        environment: 'production',
        branch: 'main',
        status: 'failed',
        startedAt: Date.now() - 240_000,
        endedAt: Date.now() - 180_000,
        error: 'rsync exited 12',
        logPath: ''
      }
    ])
    await render(makeSummary())
    expect(listMock).toHaveBeenCalledWith({ siteId: SITE_ID, limit: 5 })
    const text = container?.textContent ?? ''
    expect(text).toContain('Recent runs')
    expect(text).toContain('succeeded')
    expect(text).toContain('failed')
    expect(text).toContain('deploy · production')
  })

  // Why: the step set is what a run varies on; editing it here is the panel's whole point.
  it('unchecking an enabled step writes false to the resolved environment without a refetch', async () => {
    await render(makeSummary())
    const checkbox = container?.querySelector('[role="checkbox"]') as HTMLButtonElement | null
    expect(checkbox).not.toBeNull()
    await act(async () => {
      checkbox?.click()
    })
    expect(upsertEnvironmentMock).toHaveBeenCalledTimes(1)
    const args = upsertEnvironmentMock.mock.calls[0][0] as {
      siteId: string
      name: string
      patch: Record<string, boolean>
    }
    expect(args.siteId).toBe(SITE_ID)
    expect(args.name).toBe('production')
    // Fixture's first import step (exportDatabase) starts true, so the click disables it.
    expect(args.patch).toEqual({ exportDatabase: false })
    // The write's own returned summary patches the store; the full-list refetch (one git spawn
    // per site) is exactly what made the toggles feel stuck, so it must NOT run here.
    expect(onRunSettled).not.toHaveBeenCalled()
  })

  it('surfaces a failed toggle write instead of refetching', async () => {
    upsertEnvironmentMock.mockResolvedValue({ ok: false, error: 'site is gone' })
    await render(makeSummary())
    const checkbox = container?.querySelector('[role="checkbox"]') as HTMLButtonElement | null
    await act(async () => {
      checkbox?.click()
    })
    expect(container?.textContent ?? '').toContain('site is gone')
    expect(onRunSettled).not.toHaveBeenCalled()
  })

  // Why: an MCP-started run lives in another process; only the poll can surface its chip.
  it('surfaces an externally started run via the poll, without any event', async () => {
    vi.useFakeTimers()
    try {
      await render(makeSummary())
      expect(container?.textContent ?? '').not.toContain('running')
      listMock.mockResolvedValue({
        ok: true,
        value: [
          {
            id: 'mcp-run-1',
            siteId: SITE_ID,
            siteName: 'Acme',
            group: 'import',
            environment: 'production',
            branch: 'main',
            status: 'running',
            startedAt: Date.now(),
            endedAt: null,
            error: null,
            logPath: ''
          }
        ]
      })
      await act(async () => {
        await vi.advanceTimersByTimeAsync(2_600)
      })
      expect(container?.textContent ?? '').toContain('running')
      expect(onRunSettled).toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })
})
