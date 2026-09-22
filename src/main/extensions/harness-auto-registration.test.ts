import { describe, expect, it, vi } from 'vitest'
import { registerExtensionHarnesses } from './harness-auto-registration'
import type { ExtensionEntry, ExtensionHarnessId } from '../../shared/extension-catalog-types'
import type { ExtensionHarnessState } from '../../shared/extension-state-types'

const ENTRY: ExtensionEntry = {
  id: 'acme-mcp',
  kind: 'mcp',
  name: 'Acme',
  description: 'test',
  keywords: [],
  version: '1.0.0',
  install: {
    method: 'config-write',
    provision: { install: 'install acme', binary: 'acme' },
    server: {
      key: 'acme',
      harnesses: [
        { id: 'claude-code', transport: { kind: 'stdio', binary: 'acme', args: [], env: {} } },
        { id: 'codex', transport: { kind: 'stdio', binary: 'acme', args: [], env: {} } },
        { id: 'cursor', transport: { kind: 'stdio', binary: 'acme', args: [], env: {} } }
      ]
    }
  },
  latest: { source: 'pinned' }
}

function harness(
  id: ExtensionHarnessId,
  overrides: Partial<ExtensionHarnessState> = {}
): ExtensionHarnessState {
  return {
    id,
    label: id,
    configPath: `/home/dev/.${id}`,
    present: true,
    configured: false,
    current: false,
    ...overrides
  }
}

function deps(states: ExtensionHarnessState[]) {
  const written: ExtensionHarnessId[] = []
  return {
    written,
    logError: vi.fn(),
    readStates: () => states,
    write: (_server: unknown, id: ExtensionHarnessId) => {
      written.push(id)
    }
  }
}

describe('registerExtensionHarnesses on a first install', () => {
  it('registers every agent the user actually has', () => {
    const d = deps([harness('claude-code'), harness('codex'), harness('cursor')])
    expect(registerExtensionHarnesses(ENTRY, 'register-all', d)).toEqual([
      'claude-code',
      'codex',
      'cursor'
    ])
  })

  it('leaves out an agent that is not on this machine', () => {
    const d = deps([harness('claude-code'), harness('cursor', { present: false })])
    registerExtensionHarnesses(ENTRY, 'register-all', d)
    expect(d.written).toEqual(['claude-code'])
  })

  it('rewrites an entry someone else put there, which is the point of a takeover', () => {
    const d = deps([harness('claude-code', { configured: true, current: false })])
    registerExtensionHarnesses(ENTRY, 'register-all', d)
    expect(d.written).toEqual(['claude-code'])
  })

  it('skips an entry that already matches, so nothing is rewritten for nothing', () => {
    const d = deps([harness('claude-code', { configured: true, current: true })])
    expect(registerExtensionHarnesses(ENTRY, 'register-all', d)).toEqual([])
  })

  it('keeps going when one config cannot be written', () => {
    const d = deps([harness('claude-code'), harness('codex')])
    const write = vi.fn((_server: unknown, id: ExtensionHarnessId) => {
      if (id === 'claude-code') {
        throw new Error('config is not valid JSON')
      }
      d.written.push(id)
    })
    const written = registerExtensionHarnesses(ENTRY, 'register-all', { ...d, write })
    expect(written).toEqual(['codex'])
    expect(d.logError).toHaveBeenCalledTimes(1)
  })
})

describe('registerExtensionHarnesses on an update', () => {
  it('does not resurrect an agent the user unregistered', () => {
    const d = deps([harness('claude-code', { configured: true }), harness('cursor')])
    registerExtensionHarnesses(ENTRY, 'refresh-existing', d)
    expect(d.written).toEqual(['claude-code'])
  })

  it('repairs an existing entry whose binary moved', () => {
    const d = deps([harness('codex', { configured: true, current: false })])
    expect(registerExtensionHarnesses(ENTRY, 'refresh-existing', d)).toEqual(['codex'])
  })
})

it('has nothing to register for an entry that writes no config', () => {
  const command: ExtensionEntry = {
    ...ENTRY,
    install: { method: 'command', command: { update: 'acme update', binary: 'acme' } }
  }
  const d = deps([harness('claude-code')])
  expect(registerExtensionHarnesses(command, 'register-all', d)).toEqual([])
})
