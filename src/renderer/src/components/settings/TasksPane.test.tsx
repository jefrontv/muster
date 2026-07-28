// @vitest-environment happy-dom

// Covers the Settings -> Tasks provider toggle and, through the same shared functions the Tasks page
// uses, what the source switcher ends up offering. The switcher itself lives in a 12k-line component
// that cannot be mounted in a unit test, so the derivation below is reproduced from
// TaskPage.tsx (`preferredVisibleTaskProviders` -> `restoreAvailableDefaultTaskProvider` ->
// `visibleSourceOptions`) using the identical shared helpers, plus an assertion that
// `getSourceOptions()` covers every provider so the final filter cannot hide one on its own.

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi, type Mock } from 'vitest'
import { getSourceOptions } from '@/components/task-page-localized-options'
import {
  TASK_PROVIDERS,
  normalizeVisibleTaskProviders,
  restoreAvailableDefaultTaskProvider,
  type TaskProvider
} from '../../../../shared/task-providers'
import type { GlobalSettings } from '../../../../shared/types'
import { TasksPane } from './TasksPane'

vi.mock('@/store', () => ({
  useAppStore: (selector: (state: { settingsSearchQuery: string }) => unknown) =>
    selector({ settingsSearchQuery: '' })
}))

type ProviderSettings = Pick<GlobalSettings, 'visibleTaskProviders' | 'defaultTaskSource'>

let root: Root | null = null
let container: HTMLDivElement | null = null

/** Neither GitLab nor Linear is installed on a bare machine, matching the Tasks page availability probe. */
const NOTHING_ELSE_INSTALLED = { gitlabInstalled: false, linearConnected: false }

function switcherLabels(settings: ProviderSettings): string[] {
  const visible = restoreAvailableDefaultTaskProvider(
    normalizeVisibleTaskProviders(settings.visibleTaskProviders),
    NOTHING_ELSE_INSTALLED,
    settings.defaultTaskSource
  )
  return getSourceOptions()
    .filter((option) => visible.includes(option.id))
    .map((option) => option.label)
}

function render(settings: ProviderSettings): {
  updateSettings: Mock
  rowFor: (label: string) => HTMLElement
} {
  const updateSettings = vi.fn()
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => {
    root?.render(
      <TasksPane settings={settings as GlobalSettings} updateSettings={updateSettings} />
    )
  })

  const rowFor = (label: string): HTMLElement => {
    const rows = [...(container?.querySelectorAll('[role="checkbox"]') ?? [])]
    const match = rows.find((row) => row.textContent?.includes(label))
    if (!(match instanceof HTMLElement)) {
      throw new Error(`No provider row for ${label}`)
    }
    return match
  }

  return { updateSettings, rowFor }
}

function click(element: HTMLElement): void {
  act(() => {
    element.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
}

const ACTIVECOLLAB_ONLY: ProviderSettings = {
  visibleTaskProviders: ['activecollab'],
  defaultTaskSource: 'activecollab'
}

afterEach(() => {
  act(() => {
    root?.unmount()
  })
  container?.remove()
  root = null
  container = null
  vi.clearAllMocks()
})

describe('TasksPane provider visibility', () => {
  it('offers every provider even though only ActiveCollab is visible', () => {
    const { rowFor } = render(ACTIVECOLLAB_ONLY)

    expect(rowFor('ActiveCollab').getAttribute('aria-checked')).toBe('true')
    for (const hidden of ['GitHub', 'GitLab', 'Linear', 'Jira']) {
      expect(rowFor(hidden).getAttribute('aria-checked')).toBe('false')
    }
  })

  it('has a source option for every provider so the switcher filter hides nothing on its own', () => {
    expect(getSourceOptions().map((option) => option.id)).toEqual([...TASK_PROVIDERS])
  })

  it('shows ActiveCollab alone in the switcher for a fresh profile', () => {
    expect(switcherLabels(ACTIVECOLLAB_ONLY)).toEqual(['ActiveCollab'])
  })

  it('puts a re-enabled provider back into the switcher', () => {
    const { updateSettings, rowFor } = render(ACTIVECOLLAB_ONLY)

    click(rowFor('GitHub'))

    const next = updateSettings.mock.calls[0]?.[0] as ProviderSettings
    expect(next.visibleTaskProviders).toEqual(['github', 'activecollab'])
    expect(next.defaultTaskSource).toBe('activecollab')
    expect(switcherLabels(next)).toEqual(['GitHub', 'ActiveCollab'])
  })

  it('removes a provider from the switcher when it is toggled back off', () => {
    const bothVisible: ProviderSettings = {
      visibleTaskProviders: ['github', 'activecollab'],
      defaultTaskSource: 'activecollab'
    }
    const { updateSettings, rowFor } = render(bothVisible)

    click(rowFor('GitHub'))

    const next = updateSettings.mock.calls[0]?.[0] as ProviderSettings
    expect(next.visibleTaskProviders).toEqual(['activecollab'])
    expect(switcherLabels(next)).toEqual(['ActiveCollab'])
  })

  it('drops a hidden provider even when it was the saved default', () => {
    const githubDefault: ProviderSettings = {
      visibleTaskProviders: ['github', 'activecollab'],
      defaultTaskSource: 'github'
    }
    const { updateSettings, rowFor } = render(githubDefault)

    click(rowFor('GitHub'))

    // The default has to move with the list: restoreAvailableDefaultTaskProvider keeps a saved
    // default reachable, so leaving `github` behind would re-add it to the switcher.
    const next = updateSettings.mock.calls[0]?.[0] as ProviderSettings
    expect(next.defaultTaskSource).toBe('activecollab')
    expect(switcherLabels(next)).toEqual(['ActiveCollab'])
  })

  it('refuses to hide the last visible provider so the switcher can never be empty', () => {
    const { updateSettings, rowFor } = render(ACTIVECOLLAB_ONLY)
    const row = rowFor('ActiveCollab')

    expect(row.getAttribute('aria-disabled')).toBe('true')
    click(row)

    expect(updateSettings).not.toHaveBeenCalled()
    expect(switcherLabels(ACTIVECOLLAB_ONLY)).toEqual(['ActiveCollab'])
  })

  it('keeps a hand-emptied provider list on ActiveCollab instead of restoring GitHub', () => {
    expect(
      switcherLabels({
        visibleTaskProviders: [] as TaskProvider[],
        defaultTaskSource: 'activecollab'
      })
    ).toEqual(['ActiveCollab'])
  })
})
