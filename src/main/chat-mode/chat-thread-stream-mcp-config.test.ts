import { afterEach, describe, expect, it, vi } from 'vitest'
import { createMusterMcpAttach } from './chat-thread-stream-mcp-config'

const connector = { url: 'http://127.0.0.1:9999/mcp', token: 'tok-1' }

function setup(initializeFirst: boolean, connected = true) {
  const written: Record<string, unknown>[] = []
  let counter = 0
  const attach = createMusterMcpAttach({
    connector: connected ? connector : null,
    initializeFirst,
    nextRequestId: () => `req_${++counter}`,
    write: (payload) => {
      written.push(payload as Record<string, unknown>)
      return true
    }
  })
  let ready = false
  void attach.ready.then(() => (ready = true))
  return { attach, written, isReady: () => ready }
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('createMusterMcpAttach', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('attaches after the initialize answer and holds sends until the CLI acknowledges', async () => {
    const { attach, written, isReady } = setup(true)
    attach.observe({ type: 'system', subtype: 'init' })
    expect(written).toEqual([])
    attach.observe({
      type: 'control_response',
      response: { request_id: 'init', subtype: 'success' }
    })
    expect(written).toEqual([
      {
        type: 'control_request',
        request_id: 'req_1',
        request: {
          subtype: 'mcp_set_servers',
          servers: {
            muster: {
              type: 'http',
              url: connector.url,
              headers: { Authorization: 'Bearer tok-1' }
            }
          }
        }
      }
    ])
    await flush()
    expect(isReady()).toBe(false)
    attach.observe({ type: 'control_response', response: { request_id: 'req_1' } })
    await flush()
    expect(isReady()).toBe(true)
    attach.observe({ type: 'control_response', response: { request_id: 'other' } })
    expect(written).toHaveLength(1)
  })

  it('stops holding sends when the CLI never acknowledges', async () => {
    vi.useFakeTimers()
    const { attach, isReady } = setup(true)
    attach.observe({ type: 'control_response', response: { request_id: 'init' } })
    await vi.advanceTimersByTimeAsync(9_999)
    expect(isReady()).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    expect(isReady()).toBe(true)
  })

  it('never holds sends without initialize, and attaches on init instead', async () => {
    const { attach, written, isReady } = setup(false)
    await flush()
    expect(isReady()).toBe(true)
    attach.observe({ type: 'control_response', response: { request_id: 'x' } })
    expect(written).toEqual([])
    attach.observe({ type: 'system', subtype: 'init' })
    expect(written).toHaveLength(1)
  })

  it('does nothing without a registration', async () => {
    const { attach, written, isReady } = setup(true, false)
    attach.observe({ type: 'control_response', response: { request_id: 'init' } })
    await flush()
    expect(written).toEqual([])
    expect(isReady()).toBe(true)
  })
})
