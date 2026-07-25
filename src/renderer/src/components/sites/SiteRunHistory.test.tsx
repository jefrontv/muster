// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SiteRun, SiteRunEvent, SiteRunLogPage } from '../../../../shared/site-run-types'
import { runDuration } from './site-run-history-format'
import { SiteRunHistory } from './SiteRunHistory'

const SITE_ID = 'site-1'

function makeRun(overrides: Partial<SiteRun> = {}): SiteRun {
  return {
    id: 'run-1',
    siteId: SITE_ID,
    siteName: 'Acme',
    group: 'import',
    environment: 'production',
    branch: 'main',
    status: 'succeeded',
    startedAt: Date.parse('2026-07-25T01:00:00Z'),
    endedAt: Date.parse('2026-07-25T01:02:05Z'),
    error: null,
    logPath: '/logs/run-1/output.log',
    ...overrides
  }
}

function makeLogPage(overrides: Partial<SiteRunLogPage> = {}): SiteRunLogPage {
  return {
    run: makeRun(),
    lines: [
      { at: 1, level: 'status', text: 'Connecting to production' },
      { at: 2, level: 'info', text: 'Downloading database' },
      { at: 3, level: 'error', text: 'mysqldump exited 2: Access denied' },
      { at: 4, level: 'info', text: 'Cleaning up' }
    ],
    truncatedEarlier: 0,
    firstErrorIndex: 2,
    ...overrides
  }
}

let root: Root | null = null
let container: HTMLDivElement | null = null
let listMock: ReturnType<typeof vi.fn>
let readLogMock: ReturnType<typeof vi.fn>
let eventListeners: ((event: SiteRunEvent) => void)[]

function installApi(): void {
  listMock = vi.fn().mockResolvedValue({ ok: true, value: [makeRun()] })
  readLogMock = vi.fn().mockResolvedValue({ ok: true, value: makeLogPage() })
  eventListeners = []
  Object.defineProperty(globalThis, 'window', { value: globalThis.window, writable: true })
  // Only the two channels this component uses; anything else would be a silent dependency.
  Reflect.set(globalThis.window, 'api', {
    siteRuns: {
      list: listMock,
      readLog: readLogMock,
      onEvent: (callback: (event: SiteRunEvent) => void) => {
        eventListeners.push(callback)
        return () => {
          eventListeners = eventListeners.filter((entry) => entry !== callback)
        }
      }
    }
  })
}

async function render(): Promise<void> {
  await act(async () => {
    root?.render(<SiteRunHistory siteId={SITE_ID} />)
  })
}

function logLines(): HTMLElement[] {
  return [...(container?.querySelectorAll<HTMLElement>('[data-run-log-line]') ?? [])]
}

function findButton(label: string): HTMLButtonElement | undefined {
  return [...(container?.querySelectorAll('button') ?? [])].find((button) =>
    (button.textContent ?? '').includes(label)
  )
}

