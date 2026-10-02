import { describe, expect, it } from 'vitest'
import { joinDisplayPath } from './site-display-path'

describe('joinDisplayPath', () => {
  it('keeps the separator a root already uses', () => {
    expect(joinDisplayPath('/Users/me/Sites', 'flex')).toBe('/Users/me/Sites/flex')
    expect(joinDisplayPath('C:\\Sites\\', 'flex')).toBe('C:\\Sites\\flex')
  })
})
