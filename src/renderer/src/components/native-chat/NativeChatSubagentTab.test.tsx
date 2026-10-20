// @vitest-environment happy-dom

import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { useAppStore } from '../../store'
import type { AgentStatusEntry } from '../../../../shared/agent-status-types'
import { NativeChatSubagentTab } from './NativeChatSubagentTab'

const PANE = 'tab-1:leaf-1'

function seed(subagents: AgentStatusEntry['subagents']): void {
  useAppStore.setState({
    agentStatusByPaneKey: { [PANE]: { state: 'working', subagents } as AgentStatusEntry }
  })
}

describe('NativeChatSubagentTab', () => {
  afterEach(() => {
    cleanup()
    useAppStore.setState({ agentStatusByPaneKey: {} })
  })

  it('renders nothing without live subagents', () => {
    seed(undefined)
    const { container } = render(<NativeChatSubagentTab paneKey={PANE} />)
    expect(container.firstChild).toBeNull()
  })

  it('lists running and idle agents with a running count', () => {
    seed([
      {
        id: 'a1',
        description: 'Review gallery',
        agentType: 'general-purpose',
        state: 'working',
        startedAt: Date.now() - 65_000
      },
      { id: 'a2', description: 'Review cards', state: 'blocked', startedAt: Date.now() },
      { id: 'a3', agentType: 'Explore', state: 'idle', startedAt: Date.now() }
    ])
    render(<NativeChatSubagentTab paneKey={PANE} />)
    expect(screen.getByRole('button', { name: /2 agents running/ })).toBeTruthy()
    expect(screen.getByText('Review gallery')).toBeTruthy()
    expect(screen.getByText(/^1m \d+s$/)).toBeTruthy()
    expect(screen.getByText('Needs approval')).toBeTruthy()
    expect(screen.getByText('Idle')).toBeTruthy()
  })
})

describe('NativeChatSubagentTab passes', () => {
  afterEach(() => {
    cleanup()
    useAppStore.setState({ agentStatusByPaneKey: {} })
  })

  const setPane = (state: AgentStatusEntry['state'], subagents: AgentStatusEntry['subagents']) =>
    act(() => {
      useAppStore.setState({
        agentStatusByPaneKey: { [PANE]: { state, subagents } as AgentStatusEntry }
      })
    })

  it('keeps idle agents after the pass and folds them away when the next pass starts', () => {
    const idle = { id: 'old', description: 'Old helper', state: 'idle' as const, startedAt: 0 }
    setPane('done', [idle])
    render(<NativeChatSubagentTab paneKey={PANE} />)
    const row = (): HTMLElement => screen.getByText('Old helper').closest('li') as HTMLElement
    expect(row().hasAttribute('inert')).toBe(false)

    const fresh = { id: 'new', description: 'New helper', state: 'working' as const, startedAt: 0 }
    setPane('working', [idle, fresh])
    expect(row().hasAttribute('inert')).toBe(true)
    expect(screen.getByRole('button', { name: /1 agent running/ })).toBeTruthy()

    setPane('working', [idle, { ...fresh, state: 'idle' }])
    const newRow = screen.getByText('New helper').closest('li') as HTMLElement
    expect(newRow.hasAttribute('inert')).toBe(false)
  })
})
