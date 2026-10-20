// @vitest-environment happy-dom

import { cleanup, render, screen } from '@testing-library/react'
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
