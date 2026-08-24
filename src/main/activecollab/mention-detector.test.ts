import { describe, expect, it } from 'vitest'
import type { ActiveCollabObjectUpdate } from '../../shared/activecollab-types'
import { AC_MENTION_SEEN_LIMIT, acDiffMentions, type AcMentionSeen } from './mention-detector'

const NOW = Date.parse('2026-08-21T10:00:00Z')

function update(overrides: Partial<ActiveCollabObjectUpdate> = {}): ActiveCollabObjectUpdate {
  return {
    taskId: 1,
    projectId: 7,
    projectName: 'Website Rebuild',
    taskNumber: 12,
    name: 'Ship the codec',
    lastUpdateOn: NOW,
    kinds: [{ kind: 'mention', count: 1 }],
    isSubscribed: true,
    ...overrides
  }
}

describe('first run', () => {
  it('seeds silently, so switching the feature on announces no history', () => {
    const result = acDiffMentions({ previous: null, updates: [update(), update({ taskId: 2 })] })

    expect(result.mentions).toEqual([])
    expect(result.seen).toEqual({ '1': NOW, '2': NOW })
  })
})

describe('emitting', () => {
  it('emits a mention the first time its stamp is seen', () => {
    const result = acDiffMentions({ previous: {}, updates: [update()] })

    expect(result.mentions.map((row) => row.taskId)).toEqual([1])
    expect(result.seen).toEqual({ '1': NOW })
  })

  it('does NOT re-emit the same mention on the next poll', () => {
    // The stream keeps returning pending updates, so this is the loop the seen-marker exists to stop.
    const first = acDiffMentions({ previous: {}, updates: [update()] })
    const second = acDiffMentions({ previous: first.seen, updates: [update()] })

    expect(second.mentions).toEqual([])
    expect(second.seen).toEqual({ '1': NOW })
  })

  it('emits again once the stamp advances, because that is a new mention', () => {
    const later = NOW + 60_000
    const result = acDiffMentions({
      previous: { '1': NOW },
      updates: [update({ lastUpdateOn: later })]
    })

    expect(result.mentions).toHaveLength(1)
    expect(result.seen).toEqual({ '1': later })
  })

  it('ignores a stamp that moved BACKWARDS rather than treating it as new', () => {
    const result = acDiffMentions({
      previous: { '1': NOW },
      updates: [update({ lastUpdateOn: NOW - 60_000 })]
    })

    expect(result.mentions).toEqual([])
    expect(result.seen).toEqual({ '1': NOW })
  })
})

describe('rows it refuses to act on', () => {
  it('skips a row whose kinds carry no mention', () => {
    const result = acDiffMentions({
      previous: {},
      updates: [update({ kinds: [{ kind: 'comment', count: 3 }] })]
    })

    expect(result.mentions).toEqual([])
    expect(result.seen).toEqual({})
  })

  it('skips an undated row WITHOUT recording it', () => {
    // Recording it would suppress a real later mention; emitting it would re-fire every poll.
    const result = acDiffMentions({ previous: {}, updates: [update({ lastUpdateOn: null })] })

    expect(result.mentions).toEqual([])
    expect(result.seen).toEqual({})
  })
})

describe('carry-forward', () => {
  it('keeps a task the current page no longer mentions, so it cannot re-fire later', () => {
    const result = acDiffMentions({ previous: { '9': NOW }, updates: [update({ taskId: 1 })] })

    expect(result.seen['9']).toBe(NOW)
    expect(result.seen['1']).toBe(NOW)
  })

  it('bounds the map by recency once it outgrows the cap', () => {
    const previous: AcMentionSeen = {}
    for (let index = 0; index < AC_MENTION_SEEN_LIMIT + 20; index += 1) {
      previous[String(index)] = NOW + index
    }

    const result = acDiffMentions({ previous, updates: [] })

    expect(Object.keys(result.seen)).toHaveLength(AC_MENTION_SEEN_LIMIT)
    // The newest survive; the oldest 20 are what fell out.
    expect(result.seen[String(AC_MENTION_SEEN_LIMIT + 19)]).toBe(NOW + AC_MENTION_SEEN_LIMIT + 19)
    expect(result.seen['0']).toBeUndefined()
  })
})
