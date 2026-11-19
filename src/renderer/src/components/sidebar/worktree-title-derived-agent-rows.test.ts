import { describe, expect, it } from 'vitest'
import { applyAgentRowLineage } from '@/components/dashboard/agent-row-lineage'
import type { TerminalLayoutSnapshot, TerminalTab, TuiAgent } from '../../../../shared/types'
import { makePaneKey } from '../../../../shared/stable-pane-id'
import { selectForegroundAgentsForWorktree } from './worktree-agent-row-selectors'
import { buildWorktreeAgentRows } from './worktree-agent-rows'

const LEAF_ID_1 = '77777777-7777-4777-8777-777777777777'
const LEAF_ID_2 = '88888888-8888-4888-8888-888888888888'

function makeTab(id: string, overrides: Partial<TerminalTab> = {}): TerminalTab {
  return {
    id,
    worktreeId: 'wt-1',
    ptyId: null,
    title: 'Claude',
    customTitle: null,
    color: null,
    sortOrder: 0,
    createdAt: 0,
    ...overrides
  }
}

function makeSplitLayout(): TerminalLayoutSnapshot {
  return {
    root: {
      type: 'split',
      direction: 'vertical',
      first: { type: 'leaf', leafId: LEAF_ID_1 },
      second: { type: 'leaf', leafId: LEAF_ID_2 }
    },
    activeLeafId: LEAF_ID_1,
    expandedLeafId: null
  }
}

function makeSingleLayout(leafId: string): TerminalLayoutSnapshot {
  return {
    root: { type: 'leaf', leafId },
    activeLeafId: leafId,
    expandedLeafId: null
  }
}

