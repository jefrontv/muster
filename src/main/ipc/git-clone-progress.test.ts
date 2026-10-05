import { describe, expect, it } from 'vitest'
import {
  createCloneProgressTracker,
  overallClonePercent,
  parseCloneProgressLine
} from './git-clone-progress'

describe('parseCloneProgressLine', () => {
  it('reads server-side phases behind the remote: prefix', () => {
    expect(parseCloneProgressLine('remote: Counting objects:  34% (1053/3097)')).toEqual({
      phase: 'Counting objects',
      percent: 34
    })
  })

  it('reads local phases', () => {
    expect(parseCloneProgressLine('Receiving objects:  42% (420/1000), 1.2 MiB | 3 MiB/s')).toEqual(
      { phase: 'Receiving objects', percent: 42 }
    )
  })

  it('ignores lines without a percent', () => {
    expect(parseCloneProgressLine('remote: Enumerating objects: 3097, done.')).toBeNull()
    expect(parseCloneProgressLine("Cloning into 'site'...")).toBeNull()
  })
})

describe('overallClonePercent', () => {
  it('places each phase inside its share of the whole clone', () => {
    expect(overallClonePercent('Counting objects', 100)).toBe(5)
    expect(overallClonePercent('Receiving objects', 50)).toBe(45)
    expect(overallClonePercent('Updating files', 100)).toBe(100)
  })
})

describe('createCloneProgressTracker', () => {
  it('moves the bar during counting instead of sitting at 0', () => {
    const tracker = createCloneProgressTracker()
    const { updates } = tracker.push('remote: Counting objects:  50% (1548/3097)\r')
    expect(updates).toEqual([{ phase: 'Counting objects', percent: 3 }])
  })

  it('never goes backwards when the next phase starts at 0', () => {
    const tracker = createCloneProgressTracker()
    tracker.push('Receiving objects: 100% (10/10)\n')
    const { updates } = tracker.push('remote: Compressing objects:  10% (1/10)\r')
    expect(updates[0]?.percent).toBe(75)
  })

  it('joins a line split across chunks', () => {
    const tracker = createCloneProgressTracker()
    expect(tracker.push('Resolving del').lines).toEqual([])
    const { lines, updates } = tracker.push('tas:  40% (4/10)\r')
    expect(lines).toEqual(['Resolving deltas:  40% (4/10)'])
    expect(updates).toEqual([{ phase: 'Resolving deltas', percent: 81 }])
  })
})
