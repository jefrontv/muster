// @vitest-environment happy-dom
//
// The chip contract this pane once got wrong: clicking a chip is an explicit view/edit selection
// that never rewrites site.activeEnvironment, the form follows the selection, and the divergence
// note appears exactly when the selection differs from what a run would target.
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import {
  createEmptySiteEnvironment,
  type Site,
  type SiteEnvironment,
  type SiteResult,
  type SiteSummary
} from '../../../../shared/site-types'
import { SiteDetailPanel } from './SiteDetailPanel'

// Runs and history have their own coverage; the environments section is what is under test.
vi.mock('./SiteRunConsole', () => ({
  useSiteRunConsole: () => ({}),
  SiteRunActionButton: () => null,
  SiteRunOutput: () => null
}))
vi.mock('./SiteRunHistory', () => ({ SiteRunHistory: () => null }))
// Snapshots reach for the confirmation-dialog context, which only exists under the app shell.
vi.mock('./SiteDbSnapshotsSection', () => ({ SiteDbSnapshotsSection: () => null }))
vi.mock('./SiteLocalStackControl', () => ({ SiteLocalStackControl: () => null }))

const storeMocks = vi.hoisted(() => ({
  updateSite: vi.fn().mockResolvedValue(null),
  setSiteSecret: vi.fn().mockResolvedValue(null),
  upsertSiteEnvironment: vi.fn().mockResolvedValue(null),
  copySiteEnvironment: vi.fn().mockResolvedValue(null),
  removeSiteEnvironment: vi.fn().mockResolvedValue(null)
}))

vi.mock('@/store', () => ({
  useAppStore: (selector: (state: typeof storeMocks) => unknown) => selector(storeMocks)
}))

let root: Root | null = null
let container: HTMLDivElement | null = null
let listBranchesMock: Mock<(siteId: string) => Promise<SiteResult<string[]>>>

function environment(overrides: Partial<SiteEnvironment> = {}): SiteEnvironment {
  return { ...createEmptySiteEnvironment(), ...overrides }
}

function summary(overrides: Partial<Site> = {}): SiteSummary {
  const site: Site = {
    id: 'site-1',
    path: '/tmp/muster-fixture/acme',
    repoId: null,
    displayName: 'Acme',
    localWpRoot: '',
    localDomain: '',
    localStack: 'plain',
    dbUser: '',
    dbSocket: '',
    dbPort: null,
    phpVersion: '',
    activeEnvironment: 'production',
    environments: {
      production: environment({ hostname: 'prod.example.com' }),
      dev: environment({ hostname: 'dev.example.com' })
    },
    notes: '',
    searchReplaceTimeoutSeconds: 0,
    ...overrides
  }
  return {
    site,
    pathExists: true,
    branch: 'main',
    // The branch matches nothing, so the run target resolves through activeEnvironment — the
    // precedence step chip clicks must not disturb.
    resolvedEnvironment: {
      environment: 'production',
      reason: 'active-environment',
      requiresConfirmation: true
    },
    secrets: Object.fromEntries(
      Object.keys(site.environments).map((name) => [name, { ssh: false, db: false }])
    ),
    importSelectedCount: 0,
    deploySelectedCount: 0
  }
}

async function render(fixture: SiteSummary): Promise<void> {
  await act(async () => {
    root?.render(<SiteDetailPanel summary={fixture} />)
  })
}

// The picker is a segmented ToggleGroup, so an environment is a `radio` carrying aria-checked —
// the same selection contract the older aria-pressed chips had.
function chip(name: string): HTMLButtonElement | null {
  return (
    [...document.body.querySelectorAll<HTMLButtonElement>('button[role="radio"]')].find(
      (button) => button.textContent?.trim() === name
    ) ?? null
  )
}

function selected(name: string): string | null | undefined {
  return chip(name)?.getAttribute('aria-checked')
}

function buttonByText(text: string): HTMLButtonElement | null {
  return (
    [...document.body.querySelectorAll('button')].find(
      (button) => button.textContent?.trim() === text
    ) ?? null
  )
}

async function click(element: HTMLElement | null): Promise<void> {
  expect(element).not.toBeNull()
  await act(async () => {
    element?.click()
  })
}

function hostnameValue(): string | undefined {
  // The SSH host field is the first environment text input; its value names the shown env.
  return [...document.body.querySelectorAll<HTMLInputElement>('input')].find((input) =>
    input.value.endsWith('.example.com')
  )?.value
}

beforeEach(() => {
  listBranchesMock = vi.fn().mockResolvedValue({ ok: true, value: [] })
  Reflect.set(globalThis.window, 'api', { sites: { listBranches: listBranchesMock } })
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
  vi.clearAllMocks()
})

describe('SiteDetailPanel environment chips', () => {
  it('shows the resolved run target with no divergence note', async () => {
    await render(summary())
    expect(hostnameValue()).toBe('prod.example.com')
    expect(selected('production')).toBe('true')
    expect(document.body.textContent).not.toContain('runs target')
  })

  it('switches the form to a clicked chip and notes the run-target divergence', async () => {
    await render(summary())
    await click(chip('dev'))

    expect(hostnameValue()).toBe('dev.example.com')
    expect(selected('dev')).toBe('true')
    expect(document.body.textContent).toContain('Editing dev — runs target production.')
    // Selection is view state only — nothing may write site.activeEnvironment.
    expect(storeMocks.updateSite).not.toHaveBeenCalled()
  })

  it('drops the divergence note when the selection returns to the run target', async () => {
    await render(summary())
    await click(chip('dev'))
    await click(chip('production'))

    expect(hostnameValue()).toBe('prod.example.com')
    expect(document.body.textContent).not.toContain('runs target')
  })

  it('edits land in the selected environment, not the run target', async () => {
    await render(summary())
    await click(chip('dev'))

    const input = [...document.body.querySelectorAll<HTMLInputElement>('input')].find(
      (candidate) => candidate.value === 'dev.example.com'
    )
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(
        input,
        'dev2.example.com'
      )
      input?.dispatchEvent(new Event('input', { bubbles: true }))
    })

    expect(storeMocks.upsertSiteEnvironment).toHaveBeenCalledWith('site-1', 'dev', {
      hostname: 'dev2.example.com'
    })
  })

  it('selects a newly created environment once it exists', async () => {
    const fixture = summary()
    await render(fixture)
    await click(buttonByText('Add'))
    await click(buttonByText('Create new environment'))

    const input = document.body.querySelector<HTMLInputElement>('input[role="combobox"]')
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(
        input,
        'staging'
      )
      input?.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await click(buttonByText('Create'))
    expect(storeMocks.upsertSiteEnvironment).toHaveBeenCalledWith('site-1', 'staging')

    // The store refresh re-renders the panel with the new environment present.
    await render(
      summary({
        environments: {
          ...fixture.site.environments,
          staging: environment({ hostname: 'staging.example.com' })
        }
      })
    )
    expect(selected('staging')).toBe('true')
    expect(hostnameValue()).toBe('staging.example.com')
    expect(document.body.textContent).toContain('Editing staging — runs target production.')
  })
})
