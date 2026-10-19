import { describe, expect, it } from 'vitest'
import { emptyChatEngineMeta } from './chat-engine-thread'
import {
  controlRequestFor,
  metaAfterControl,
  parseControlAction
} from './chat-engine-control-actions'

describe('chat engine control actions', () => {
  it('maps actions onto the CLI control requests', () => {
    expect(controlRequestFor(parseControlAction({ action: 'setEffort', effort: 'xhigh' }))).toEqual(
      { subtype: 'apply_flag_settings', fields: { settings: { effortLevel: 'xhigh' } } }
    )
    expect(
      controlRequestFor(parseControlAction({ action: 'rewind', userMessageId: 'u-1' }))
    ).toEqual({ subtype: 'rewind_files', fields: { user_message_id: 'u-1', dry_run: true } })
    expect(controlRequestFor(parseControlAction({ action: 'setModel', model: '' }))).toEqual({
      subtype: 'set_model',
      fields: { model: null }
    })
  })

  it('rejects malformed actions instead of forwarding them', () => {
    expect(() => parseControlAction({ action: 'setPermissionMode', mode: 'yolo' })).toThrow(
      'unknown permission mode'
    )
    expect(() => parseControlAction({ action: 'stopTask' })).toThrow('taskId')
    expect(() => parseControlAction({ action: 'rm -rf' })).toThrow('unknown control action')
    expect(() => parseControlAction(null)).toThrow('unknown control action')
  })

  it('folds answers into the thread meta', () => {
    const meta = emptyChatEngineMeta('t1')
    expect(
      metaAfterControl(
        { action: 'contextUsage' },
        { totalTokens: 42_000, maxTokens: 1_000_000, percentage: 4 },
        meta
      )
    ).toEqual({ contextUsage: { usedTokens: 42_000, maxTokens: 1_000_000 } })
    expect(
      metaAfterControl(
        { action: 'mcpStatus' },
        { mcpServers: [{ name: 'muster', status: 'connected' }, { status: 'failed' }] },
        meta
      )?.session?.mcpServers
    ).toEqual([{ name: 'muster', status: 'connected' }])
    expect(metaAfterControl({ action: 'setModel', model: 'haiku' }, {}, meta)?.session?.model).toBe(
      'haiku'
    )
    expect(metaAfterControl({ action: 'interrupt' }, {}, meta)).toBeNull()
  })
})
