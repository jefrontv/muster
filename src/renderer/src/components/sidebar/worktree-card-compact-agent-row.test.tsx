import { renderToStaticMarkup } from 'react-dom/server'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DashboardAgentRow as DashboardAgentRowData } from '@/components/dashboard/useDashboardData'

type MockAgentOptions = {
  paneKey?: string
  tabId?: string
  agentType?: string
  rowSource?: DashboardAgentRowData['rowSource']
  state?: string
  startedAt?: number
  prompt?: string
  lastAssistantMessage?: string
  stateStartedAt?: number
  terminalHandle?: string
  orchestration?: {
    parentPaneKey?: string
    parentTerminalHandle?: string
    coordinatorHandle?: string
  }
  lineage?: {
    depth: number
    isFirstSibling: boolean
    isLastSibling: boolean
    childCount: number
  }
}

function mockAgent({
  paneKey = 'tab-1:1',
  tabId = paneKey.split(':')[0],
  agentType,
  rowSource,
  state = 'working',
  startedAt,
  prompt,
  lastAssistantMessage,
  stateStartedAt = 1000,
  terminalHandle,
  orchestration,
  lineage
}: MockAgentOptions = {}): unknown {
  return {
    paneKey,
    tab: { id: tabId },
    agentType,
    rowSource,
    state,
    startedAt,
    entry: {
      prompt,
      lastAssistantMessage,
      state,
      stateStartedAt,
      stateHistory: prompt === undefined ? undefined : [],
      terminalHandle,
      orchestration
    },
    lineage
  }
}

let mockAgents: unknown[] = [mockAgent()]
let mockFocusedAgentPaneKey: string | null = null
let mockAgentActivityDisplayMode: 'compact' | 'full' | undefined
let mockPromptCacheTimerEnabled = true
let mockPromptCacheTtlMs = 60_000
let mockCacheTimerByKey: Record<string, number | null> = {}
let capturedRowActivations: {
  paneKey: string
  onActivate: (tabId: string, paneKey: string) => void
}[] = []

const activationMocks = vi.hoisted(() => ({
  activateAndRevealWorktree: vi.fn(),
  activateTabAndFocusPane: vi.fn()
}))

vi.mock('@/store', () => ({
  useAppStore: (selector: (state: unknown) => unknown) =>
    selector({
      agentActivityDisplayMode: mockAgentActivityDisplayMode,
      acknowledgedAgentsByPaneKey: {},
      cacheTimerByKey: mockCacheTimerByKey,
      dropAgentStatus: vi.fn(),
      dismissRetainedAgent: vi.fn(),
      acknowledgeAgents: vi.fn(),
      agentSendPopoverTargetMode: null,
      agentStatusByPaneKey: {},
      tabsByWorktree: {},
      terminalLayoutsByTabId: {},
      sendPromptToSidebarAgentTarget: vi.fn(),
      settings: {
        promptCacheTimerEnabled: mockPromptCacheTimerEnabled,
        promptCacheTtlMs: mockPromptCacheTtlMs
      }
    })
}))

vi.mock('@/lib/worktree-activation', () => ({
  activateAndRevealWorktree: activationMocks.activateAndRevealWorktree
}))

vi.mock('@/lib/activate-tab-and-focus-pane', () => ({
  activateTabAndFocusPane: activationMocks.activateTabAndFocusPane
}))

vi.mock('./useWorktreeAgentRows', () => ({
  useWorktreeAgentRows: vi.fn(() => mockAgents)
}))

vi.mock('@/components/dashboard/useNow', () => ({
  useNow: vi.fn(() => 2000)
}))

vi.mock('./prompt-cache-countdown-clock', () => ({
  usePromptCacheCountdownNow: vi.fn(() => 10_000)
}))

vi.mock('@/components/dashboard/DashboardAgentRow', () => ({
  default: ({
    agent,
    isFocusedPane,
    sendTargetStatus,
    sendTargetDisabledReason,
    onSendTargetClick,
    childAgentCount,
    childAgentsExpanded,
    onToggleChildAgents,
    reserveDisclosureGutter,
    onActivate
  }: {
    agent: { paneKey: string }
    isFocusedPane?: boolean
    sendTargetStatus?: 'eligible' | 'disabled' | 'sending'
    sendTargetDisabledReason?: string
    onSendTargetClick?: (paneKey: string) => void
    childAgentCount?: number
    childAgentsExpanded?: boolean
    onToggleChildAgents?: () => void
    reserveDisclosureGutter?: boolean
    onActivate: (tabId: string, paneKey: string) => void
  }) => {
    capturedRowActivations.push({ paneKey: agent.paneKey, onActivate })
    return (
      <div
        data-testid="agent-row"
        data-focused={isFocusedPane ? 'true' : 'false'}
        data-agent-send-target={sendTargetStatus}
        data-disabled-reason={sendTargetDisabledReason}
        data-has-send-handler={typeof onSendTargetClick === 'function' ? 'true' : 'false'}
        data-pane-key={agent.paneKey}
        data-reserve-disclosure-gutter={reserveDisclosureGutter ? 'true' : 'false'}
      >
        {agent.paneKey}
        {typeof childAgentCount === 'number' && childAgentCount > 0 ? (
          <button
            type="button"
            aria-label={`${childAgentsExpanded ? 'Hide' : 'Show'} ${childAgentCount} child ${
              childAgentCount === 1 ? 'agent' : 'agents'
            }`}
            aria-expanded={childAgentsExpanded ?? false}
            onClick={onToggleChildAgents}
          >
            +{childAgentCount}
          </button>
        ) : null}
      </div>
    )
  }
}))

