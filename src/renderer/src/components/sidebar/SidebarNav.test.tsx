// @vitest-environment happy-dom

import { act, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import { getDefaultSettings } from '../../../../shared/constants'
import type { GlobalSettings, Repo } from '../../../../shared/types'
import { i18n } from '../../i18n/i18n'
import { PSEUDO_LOCALIZATION_LOCALE } from '../../i18n/pseudo-localization'

const mocks = vi.hoisted(() => ({
  state: {} as Record<string, unknown>,
  openTaskPage: vi.fn(),
  openAutomationsPage: vi.fn(),
  openActivityPage: vi.fn(),
  openSitesPage: vi.fn(),
  openModal: vi.fn(),
  updateSettings: vi.fn(),
  refreshPreflightStatus: vi.fn(),
  checkLinearConnection: vi.fn(),
  checkActiveCollabConnection: vi.fn(),
  agentBucketCounts: { attention: 0, working: 0, idle: 0 },
  setSetupGuideSidebarDismissed: vi.fn()
}))

vi.mock('@/store', () => ({
  useAppStore: (selector: (state: Record<string, unknown>) => unknown) => selector(mocks.state)
}))

vi.mock('@/store/selectors', () => ({
  useRepoMap: () =>
    new Map(
      ((mocks.state.repos as Repo[] | undefined) ?? []).map((repo) => [repo.id, repo] as const)
    )
}))

vi.mock('@/components/activity/useActivityUnreadCount', () => ({
  useActivityUnreadCount: () => 0
}))

vi.mock('@/components/dashboard/useAgentBucketCounts', () => ({
  useAgentBucketCounts: () => mocks.agentBucketCounts
}))

vi.mock('@/hooks/useShortcutLabel', () => ({
  useShortcutKeyComboDetails: () => [{ keys: ['⌘', 'J'], doubleTap: false }]
}))

vi.mock('../setup-guide/use-setup-guide-progress', () => ({
  useSetupGuideProgress: () => ({
    ready: true,
    coreDoneCount: 0,
    coreTotal: 1,
    stepDone: {}
  })
}))

vi.mock('@/components/ui/context-menu', () => ({
  ContextMenu: ({ children }: { children: ReactNode }) => (
    <div data-testid="context-menu">{children}</div>
  ),
  ContextMenuTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  ContextMenuContent: ({ children }: { children: ReactNode }) => (
    <div data-testid="context-menu-content">{children}</div>
  ),
  ContextMenuItem: ({ children, onSelect }: { children: ReactNode; onSelect?: () => void }) => (
    <button type="button" onClick={onSelect}>
      {children}
    </button>
  )
}))

import {
  getSetupGuideSidebarEntryReady,
  shouldShowAgentDashboardButton,
  shouldShowAgentsButton,
  shouldShowAutomationsButton,
  shouldShowSetupGuideEntry
} from './SidebarNav'
import SidebarNav from './SidebarNav'

function gitRepo(): Repo {
  return {
    id: 'repo-1',
    path: '/tmp/repo-1',
    displayName: 'repo-1',
    badgeColor: 'gray',
    addedAt: 1,
    kind: 'git'
  }
}

function folderRepo(): Repo {
  return {
    id: 'folder-1',
    path: '/tmp/folder-1',
    displayName: 'folder-1',
    badgeColor: 'gray',
    addedAt: 1,
    kind: 'folder'
  }
}

function setSidebarState({
  settings = getDefaultSettings('/tmp'),
  repos = [gitRepo()],
  activeCollabConfigured = false
}: {
  settings?: GlobalSettings
  repos?: Repo[]
  activeCollabConfigured?: boolean
} = {}): void {
  mocks.state = {
    settings,
    repos,
    activeView: 'worktrees',
    openTaskPage: mocks.openTaskPage,
    openAutomationsPage: mocks.openAutomationsPage,
    openActivityPage: mocks.openActivityPage,
    openSitesPage: mocks.openSitesPage,
    openModal: mocks.openModal,
    updateSettings: mocks.updateSettings,
    preflightStatus: { glab: { installed: false } },
    preflightStatusChecked: true,
    refreshPreflightStatus: mocks.refreshPreflightStatus,
    linearStatus: { connected: false },
    linearStatusChecked: true,
    checkLinearConnection: mocks.checkLinearConnection,
    activeCollabStatus: { configured: activeCollabConfigured, connection: null, reason: '' },
    activeCollabStatusChecked: true,
    checkActiveCollabConnection: mocks.checkActiveCollabConnection,
    prefetchWorkItems: vi.fn(),
    activeRepoId: null,
    persistedUIReady: true,
    activeModal: null,
    setupGuideSidebarDismissed: true,
    setSetupGuideSidebarDismissed: mocks.setSetupGuideSidebarDismissed
  }
}

const mountedRoots: Root[] = []

async function renderSidebarNav(): Promise<HTMLDivElement> {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  mountedRoots.push(root)
  await act(async () => {
    root.render(
      <TooltipProvider>
        <SidebarNav />
      </TooltipProvider>
    )
  })
  return container
}

function queryButtonByText(container: ParentNode, text: string): HTMLButtonElement | null {
  return (
    Array.from(container.querySelectorAll<HTMLButtonElement>('button')).find(
      (button) => button.textContent?.trim() === text
    ) ?? null
  )
}

function getButtonByText(container: ParentNode, text: string): HTMLButtonElement {
  const button = queryButtonByText(container, text)
  if (!button) {
    throw new Error(`Button not found: ${text}`)
  }
  return button
}

function getHideButton(menu: Element): HTMLButtonElement {
  const button =
    Array.from(menu.querySelectorAll<HTMLButtonElement>('button')).find((candidate) =>
      candidate.textContent?.includes('Hide from sidebar')
    ) ?? null
  if (!button) {
    throw new Error('Hide from sidebar button not found')
  }
  return button
}

async function clickButton(button: HTMLButtonElement): Promise<void> {
  await act(async () => {
    button.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
}

describe('SidebarNav', () => {
  afterEach(async () => {
    await act(async () => {
      for (const root of mountedRoots.splice(0)) {
        root.unmount()
      }
    })
    document.body.innerHTML = ''
  })

  beforeEach(async () => {
    vi.clearAllMocks()
    await i18n.changeLanguage('en')
    mocks.agentBucketCounts = { attention: 0, working: 0, idle: 0 }
    setSidebarState()
  })

  it('hides the Agents entry while settings are loading', () => {
    expect(shouldShowAgentsButton(null)).toBe(false)
  })

  it('hides the Agents entry while the experimental Agents view is off', () => {
    expect(
      shouldShowAgentsButton({
        ...getDefaultSettings('/tmp'),
        experimentalActivity: false
      })
    ).toBe(false)
  })

  it('shows the Agents entry when the experimental Agents view is on', () => {
    expect(
      shouldShowAgentsButton({
        ...getDefaultSettings('/tmp'),
        experimentalActivity: true
      })
    ).toBe(true)
  })

  it('shows the Agent Dashboard entry only when its experiment is enabled', () => {
    expect(shouldShowAgentDashboardButton(null)).toBe(false)
    expect(shouldShowAgentDashboardButton({ experimentalAgentDashboardPopout: false })).toBe(false)
    expect(shouldShowAgentDashboardButton({ experimentalAgentDashboardPopout: true })).toBe(true)
  })

  it('keeps the Agent Dashboard row unmounted by default', async () => {
    const container = await renderSidebarNav()

    expect(queryButtonByText(container, 'Agent Dashboard')).toBeNull()
  })

  it('mounts the Agent Dashboard row after opt-in', async () => {
    setSidebarState({
      settings: {
        ...getDefaultSettings('/tmp'),
        experimentalAgentDashboardPopout: true
      }
    })
    const container = await renderSidebarNav()

    expect(queryButtonByText(container, 'Agent Dashboard')).not.toBeNull()
  })

  it('uses a question glyph only for the Needs You count', async () => {
    mocks.agentBucketCounts = { attention: 2, working: 3, idle: 4 }
    setSidebarState({
      settings: {
        ...getDefaultSettings('/tmp'),
        experimentalAgentDashboardPopout: true
      }
    })
    const container = await renderSidebarNav()

    const attention = container.querySelector('[aria-label="Needs You: 2"]')
    const working = container.querySelector('[aria-label="Working: 3"]')
    const idle = container.querySelector('[aria-label="Idle: 4"]')
    expect(attention?.querySelector('.lucide-message-circle-question-mark')).not.toBeNull()
    expect(working?.querySelector('.rounded-full')).not.toBeNull()
    expect(idle?.querySelector('.rounded-full')).not.toBeNull()
    expect(working?.querySelector('svg')).toBeNull()
    expect(idle?.querySelector('svg')).toBeNull()
  })

  it('updates localized labels when the language changes after mount', async () => {
    const container = await renderSidebarNav()

    expect(queryButtonByText(container, 'Automations')).not.toBeNull()
    expect(queryButtonByText(container, 'Sites')).not.toBeNull()

    await act(async () => {
      await i18n.changeLanguage('zh')
    })

    expect(queryButtonByText(container, '自动化')).not.toBeNull()
  })

  it('updates labels when pseudo-localization is enabled after mount', async () => {
    const container = await renderSidebarNav()

    await act(async () => {
      await i18n.changeLanguage(PSEUDO_LOCALIZATION_LOCALE)
    })

    expect(queryButtonByText(container, '[Automations]')).not.toBeNull()
    expect(queryButtonByText(container, '[Sites]')).not.toBeNull()
  })

  it('always shows the Sites entry and opens the Sites page', async () => {
    const container = await renderSidebarNav()

    const sites = queryButtonByText(container, 'Sites')
    expect(sites).not.toBeNull()

    await clickButton(sites as HTMLButtonElement)
    expect(mocks.openSitesPage).toHaveBeenCalledTimes(1)
  })

  it('sizes Sites like the other nav rows and leads the page list', async () => {
    const container = await renderSidebarNav()

    const sites = getButtonByText(container, 'Sites')
    const automations = getButtonByText(container, 'Automations')
    expect(sites.className).toContain('h-8')
    expect(automations.className).toContain('h-8')

    // Sites leads the stack: it is the row users reach for most, so it sits at the top rather than
    // below Tasks/Automations behind a divider.
    const tasks = getButtonByText(container, 'Tasks')
    expect(sites.compareDocumentPosition(tasks) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(
      sites.compareDocumentPosition(automations) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy()
  })

  it('isolates Search below the hairline instead of grouping it with the pages', async () => {
    const container = await renderSidebarNav()

    const separator = container.querySelector('[role="separator"]')
    if (!separator) {
      throw new Error('expected the nav hairline separator')
    }
    // Everything above the rule is a destination; Search is an action, and the rule is what stops
    // the two reading as one list.
    const sites = getButtonByText(container, 'Sites')
    // By label, not text: the row also renders its shortcut key caps.
    const search = container.querySelector('[aria-label="Search worktrees and browser tabs"]')
    if (!search) {
      throw new Error('expected the Search row')
    }
    expect(separator.compareDocumentPosition(sites) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy()
    expect(
      separator.compareDocumentPosition(search) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy()
  })

  it('shows the Automations entry by default for older settings', () => {
    expect(shouldShowAutomationsButton(null)).toBe(true)
    expect(shouldShowAutomationsButton({})).toBe(true)
  })

  it('hides the Automations entry when the sidebar setting is off', () => {
    expect(shouldShowAutomationsButton({ showAutomationsButton: false })).toBe(false)
  })

  it('omits the Automations row when the sidebar setting is off', async () => {
    setSidebarState({
      settings: {
        ...getDefaultSettings('/tmp'),
        showAutomationsButton: false
      }
    })

    const container = await renderSidebarNav()

    expect(queryButtonByText(container, 'Automations')).toBeNull()
  })

  it('hides Automations from its sidebar context menu', async () => {
    const container = await renderSidebarNav()

    const automationsMenu = getButtonByText(container, 'Automations').closest(
      '[data-testid="context-menu"]'
    )
    expect(automationsMenu).not.toBeNull()

    await clickButton(getHideButton(automationsMenu as HTMLElement))

    expect(mocks.updateSettings).toHaveBeenCalledWith({ showAutomationsButton: false })
  })

  it('hides the worktree palette shortcut until the search field is hovered or focused', async () => {
    const container = await renderSidebarNav()

    const searchButton = container.querySelector(
      'button[aria-label="Search worktrees and browser tabs"]'
    )
    expect(searchButton).not.toBeNull()

    const shortcuts = searchButton?.querySelector('span.hidden')
    expect(shortcuts?.className).toContain('hidden')
    expect(shortcuts?.className).toContain('group-hover:inline-flex')
    expect(shortcuts?.className).toContain('group-focus-within:inline-flex')
    expect(shortcuts?.textContent).toContain('⌘')
    expect(shortcuts?.textContent).toContain('J')
    expect(searchButton?.querySelector('kbd')).toBeNull()
  })

  it('hides task source shortcuts until the Tasks row is hovered or focused', async () => {
    const container = await renderSidebarNav()

    const tasksButton = getButtonByText(container, 'Tasks')
    // Why the container and not a child: this used to reach the wrapper via
    // `[aria-label="Open GitHub tasks"]`.parentElement, but the fork now defaults
    // `visibleTaskProviders` to ActiveCollab alone and this harness configures no provider
    // shortcuts, so that query returned undefined and every assertion below ran against
    // `undefined?.className` — passing vacuously. The affordance under test belongs to the
    // wrapper, so assert on the wrapper.
    const shortcuts = tasksButton.querySelector('span.group-hover\\:flex')
    expect(shortcuts).not.toBeNull()

    expect(shortcuts?.className).toContain('hidden')
    expect(shortcuts?.className).toContain('group-hover:flex')
    expect(shortcuts?.className).toContain('group-focus-within:flex')
  })

  it('hides available Tasks from its sidebar context menu', async () => {
    const container = await renderSidebarNav()

    const tasksButton = getButtonByText(container, 'Tasks')
    expect(tasksButton.getAttribute('aria-disabled')).toBe('false')

    const tasksMenu = tasksButton.closest('[data-testid="context-menu"]')
    expect(tasksMenu).not.toBeNull()
    await clickButton(getHideButton(tasksMenu as HTMLElement))

    expect(mocks.updateSettings).toHaveBeenCalledWith({ showTasksButton: false })
  })

  it('keeps unavailable Tasks context-menu-capable while left click remains inert', async () => {
    setSidebarState({ repos: [folderRepo()] })
    const container = await renderSidebarNav()

    const tasksButton = getButtonByText(container, 'Tasks')
    expect(tasksButton.getAttribute('aria-disabled')).toBe('true')
    expect(tasksButton.disabled).toBe(false)
    expect(tasksButton.querySelectorAll('[role="button"]')).toHaveLength(0)
    expect(tasksButton.querySelector('[aria-label="Open GitHub tasks"]')).toBeNull()

    await clickButton(tasksButton)
    expect(mocks.openTaskPage).not.toHaveBeenCalled()

    const tasksMenu = tasksButton.closest('[data-testid="context-menu"]')
    expect(tasksMenu).not.toBeNull()
    await clickButton(getHideButton(tasksMenu as HTMLElement))

    expect(mocks.updateSettings).toHaveBeenCalledWith({ showTasksButton: false })
  })

  it('unlocks Tasks after ActiveCollab login with no git repo', async () => {
    setSidebarState({ repos: [folderRepo()], activeCollabConfigured: true })
    const container = await renderSidebarNav()

    const tasksButton = getButtonByText(container, 'Tasks')
    expect(tasksButton.getAttribute('aria-disabled')).toBe('false')
    expect(tasksButton.className).not.toContain('cursor-not-allowed')

    await clickButton(tasksButton)
    expect(mocks.openTaskPage).toHaveBeenCalledTimes(1)
  })

  it('shows the setup guide entry only after readiness, before completion, and before explicit hide', () => {
    expect(
      shouldShowSetupGuideEntry({ ready: false, setupComplete: false, dismissed: false })
    ).toBe(false)
    expect(shouldShowSetupGuideEntry({ ready: true, setupComplete: false, dismissed: false })).toBe(
      true
    )
    expect(shouldShowSetupGuideEntry({ ready: true, setupComplete: true, dismissed: false })).toBe(
      false
    )
    expect(shouldShowSetupGuideEntry({ ready: true, setupComplete: false, dismissed: true })).toBe(
      false
    )
  })

  it('requires both persisted UI and setup progress readiness before showing setup guide entry', () => {
    expect(getSetupGuideSidebarEntryReady(false, true)).toBe(false)
    expect(getSetupGuideSidebarEntryReady(true, false)).toBe(false)
    expect(getSetupGuideSidebarEntryReady(true, true)).toBe(true)
  })
})
