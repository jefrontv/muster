// Slash-command feedback in transcripts: stdout and compact markers surface as
// quiet system lines (a chat thread's only feedback), command echoes as the
// user turn they were, envelopes/caveats stay dropped.

import { describe, expect, it } from 'vitest'
import { decodeClaudeTranscriptLine } from './transcript-line-decoders-claude'

const line = (record: object): string => JSON.stringify(record)

describe('claude transcript command feedback', () => {
  it('surfaces system local_command stdout as a system message', () => {
    const message = decodeClaudeTranscriptLine(
      line({
        type: 'system',
        subtype: 'local_command',
        uuid: 'u1',
        content: '<local-command-stdout>Unknown command: /foobar</local-command-stdout>'
      }),
      'fallback'
    )
    expect(message?.role).toBe('system')
    expect(message?.blocks).toEqual([{ type: 'text', text: 'Unknown command: /foobar' }])
  })

  it('renders the command echo as the user turn it was', () => {
    const message = decodeClaudeTranscriptLine(
      line({ type: 'system', subtype: 'local_command', uuid: 'u2', content: '/foobar' }),
      'fallback'
    )
    expect(message?.role).toBe('user')
    expect(message?.blocks).toEqual([{ type: 'text', text: '/foobar' }])
  })

  it('surfaces a compact boundary as a system marker', () => {
    const message = decodeClaudeTranscriptLine(
      line({ type: 'system', subtype: 'compact_boundary', content: 'Conversation compacted' }),
      'fallback'
    )
    expect(message?.role).toBe('system')
    expect(message?.blocks).toEqual([{ type: 'text', text: 'Conversation compacted' }])
  })

  it('drops empty stdout and other system records', () => {
    expect(
      decodeClaudeTranscriptLine(
        line({
          type: 'system',
          subtype: 'local_command',
          content: '<local-command-stdout></local-command-stdout>'
        }),
        'f'
      )
    ).toBeNull()
    expect(decodeClaudeTranscriptLine(line({ type: 'system', subtype: 'init' }), 'f')).toBeNull()
  })

  it('truncates hook-spam stdout to a status line, not a log', () => {
    const message = decodeClaudeTranscriptLine(
      line({
        type: 'system',
        subtype: 'local_command',
        content: `<local-command-stdout>${'x'.repeat(900)}</local-command-stdout>`
      }),
      'f'
    )
    const text = message?.blocks[0]?.type === 'text' ? message.blocks[0].text : ''
    expect(text.length).toBeLessThanOrEqual(401)
    expect(text.endsWith('…')).toBe(true)
  })

  it('handles the older harness shape: stdout as a user record', () => {
    const message = decodeClaudeTranscriptLine(
      line({
        type: 'user',
        uuid: 'u3',
        message: {
          role: 'user',
          content: '<local-command-stdout>Compacted</local-command-stdout>'
        }
      }),
      'fallback'
    )
    expect(message?.role).toBe('system')
    expect(message?.blocks).toEqual([{ type: 'text', text: 'Compacted' }])
  })

  it('still drops command envelopes and caveats', () => {
    for (const content of [
      '<command-name>/compact</command-name>\n<command-message>compact</command-message>',
      '<local-command-caveat>stuff</local-command-caveat>'
    ]) {
      expect(
        decodeClaudeTranscriptLine(line({ type: 'user', message: { role: 'user', content } }), 'f')
      ).toBeNull()
    }
  })
})
