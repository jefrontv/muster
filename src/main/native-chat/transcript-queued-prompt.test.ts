// A message sent while Claude is mid-turn lands as a `queued_command` attachment, not a user record.
import { describe, expect, it } from 'vitest'
import { decodeClaudeTranscriptLine } from './transcript-line-decoders-claude'

const line = (record: object): string => JSON.stringify(record)

const queued = (attachment: object): string =>
  line({
    type: 'attachment',
    uuid: 'q1',
    timestamp: '2026-10-07T00:04:04.804Z',
    attachment: { type: 'queued_command', commandMode: 'prompt', ...attachment }
  })

describe('claude queued prompts', () => {
  it('decodes a mid-turn message as the user turn it was, at its delivery time', () => {
    const message = decodeClaudeTranscriptLine(
      queued({ prompt: [{ type: 'text', text: 'you might need to clone it' }] }),
      'fallback'
    )
    expect(message).toEqual({
      id: 'q1',
      role: 'user',
      blocks: [{ type: 'text', text: 'you might need to clone it' }],
      timestamp: Date.parse('2026-10-07T00:04:04.804Z'),
      source: 'transcript'
    })
  })

  it('accepts a plain string prompt', () => {
    const message = decodeClaudeTranscriptLine(queued({ prompt: 'also check staging' }), 'f')
    expect(message?.blocks).toEqual([{ type: 'text', text: 'also check staging' }])
  })

  it('ignores harness traffic and other attachments', () => {
    expect(
      decodeClaudeTranscriptLine(
        queued({ commandMode: 'task-notification', prompt: '<task-notification>…' }),
        'f'
      )
    ).toBeNull()
    expect(
      decodeClaudeTranscriptLine(
        line({ type: 'attachment', attachment: { type: 'output_style', style: 'x' } }),
        'f'
      )
    ).toBeNull()
    expect(decodeClaudeTranscriptLine(queued({ prompt: '   ' }), 'f')).toBeNull()
  })
})
