import { beforeEach, describe, expect, it } from 'vitest'
import {
  clearSiteMcpClientForTests,
  rememberSiteMcpClient,
  siteMcpClientName
} from './site-mcp-client-identity'

describe('site mcp client identity', () => {
  beforeEach(() => {
    clearSiteMcpClientForTests()
  })

  it('remembers the name a client introduced itself with', () => {
    rememberSiteMcpClient({ name: 'claude-code', version: '1.2.3' })
    expect(siteMcpClientName()).toBe('claude-code')
  })

  it('reports nothing when the handshake carried no usable name', () => {
    for (const clientInfo of [undefined, null, {}, { name: 42 }, { name: '   ' }]) {
      clearSiteMcpClientForTests()
      rememberSiteMcpClient(clientInfo)
      expect(siteMcpClientName()).toBeNull()
    }
  })

  it('bounds the name, because it is rendered and self-reported', () => {
    rememberSiteMcpClient({ name: 'x'.repeat(500) })
    expect(siteMcpClientName()).toHaveLength(60)
  })

  it('lets a reconnecting client replace the previous name', () => {
    rememberSiteMcpClient({ name: 'codex' })
    rememberSiteMcpClient({ name: 'claude-code' })
    expect(siteMcpClientName()).toBe('claude-code')
  })
})
