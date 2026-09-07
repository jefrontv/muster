// @vitest-environment happy-dom

import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const createChatThread = vi.fn()
const deleteChatThread = vi.fn()
const setChatThreadSession = vi.fn()
const launchChatThreadSession = vi.fn()

const state = {
  chatWorkspaces: [{ id: 'w1', name: 'Site', directories: ['/tmp/site'] }],
  createChatThread,
  deleteChatThread,
  setChatThreadSession
}

vi.mock('@/store', () => ({ useAppStore: { getState: () => state } }))
vi.mock('@/lib/chat-thread-session-launch', () => ({
  launchChatThreadSession: (...args: unknown[]) => launchChatThreadSession(...args)
}))

const { useChatDraftPrewarm } = await import('./use-chat-draft-prewarm')

const thread = { id: 't1', workspaceId: 'w1' }

beforeEach(() => {
  createChatThread.mockReset().mockResolvedValue(thread)
  deleteChatThread.mockReset().mockResolvedValue(undefined)
  setChatThreadSession.mockReset()
  launchChatThreadSession.mockReset().mockResolvedValue({ tabId: 'a', leafId: 'b', paneKey: 'a:b' })
})

afterEach(() => vi.restoreAllMocks())

const flush = () => act(async () => {})

describe('useChatDraftPrewarm', () => {
  it('does nothing until the user actually types', async () => {
    renderHook(() => useChatDraftPrewarm({ draft: '   ', workspaceId: 'w1' }))
    await flush()
    expect(createChatThread).not.toHaveBeenCalled()
    expect(launchChatThreadSession).not.toHaveBeenCalled()
  })

  it('creates the thread off-screen and launches its session', async () => {
    renderHook(() => useChatDraftPrewarm({ draft: 'fix the nav', workspaceId: 'w1' }))
    await flush()
    // activate:false is the whole point — activating would unmount the hero
    // out from under the person still typing.
    expect(createChatThread).toHaveBeenCalledWith('w1', undefined, { activate: false })
    expect(launchChatThreadSession).toHaveBeenCalledWith({
      thread,
      workspace: state.chatWorkspaces[0]
    })
    expect(setChatThreadSession).toHaveBeenCalledWith('t1', {
      tabId: 'a',
      leafId: 'b',
      paneKey: 'a:b'
    })
  })

  it('warms only once no matter how much more is typed', async () => {
    const { rerender } = renderHook(
      ({ d }) => useChatDraftPrewarm({ draft: d, workspaceId: 'w1' }),
      {
        initialProps: { d: 'f' }
      }
    )
    await flush()
    rerender({ d: 'fix' })
    rerender({ d: 'fix the nav' })
    await flush()
    expect(createChatThread).toHaveBeenCalledTimes(1)
  })

  it('claim hands over the thread and stops it being cleaned up', async () => {
    const { result, unmount } = renderHook(() =>
      useChatDraftPrewarm({ draft: 'hello', workspaceId: 'w1' })
    )
    await flush()
    expect(result.current.claim()).toEqual(thread)
    unmount()
    expect(deleteChatThread).not.toHaveBeenCalled()
  })

  it('discards an abandoned draft so no empty thread is left behind', async () => {
    const { unmount } = renderHook(() => useChatDraftPrewarm({ draft: 'hello', workspaceId: 'w1' }))
    await flush()
    unmount()
    expect(deleteChatThread).toHaveBeenCalledWith('t1')
  })

  it('claim returns null before the warm-up finishes, so submit can fall back', () => {
    const { result } = renderHook(() => useChatDraftPrewarm({ draft: 'hello', workspaceId: 'w1' }))
    expect(result.current.claim()).toBeNull()
  })

  it('drops a thread warmed against a workspace the user then switched away from', async () => {
    const { rerender } = renderHook(
      ({ w }) => useChatDraftPrewarm({ draft: 'hello', workspaceId: w }),
      { initialProps: { w: 'w1' as string | null } }
    )
    await flush()
    expect(createChatThread).toHaveBeenCalledTimes(1)

    state.chatWorkspaces.push({ id: 'w2', name: 'Other', directories: ['/tmp/other'] })
    createChatThread.mockResolvedValue({ id: 't2', workspaceId: 'w2' })
    rerender({ w: 'w2' })
    await flush()

    // The stale thread goes, and the replacement is warmed for the new pick —
    // not deleted by a late cleanup pass.
    expect(deleteChatThread).toHaveBeenCalledWith('t1')
    expect(deleteChatThread).not.toHaveBeenCalledWith('t2')
    expect(createChatThread).toHaveBeenLastCalledWith('w2', undefined, { activate: false })
  })

  it('switching workspace mid-create discards the late thread and warms the new one', async () => {
    const create = Promise.withResolvers<unknown>()
    createChatThread.mockImplementationOnce(() => create.promise)
    const { rerender, result } = renderHook(
      ({ w }) => useChatDraftPrewarm({ draft: 'hello', workspaceId: w }),
      { initialProps: { w: 'w1' as string | null } }
    )
    await flush()
    expect(createChatThread).toHaveBeenCalledTimes(1)

    state.chatWorkspaces.push({ id: 'w2', name: 'Other', directories: ['/tmp/other'] })
    createChatThread.mockResolvedValue({ id: 't2', workspaceId: 'w2' })
    rerender({ w: 'w2' })
    await flush()
    await act(async () => create.resolve(thread))

    // w1's thread arrived after the switch: gone, never launched, never claimable.
    expect(deleteChatThread).toHaveBeenCalledWith('t1')
    expect(launchChatThreadSession).not.toHaveBeenCalledWith(expect.objectContaining({ thread }))
    // And the switch did not leave w2 cold.
    expect(createChatThread).toHaveBeenLastCalledWith('w2', undefined, { activate: false })
    expect(result.current.claim()?.id).toBe('t2')
  })

  it('unmount mid-launch stops the orphaned session', async () => {
    const launch = Promise.withResolvers<unknown>()
    launchChatThreadSession.mockImplementationOnce(() => launch.promise)
    const { unmount } = renderHook(() => useChatDraftPrewarm({ draft: 'hello', workspaceId: 'w1' }))
    await flush()
    expect(launchChatThreadSession).toHaveBeenCalledTimes(1)

    unmount()
    await act(async () => launch.resolve({ tabId: 'a', leafId: 'b', paneKey: 'a:b' }))

    // The session is recorded first so deleteChatThread knows to stop its stream.
    expect(setChatThreadSession).toHaveBeenCalledWith(
      't1',
      expect.objectContaining({ paneKey: 'a:b' })
    )
    expect(deleteChatThread).toHaveBeenCalledWith('t1')
    expect(setChatThreadSession.mock.invocationCallOrder[0]).toBeLessThan(
      deleteChatThread.mock.invocationCallOrder[0]
    )
  })

  it('cleans up after a launch that throws', async () => {
    launchChatThreadSession.mockRejectedValue(new Error('no claude'))
    const { result } = renderHook(() => useChatDraftPrewarm({ draft: 'hello', workspaceId: 'w1' }))
    await flush()
    expect(deleteChatThread).toHaveBeenCalledWith('t1')
    expect(result.current.claim()).toBeNull()
  })
})