describe('buildTitleDerivedAgentRows', () => {
  it('selects foreground evidence only for tabs on the requested worktree', () => {
    const codex = makePaneKey('first', LEAF_ID_1)
    const antigravity = makePaneKey('second', LEAF_ID_2)
    const activity = {
      tabsByWorktree: {
        'wt-1': [makeTab('first')],
        'wt-2': [makeTab('second', { worktreeId: 'wt-2' })]
      },
      paneForegroundAgentByPaneKey: {
        [codex]: { agent: 'codex', shellForeground: false },
        [antigravity]: { agent: 'antigravity', shellForeground: false }
      }
    } satisfies Parameters<typeof selectForegroundAgentsForWorktree>[0]
    expect(selectForegroundAgentsForWorktree(activity, 'wt-1')).toEqual({
      [codex]: activity.paneForegroundAgentByPaneKey[codex]
    })
    expect(selectForegroundAgentsForWorktree(activity, 'wt-2')).toEqual({
      [antigravity]: activity.paneForegroundAgentByPaneKey[antigravity]
    })
  })

  it('uses foreground Codex for a topic title and shows Antigravity with no pane title', () => {
    const codex = makePaneKey('tab-1', LEAF_ID_1)
    const antigravity = makePaneKey('tab-1', LEAF_ID_2)
    const rows = buildWorktreeAgentRows({
      tabs: [makeTab('tab-1')],
      entries: [],
      retained: [],
      runtimePaneTitlesByTabId: { 'tab-1': { 1: '✳ Investigate session limits' } },
      ptyIdsByTabId: { 'tab-1': ['pty-left', 'pty-right'] },
      terminalLayoutsByTabId: { 'tab-1': makeSplitLayout() },
      foregroundAgentsByPaneKey: {
        [codex]: { agent: 'codex', shellForeground: false },
        [antigravity]: { agent: 'antigravity', shellForeground: false }
      },
      now: 2000
    })
    expect(rows.map((row) => [row.paneKey, row.agentType, row.entry.prompt])).toEqual([
      [codex, 'codex', 'Codex'],
      [antigravity, 'antigravity', 'Antigravity']
    ])
    expect(rows.find((row) => row.paneKey === antigravity)?.state).toBe('idle')
  })

  it('keeps a live hook and replaces a completed hook when the foreground provider changes', () => {
    const paneKey = makePaneKey('tab-1', LEAF_ID_1)
    const args: Parameters<typeof buildWorktreeAgentRows>[0] = {
      tabs: [makeTab('tab-1', { title: 'Terminal 2' })],
      retained: [],
      entries: [],
      ptyIdsByTabId: { 'tab-1': ['pty-1'] },
      terminalLayoutsByTabId: { 'tab-1': makeSingleLayout(LEAF_ID_1) },
      foregroundAgentsByPaneKey: { [paneKey]: { agent: 'antigravity', shellForeground: false } },
      now: 2000
    }
    const hook = {
      paneKey,
      prompt: 'Claude prompt',
      agentType: 'claude',
      updatedAt: 2000,
      stateStartedAt: 2000,
      stateHistory: []
    } as const
    expect(
      buildWorktreeAgentRows({
        ...args,
        entries: [{ ...hook, stateHistory: [], state: 'working' }]
      }).map((row) => row.agentType)
    ).toEqual(['claude'])
    expect(
      buildWorktreeAgentRows({
        ...args,
        entries: [{ ...hook, stateHistory: [], state: 'done' }]
      }).map((row) => [row.agentType, row.entry.prompt, row.state])
    ).toEqual([['antigravity', 'Antigravity', 'idle']])
  })

  it('drops foreground rows for closed panes and title-only rows after returning to shell', () => {
    const active = makePaneKey('tab-1', LEAF_ID_1)
    const closed = makePaneKey('tab-1', LEAF_ID_2)
    const rows = buildWorktreeAgentRows({
      tabs: [makeTab('tab-1', { title: '✳ Previous task' })],
      entries: [],
      retained: [],
      ptyIdsByTabId: { 'tab-1': ['pty-active'] },
      terminalLayoutsByTabId: { 'tab-1': makeSingleLayout(LEAF_ID_1) },
      foregroundAgentsByPaneKey: {
        [active]: { agent: null, shellForeground: true },
        [closed]: { agent: 'antigravity', shellForeground: false }
      },
      now: 2000
    })
    expect(rows).toEqual([])
  })

  it('adds title-derived rows for live agent panes that have no hook status yet', () => {
    const rows = buildWorktreeAgentRows({
      tabs: [makeTab('tab-1')],
      entries: [],
      retained: [],
      runtimePaneTitlesByTabId: {
        'tab-1': {
          1: 'Antigravity',
          2: '⠋ Codex'
        }
      },
      ptyIdsByTabId: { 'tab-1': ['pty-left', 'pty-right'] },
      terminalLayoutsByTabId: { 'tab-1': makeSplitLayout() },
      now: 2000
    })

    expect(rows.map((row) => [row.agentType, row.state, row.entry.lastAssistantMessage])).toEqual([
      ['antigravity', 'idle', 'Idle'],
      ['codex', 'working', 'Running']
    ])
    expect(rows.map((row) => row.paneKey)).toEqual([
      makePaneKey('tab-1', LEAF_ID_1),
      makePaneKey('tab-1', LEAF_ID_2)
    ])
  })

  it('normalizes Pi-compatible title-derived rows to the launched OMP owner', () => {
    const rows = buildWorktreeAgentRows({
      tabs: [makeTab('tab-1', { launchAgent: 'omp' })],
      entries: [],
      retained: [],
      runtimePaneTitlesByTabId: {
        'tab-1': {
          1: '\u280b π: tmp'
        }
      },
      ptyIdsByTabId: { 'tab-1': ['pty-omp'] },
      terminalLayoutsByTabId: { 'tab-1': makeSingleLayout(LEAF_ID_1) },
      now: 2000
    })

    expect(rows.map((row) => [row.agentType, row.state, row.entry.terminalTitle])).toEqual([
      ['omp', 'working', '\u280b OMP']
    ])
  })

  it('keeps Pi-compatible title-derived rows as Pi for launched Pi sessions', () => {
    const rows = buildWorktreeAgentRows({
      tabs: [makeTab('tab-1', { launchAgent: 'pi' })],
      entries: [],
      retained: [],
      runtimePaneTitlesByTabId: {
        'tab-1': {
          1: '\u280b Pi'
        }
      },
      ptyIdsByTabId: { 'tab-1': ['pty-pi'] },
      terminalLayoutsByTabId: { 'tab-1': makeSingleLayout(LEAF_ID_1) },
      now: 2000
    })

    expect(rows.map((row) => [row.agentType, row.state, row.entry.terminalTitle])).toEqual([
      ['pi', 'working', '\u280b Pi']
    ])
  })

  it('does not add title-derived rows for panes without a live PTY', () => {
    const rows = buildWorktreeAgentRows({
      tabs: [makeTab('tab-1')],
      entries: [],
      retained: [],
      runtimePaneTitlesByTabId: {
        'tab-1': { 1: '⠋ Codex' }
      },
      ptyIdsByTabId: {},
      terminalLayoutsByTabId: { 'tab-1': makeSplitLayout() },
      now: 2000
    })

    expect(rows).toHaveLength(0)
  })

  it('uses runtime orchestration metadata for title-derived worker rows', () => {
    const parentPaneKey = makePaneKey('tab-parent', LEAF_ID_1)
    const childPaneKey = makePaneKey('tab-child', LEAF_ID_2)
    const rows = applyAgentRowLineage(
      buildWorktreeAgentRows({
        tabs: [makeTab('tab-parent'), makeTab('tab-child')],
        entries: [],
        retained: [],
        runtimePaneTitlesByTabId: {
          'tab-parent': { 1: '⠋ Codex' },
          'tab-child': { 1: '⠋ Claude Code' }
        },
        ptyIdsByTabId: {
          'tab-parent': ['pty-parent'],
          'tab-child': ['pty-child']
        },
        terminalLayoutsByTabId: {
          'tab-parent': makeSingleLayout(LEAF_ID_1),
          'tab-child': makeSingleLayout(LEAF_ID_2)
        },
        runtimeAgentOrchestrationByPaneKey: {
          [childPaneKey]: {
            taskId: 'task-1',
            dispatchId: 'ctx-1',
            parentPaneKey
          }
        },
        now: 2000
      })
    )

    expect(rows.map((row) => row.paneKey)).toEqual([parentPaneKey, childPaneKey])
    expect(rows[0].lineage).toMatchObject({ depth: 0, childCount: 1 })
    expect(rows[1].lineage).toMatchObject({ depth: 1, childCount: 0 })
    expect(rows[1].entry.orchestration).toMatchObject({ parentPaneKey })
  })

  it('does not infer Claude Code from a spinner-only non-agent title', () => {
    const rows = buildWorktreeAgentRows({
      tabs: [makeTab('tab-1')],
      entries: [],
      retained: [],
      runtimePaneTitlesByTabId: {
        'tab-1': { 1: '⠋ installing dependencies' }
      },
      ptyIdsByTabId: { 'tab-1': ['pty-plain'] },
      terminalLayoutsByTabId: { 'tab-1': makeSplitLayout() },
      now: 2000
    })

    expect(rows).toHaveLength(0)
  })

  it('adds an idle Claude row for the Claude agents surface', () => {
    for (const title of [
      'claude agents',
      String.raw`C:\Users\dev\AppData\Roaming\npm\claude.cmd agents`
    ]) {
      const rows = buildWorktreeAgentRows({
        tabs: [makeTab('tab-1')],
        entries: [],
        retained: [],
        runtimePaneTitlesByTabId: {
          'tab-1': { 1: title }
        },
        ptyIdsByTabId: { 'tab-1': ['pty-claude-agents'] },
        terminalLayoutsByTabId: { 'tab-1': makeSingleLayout(LEAF_ID_1) },
        now: 2000
      })

      expect(rows.map((row) => [row.agentType, row.state, row.entry.lastAssistantMessage])).toEqual(
        [['claude', 'idle', 'Idle']]
      )
    }
  })

  it('attributes a spinner-only title to the launched agent when the title has no identity', () => {
    const launchAgent: TuiAgent = 'codex'
    const rows = buildWorktreeAgentRows({
      tabs: [makeTab('tab-1', { launchAgent })],
      entries: [],
      retained: [],
      runtimePaneTitlesByTabId: {
        // Codex over SSH emits spinner + cwd titles with no agent name (#8711).
        'tab-1': { 1: '⠼ demo-repo' }
      },
      ptyIdsByTabId: { 'tab-1': ['pty-codex-remote'] },
      terminalLayoutsByTabId: { 'tab-1': makeSingleLayout(LEAF_ID_1) },
      now: 2000
    })

    expect(
      rows.map((row) => [row.agentType, row.state, row.entry.prompt, row.entry.terminalTitle])
    ).toEqual([['codex', 'working', 'Codex', '⠼ demo-repo']])
  })

  it('keeps explicit title identity over the launched agent', () => {
    const launchAgent: TuiAgent = 'claude'
    const rows = buildWorktreeAgentRows({
      tabs: [makeTab('tab-1', { launchAgent })],
      entries: [],
      retained: [],
      runtimePaneTitlesByTabId: {
        'tab-1': { 1: '⠋ Codex' }
      },
      ptyIdsByTabId: { 'tab-1': ['pty-explicit'] },
      terminalLayoutsByTabId: { 'tab-1': makeSingleLayout(LEAF_ID_1) },
      now: 2000
    })

    expect(rows.map((row) => [row.agentType, row.state])).toEqual([['codex', 'working']])
  })

  it('produces no row for a spinner-only title when the tab has no launch identity', () => {
    const rows = buildWorktreeAgentRows({
      tabs: [makeTab('tab-1')],
      entries: [],
      retained: [],
      runtimePaneTitlesByTabId: {
        // Spinner activity but no identity and no launchAgent to attribute it to.
        'tab-1': { 1: '⠼ demo-repo' }
      },
      ptyIdsByTabId: { 'tab-1': ['pty-anon'] },
      terminalLayoutsByTabId: { 'tab-1': makeSingleLayout(LEAF_ID_1) },
      now: 2000
    })

    expect(rows).toHaveLength(0)
  })

  it('adds a Claude row for a resumed session topic title on a manual terminal', () => {
    // `claude --resume <id>` / `--continue` title the prior conversation topic
    // without naming Claude; the row must still appear before the first prompt.
    for (const title of ['✳ Fix pnpm install node_modules ENOTDIR error', '✳']) {
      const rows = buildWorktreeAgentRows({
        tabs: [makeTab('tab-1')],
        entries: [],
        retained: [],
        runtimePaneTitlesByTabId: {
          'tab-1': { 1: title }
        },
        ptyIdsByTabId: { 'tab-1': ['pty-resumed'] },
        terminalLayoutsByTabId: { 'tab-1': makeSingleLayout(LEAF_ID_1) },
        now: 2000
      })

      expect(rows.map((row) => [row.agentType, row.state, row.entry.lastAssistantMessage])).toEqual(
        [['claude', 'idle', 'Idle']]
      )
    }
  })

  it('adds a Claude row for a resumed session topic title on a Claude-launched tab', () => {
    const launchAgent: TuiAgent = 'claude'
    const rows = buildWorktreeAgentRows({
      tabs: [makeTab('tab-1', { launchAgent })],
      entries: [],
      retained: [],
      runtimePaneTitlesByTabId: {
        'tab-1': { 1: '✳ refactor split-pane status' }
      },
      ptyIdsByTabId: { 'tab-1': ['pty-claude-resumed'] },
      terminalLayoutsByTabId: { 'tab-1': makeSingleLayout(LEAF_ID_1) },
      now: 2000
    })

    expect(rows.map((row) => [row.agentType, row.state])).toEqual([['claude', 'idle']])
  })

  it('adds a Claude row for the interactive resume picker title', () => {
    // `claude --resume` (no id) and the picker title the CLI name directly.
    const rows = buildWorktreeAgentRows({
      tabs: [makeTab('tab-1')],
      entries: [],
      retained: [],
      runtimePaneTitlesByTabId: {
        'tab-1': { 1: 'claude · resume' }
      },
      ptyIdsByTabId: { 'tab-1': ['pty-picker'] },
      terminalLayoutsByTabId: { 'tab-1': makeSingleLayout(LEAF_ID_1) },
      now: 2000
    })

    expect(rows.map((row) => [row.agentType, row.state])).toEqual([['claude', 'idle']])
  })

  it('does not turn generic Codex-launched task titles into Claude Code rows', () => {
    const launchAgent: TuiAgent = 'codex'
    const rows = buildWorktreeAgentRows({
      tabs: [makeTab('tab-1', { launchAgent })],
      entries: [],
      retained: [],
      runtimePaneTitlesByTabId: {
        'tab-1': { 1: '✳ refactor split-pane status' }
      },
      ptyIdsByTabId: { 'tab-1': ['pty-codex'] },
      terminalLayoutsByTabId: { 'tab-1': makeSplitLayout() },
      now: 2000
    })

    expect(rows).toHaveLength(0)
  })
})