beforeEach(() => {
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

describe('runDuration', () => {
  it('splits an elapsed run into hours, minutes and seconds', () => {
    expect(runDuration({ startedAt: 0, endedAt: 3_725_000 })).toEqual({
      hours: 1,
      minutes: 2,
      seconds: 5
    })
  })

  it('reports no duration for a run that has not finished', () => {
    expect(runDuration({ startedAt: 0, endedAt: null })).toBeNull()
  })

  it('never reports a negative duration from a clock that moved backwards', () => {
    expect(runDuration({ startedAt: 5_000, endedAt: 1_000 })).toEqual({
      hours: 0,
      minutes: 0,
      seconds: 0
    })
  })
})

describe('SiteRunHistory', () => {
  it('renders a run list with status, group, environment and duration', async () => {
    listMock.mockResolvedValue({
      ok: true,
      value: [
        makeRun({ id: 'run-2', group: 'deploy', environment: 'staging', status: 'failed' }),
        makeRun()
      ]
    })
    await render()

    expect(listMock).toHaveBeenCalledWith({ siteId: SITE_ID, limit: 20 })
    const rows = [...(container?.querySelectorAll('li') ?? [])]
    expect(rows).toHaveLength(2)
    expect(rows[0].textContent).toContain('failed')
    expect(rows[0].textContent).toContain('deploy')
    expect(rows[0].textContent).toContain('staging')
    // 01:00:00 → 01:02:05 is 2m 5s.
    expect(rows[0].textContent).toContain('2m 5s')
    expect(rows[1].textContent).toContain('succeeded')
  })

  it('shows an empty state instead of a bare list when the site has no runs', async () => {
    listMock.mockResolvedValue({ ok: true, value: [] })
    await render()
    expect(container?.textContent).toContain('No runs recorded for this site yet.')
    expect(container?.querySelector('li')).toBeNull()
  })

  it('surfaces a list failure rather than rendering silence', async () => {
    listMock.mockResolvedValue({ ok: false, error: 'Unknown site: ghost' })
    await render()
    expect(container?.textContent).toContain('Unknown site: ghost')
  })

  it('loads the stored log on expand and marks the first error line', async () => {
    await render()
    expect(readLogMock).not.toHaveBeenCalled()

    await act(async () => {
      findButton('succeeded')?.click()
    })

    expect(readLogMock).toHaveBeenCalledWith({ siteId: SITE_ID, runId: 'run-1', lines: 2000 })
    const lines = logLines()
    expect(lines.map((line) => line.textContent)).toEqual([
      'Connecting to production',
      'Downloading database',
      'mysqldump exited 2: Access denied',
      'Cleaning up'
    ])
    // The first error is the one the jump control targets, and it is the only one marked.
    const marked = lines.filter((line) => line.className.includes('ring-destructive'))
    expect(marked).toHaveLength(1)
    expect(marked[0].dataset.runLogLine).toBe('2')
    expect(marked[0].dataset.runLogLevel).toBe('error')
  })

  it('scrolls the first error into view when the jump control is used', async () => {
    await render()
    await act(async () => {
      findButton('succeeded')?.click()
    })
    const errorLine = logLines()[2]
    const scrollIntoView = vi.fn()
    errorLine.scrollIntoView = scrollIntoView

    const jump = findButton('Jump to first error')
    expect(jump?.disabled).toBe(false)
    await act(async () => {
      jump?.click()
    })
    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'center' })
  })

  it('disables the jump control for a run that logged no error', async () => {
    readLogMock.mockResolvedValue({
      ok: true,
      value: makeLogPage({
        lines: [{ at: 1, level: 'info', text: 'All good' }],
        firstErrorIndex: -1
      })
    })
    await render()
    await act(async () => {
      findButton('succeeded')?.click()
    })
    expect(findButton('No errors logged')?.disabled).toBe(true)
  })

  it('reports how many earlier lines the tail dropped', async () => {
    readLogMock.mockResolvedValue({ ok: true, value: makeLogPage({ truncatedEarlier: 1200 }) })
    await render()
    await act(async () => {
      findButton('succeeded')?.click()
    })
    expect(container?.textContent).toContain('1200 earlier lines not shown')
  })

  it('collapses an expanded run and keeps only one open at a time', async () => {
    listMock.mockResolvedValue({
      ok: true,
      value: [makeRun(), makeRun({ id: 'run-2', environment: 'staging' })]
    })
    await render()

    await act(async () => {
      findButton('production')?.click()
    })
    expect(logLines()).toHaveLength(4)

    await act(async () => {
      findButton('staging')?.click()
    })
    expect(readLogMock).toHaveBeenCalledTimes(2)
    expect(readLogMock.mock.calls[1][0].runId).toBe('run-2')

    await act(async () => {
      findButton('staging')?.click()
    })
    expect(logLines()).toHaveLength(0)
  })

  it('refreshes when a run finishes, and ignores log and progress chatter', async () => {
    await render()
    expect(listMock).toHaveBeenCalledTimes(1)

    await act(async () => {
      for (const listener of eventListeners) {
        listener({ type: 'log', runId: 'run-9', line: { at: 1, level: 'info', text: 'noise' } })
        listener({
          type: 'progress',
          runId: 'run-9',
          stage: 'Downloading',
          transferred: 1,
          total: 2,
          percent: 50
        })
        listener({ type: 'status', runId: 'run-9', status: 'running' })
      }
    })
    expect(listMock).toHaveBeenCalledTimes(1)

    await act(async () => {
      for (const listener of eventListeners) {
        listener({ type: 'status', runId: 'run-9', status: 'succeeded' })
      }
    })
    expect(listMock).toHaveBeenCalledTimes(2)
  })

  it('shows a run-level error alongside its log', async () => {
    listMock.mockResolvedValue({
      ok: true,
      value: [makeRun({ status: 'failed', error: 'mysqldump exited 2' })]
    })
    await render()
    await act(async () => {
      findButton('failed')?.click()
    })
    expect(container?.textContent).toContain('mysqldump exited 2')
  })
})
