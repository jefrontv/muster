import { describe, expect, it } from 'vitest'
import { listTaskSendTargets } from './tasks-panel-send-targets'
import type { TerminalTab } from '../../../../shared/types'

function tab(overrides: Partial<TerminalTab> = {}): TerminalTab {
  return {
    id: 'tab-1',
    ptyId: 'pty-1',
    worktreeId: 'wt-1',
    title: 'Terminal 1',
    customTitle: null,
    color: null,
    sortOrder: 0,
    createdAt: 0,
    ...overrides
  } as TerminalTab
}

describe('listTaskSendTargets', () => {
  it('answers an empty list when there are no tabs', () => {
    expect(listTaskSendTargets(null)).toEqual([])
  })

  // A tab with no pty cannot take a paste: submitPromptToAgentTab waits for one and returns false,
  // so offering it would be a click that does nothing.
  it('leaves out a tab with no pty', () => {
    expect(listTaskSendTargets([tab({ ptyId: null })])).toEqual([])
  })

  it('leaves out a tab whose pty id is empty', () => {
    expect(listTaskSendTargets([tab({ ptyId: '' })])).toEqual([])
  })

  it('offers a live tab', () => {
    expect(listTaskSendTargets([tab()])).toEqual([{ tabId: 'tab-1', label: 'Terminal 1' }])
  })

  it('names the agent when Muster launched one', () => {
    const targets = listTaskSendTargets([tab({ launchAgent: 'claude' as never })])
    expect(targets[0].agent).toBe('claude')
  })

  it('still offers a tab Muster did not launch an agent in', () => {
    const targets = listTaskSendTargets([tab({ launchAgent: undefined })])
    expect(targets).toHaveLength(1)
    expect(targets[0].agent).toBeUndefined()
  })

  it('puts agent sessions before plain shells', () => {
    const targets = listTaskSendTargets([
      tab({ id: 'shell', title: 'aaa shell' }),
      tab({ id: 'agent', title: 'zzz agent', launchAgent: 'claude' as never })
    ])
    expect(targets.map((target) => target.tabId)).toEqual(['agent', 'shell'])
  })

  it('sorts numerically within a group, so Terminal 10 follows Terminal 9', () => {
    const targets = listTaskSendTargets([
      tab({ id: 'b', title: 'Terminal 10' }),
      tab({ id: 'a', title: 'Terminal 9' })
    ])
    expect(targets.map((target) => target.label)).toEqual(['Terminal 9', 'Terminal 10'])
  })

  it('prefers a custom title over the live one', () => {
    expect(listTaskSendTargets([tab({ customTitle: 'My agent' })])[0].label).toBe('My agent')
  })

  it('falls back to a readable label when every title is blank', () => {
    expect(listTaskSendTargets([tab({ title: '   ', customTitle: null })])[0].label).toBe(
      'Terminal'
    )
  })
})