vi.mock('./focused-agent-row-highlight', () => ({
  useFocusedAgentPaneKey: vi.fn(() => mockFocusedAgentPaneKey)
}))

vi.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: ReactNode }) => <>{children}</>
}))

const MUTED = 'text-worktree-sidebar-muted-foreground'

describe('new-style compact agent rows', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAgents = [mockAgent()]
    mockFocusedAgentPaneKey = null
    mockAgentActivityDisplayMode = undefined
    mockPromptCacheTimerEnabled = true
    mockPromptCacheTtlMs = 60_000
    mockCacheTimerByKey = {}
    capturedRowActivations = []
  })

  it('shows one stripped text and no time on the new-style line-2 agent row', async () => {
    mockAgentActivityDisplayMode = 'compact'
    mockAgents = [
      mockAgent({
        agentType: 'codex',
        state: 'done',
        startedAt: 1000,
        prompt: '## Fix the **sidebar** `rows` and [docs](https://example.com)',
        lastAssistantMessage: 'Done with the change'
      })
    ]
    const { default: WorktreeCardAgents } = await import('./WorktreeCardAgents')

    const markup = renderToStaticMarkup(<WorktreeCardAgents worktreeId="wt-1" newCardStyle />)

    expect(markup).toContain(`<span class="${MUTED}">Fix the sidebar rows and docs</span>`)
    expect(markup).not.toContain(' - Done with the change</span>')
    expect(markup).toContain('flex h-5 items-center gap-1')
    expect(markup).toContain('px-1 text-[12px]')
    expect(markup).not.toContain('>now</span>')
    expect(markup).toContain('flex flex-col mt-0 gap-0')
  })

  it('keeps the legacy prompt - message join when the new style is off', async () => {
    mockAgentActivityDisplayMode = 'compact'
    mockAgents = [
      mockAgent({
        agentType: 'codex',
        startedAt: 1000,
        prompt: '**Run** tests',
        lastAssistantMessage: 'Inspecting changes'
      })
    ]
    const { default: WorktreeCardAgents } = await import('./WorktreeCardAgents')

    const markup = renderToStaticMarkup(<WorktreeCardAgents worktreeId="wt-1" />)

    expect(markup).toContain(`<span class="${MUTED}">**Run** tests</span>`)
    expect(markup).toContain(' - Inspecting changes</span>')
    expect(markup).toContain('flex h-6 items-center gap-1')
  })

  it('keeps per-agent time and a 24px row in the expanded multi-agent list', async () => {
    const { CompactAgentRow } = await import('./worktree-card-compact-agent-row')
    const agent = mockAgent({ agentType: 'codex', startedAt: 1000, prompt: 'Run tests' })

    const listMarkup = renderToStaticMarkup(
      <CompactAgentRow
        agent={agent as DashboardAgentRowData}
        now={2000}
        onActivate={vi.fn()}
        layout="card-list"
      />
    )
    const lineMarkup = renderToStaticMarkup(
      <CompactAgentRow
        agent={agent as DashboardAgentRowData}
        now={2000}
        onActivate={vi.fn()}
        layout="card-line"
      />
    )

    expect(listMarkup).toContain('>now</span>')
    expect(listMarkup).toContain('flex h-6 items-center gap-1')
    expect(listMarkup).toContain('px-1 text-[12px]')
    expect(lineMarkup).not.toContain('>now</span>')
    expect(lineMarkup).toContain('flex h-5 items-center gap-1')
    // The lone agent's logo takes the status dot's column; its state is read out, not drawn.
    expect(lineMarkup).toContain('<span class="sr-only">')
    expect(lineMarkup).not.toContain('inline-flex w-3 shrink-0 justify-center')
    expect(listMarkup).toContain('inline-flex w-3 shrink-0 justify-center')
  })

  it('keeps the conversation name while a new-style agent is working', async () => {
    const { getCompactAgentSingleText } = await import('./worktree-card-compact-agent-row')
    const working = mockAgent({ agentType: 'codex', state: 'working', prompt: 'Fix *it*' }) as {
      entry: Record<string, unknown>
    }
    working.entry.toolName = 'Read'
    const done = mockAgent({ agentType: 'codex', state: 'done', prompt: 'Fix *it*' }) as {
      entry: Record<string, unknown>
    }
    done.entry.toolName = 'Read'

    expect(getCompactAgentSingleText(working as unknown as DashboardAgentRowData, 'Chat')).toBe(
      'Chat'
    )
    expect(getCompactAgentSingleText(working as unknown as DashboardAgentRowData, null)).toBe(
      'Fix it'
    )
    expect(getCompactAgentSingleText(done as unknown as DashboardAgentRowData, '`Chat` name')).toBe(
      'Chat name'
    )
    expect(getCompactAgentSingleText(done as unknown as DashboardAgentRowData, null)).toBe('Fix it')
  })

  it('strips inline markdown from agent text', async () => {
    const { stripInlineMarkdown } = await import('./worktree-card-compact-agent-row')

    expect(stripInlineMarkdown('# Title with **bold** and *em*')).toBe('Title with bold and em')
    expect(stripInlineMarkdown('Use `pnpm test` then ~~skip~~ it')).toBe(
      'Use pnpm test then skip it'
    )
    expect(stripInlineMarkdown('See [the docs](https://x.dev) and ![img](a.png)')).toBe(
      'See the docs and img'
    )
    expect(stripInlineMarkdown('- list item [WIP]')).toBe('list item WIP')
    expect(stripInlineMarkdown('Fix issue #42 in snake_case_name')).toBe(
      'Fix issue #42 in snake_case_name'
    )
  })
})
