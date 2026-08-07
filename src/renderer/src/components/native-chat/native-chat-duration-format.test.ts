import { describe, it, expect } from 'vitest'
import {
  formatNativeChatDuration,
  formatNativeChatWorkingElapsed
} from './native-chat-duration-format'

describe('formatNativeChatDuration', () => {
  it('renders sub-second durations as milliseconds (floor of 1ms)', () => {
    expect(formatNativeChatDuration(0)).toBe('1ms')
    expect(formatNativeChatDuration(0.2)).toBe('1ms')
    expect(formatNativeChatDuration(420)).toBe('420ms')
    expect(formatNativeChatDuration(999)).toBe('999ms')
  })
  it('renders under 10s with tenths', () => {
    expect(formatNativeChatDuration(1_000)).toBe('1.0s')
    expect(formatNativeChatDuration(4_260)).toBe('4.3s')
    expect(formatNativeChatDuration(9_940)).toBe('9.9s')
  })
  it('rounds 9.95s+ into the whole-second bucket', () => {
    expect(formatNativeChatDuration(9_960)).toBe('10s')
  })
  it('renders under a minute as whole seconds', () => {
    expect(formatNativeChatDuration(12_400)).toBe('12s')
    expect(formatNativeChatDuration(59_400)).toBe('59s')
  })
  it('renders minutes with seconds', () => {
    expect(formatNativeChatDuration(60_000)).toBe('1m 0s')
    expect(formatNativeChatDuration(252_000)).toBe('4m 12s')
  })
  it('carries a rounded-up 60s into the next minute', () => {
    expect(formatNativeChatDuration(119_600)).toBe('2m 0s')
  })
  it('treats invalid input as zero', () => {
    expect(formatNativeChatDuration(-5)).toBe('0ms')
    expect(formatNativeChatDuration(Number.NaN)).toBe('0ms')
  })
})

describe('formatNativeChatWorkingElapsed', () => {
  it('ticks whole seconds under a minute', () => {
    expect(formatNativeChatWorkingElapsed(0)).toBe('0s')
    expect(formatNativeChatWorkingElapsed(12_900)).toBe('12s')
  })
  it('switches to minutes and seconds', () => {
    expect(formatNativeChatWorkingElapsed(60_000)).toBe('1m 0s')
    expect(formatNativeChatWorkingElapsed(94_000)).toBe('1m 34s')
  })
  it('treats invalid input as zero', () => {
    expect(formatNativeChatWorkingElapsed(-1)).toBe('0s')
  })
})
