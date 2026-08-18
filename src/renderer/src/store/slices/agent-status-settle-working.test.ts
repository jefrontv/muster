import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { makePaneKey } from '../../../../shared/stable-pane-id'
import { createTestStore } from './store-test-helpers'

const PANE = makePaneKey('tab-1', '11111111-1111-4111-8111-111111111111')

beforeEach(() => {
  vi.stubGlobal('window', {
    api: {
      agentStatus: {
        retirePaneAuthority: vi.fn(),
        transferPaneAuthority: vi.fn(),
        dropByTabPrefix: vi.fn(),
        drop: vi.fn()
      }
    }
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('settleAgentStatusWorking', () => {
  it('closes out a working pane the stream knows has finished its turn', () => {
    const store = createTestStore()
    store.getState().setAgentStatus(PANE, {
      state: 'working',
      prompt: 'audit the site',
      toolName: 'AskUserQuestion',
      interactivePrompt: '{"questions":[]}'
    })

    store.getState().settleAgentStatusWorking(PANE, 5_000)

    const entry = store.getState().agentStatusByPaneKey[PANE]
    expect(entry?.state).toBe('done')
    expect(entry?.stateStartedAt).toBe(5_000)
    // A finished turn has no live tool; a lingering prompt could re-latch a card.
    expect(entry?.toolName).toBeUndefined()
    expect(entry?.interactivePrompt).toBeUndefined()
    expect(entry?.stateHistory?.at(-1)).toMatchObject({ state: 'working', prompt: 'audit the site' })
  })

  it('leaves a pane that is not working alone', () => {
    const store = createTestStore()
    store.getState().setAgentStatus(PANE, { state: 'waiting', prompt: 'question' })
    const before = store.getState().agentStatusByPaneKey[PANE]

    store.getState().settleAgentStatusWorking(PANE, 5_000)

    expect(store.getState().agentStatusByPaneKey[PANE]).toBe(before)
  })

  it('ignores a pane with no status entry', () => {
    const store = createTestStore()
    expect(() => store.getState().settleAgentStatusWorking(PANE, 5_000)).not.toThrow()
    expect(store.getState().agentStatusByPaneKey[PANE]).toBeUndefined()
  })
})
