import { describe, expect, it } from 'vitest'
import { setChecklistItems } from './project-pages-checklist-ops'

const PAGE = [
  '# Pre-launch',
  '',
  '- [x] Draft brief',
  '- [ ] Book QA session',
  '- [ ] Book QA session follow-up',
  '  - [ ] Send invoice',
  '',
  '```md',
  '- [ ] Send invoice',
  '```'
].join('\n')

describe('setChecklistItems', () => {
  it('ticks exact items, leaves look-alikes and fenced code alone', () => {
    const out = setChecklistItems(PAGE, ['book qa session', 'Send invoice'], ['Draft brief'])
    expect(out.markdown.split('\n').slice(2, 6)).toEqual([
      '- [ ] Draft brief',
      '- [x] Book QA session',
      '- [ ] Book QA session follow-up',
      '  - [x] Send invoice'
    ])
    expect(out.markdown).toContain('```md\n- [ ] Send invoice')
    expect(out).toMatchObject({
      checked: ['Book QA session', 'Send invoice'],
      unchecked: ['Draft brief']
    })
  })

  it('names the items when one is missing', () => {
    expect(() => setChecklistItems(PAGE, ['Ship it'], [])).toThrow(
      'No checklist item "Ship it". Items: Draft brief; Book QA session;'
    )
    expect(() => setChecklistItems('Plain text', ['x'], [])).toThrow('no checklist items')
    expect(() => setChecklistItems(PAGE, [], [])).toThrow('at least one item')
  })
})
