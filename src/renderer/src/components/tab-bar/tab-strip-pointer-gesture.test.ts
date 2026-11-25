import { describe, expect, it } from 'vitest'
import {
  markTabStripPointerActivation,
  takeTabStripPointerActivation
} from './tab-strip-pointer-gesture'

describe('tab strip pointer activation marker', () => {
  it('reports a recent click activation once', () => {
    markTabStripPointerActivation(1000)
    expect(takeTabStripPointerActivation(1100)).toBe(true)
    expect(takeTabStripPointerActivation(1150)).toBe(false)
  })

  it('expires stale marks', () => {
    markTabStripPointerActivation(1000)
    expect(takeTabStripPointerActivation(2000)).toBe(false)
  })
})
