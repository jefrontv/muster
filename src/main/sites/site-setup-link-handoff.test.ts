import { afterEach, describe, expect, it } from 'vitest'
import {
  dropHeldLink,
  holdOpenedLinkForCard,
  linkForCard,
  linkSummaryForCard
} from './site-setup-link-handoff'

const OPENED =
  'muster://configure?reponame=efront_au%2Faidc&hostname=cl.1.efront.digital&username=aidcweb&password=opened%21&branch=master'
const COPIED = 'muster://configure?hostname=other.example.com&username=u&password=copied'

afterEach(() => {
  dropHeldLink('card-1')
  dropHeldLink('card-2')
})

describe('opened link handoff', () => {
  it('leaves the link to the bind modal when no password card waits', () => {
    expect(holdOpenedLinkForCard(OPENED, [])).toBeNull()
  })

  it('leaves a link without a password to the bind modal', () => {
    expect(holdOpenedLinkForCard('muster://configure?hostname=h&username=u', ['card-1'])).toBeNull()
  })

  it('gives the link to the front card and prefers it over the clipboard', () => {
    expect(holdOpenedLinkForCard(OPENED, ['card-1', 'card-2'])).toBe('card-1')
    expect(linkForCard('card-1', COPIED)?.password).toBe('opened!')
    expect(linkSummaryForCard('card-1', COPIED)).toMatchObject({
      source: 'opened',
      hostname: 'cl.1.efront.digital'
    })
    expect(JSON.stringify(linkSummaryForCard('card-1', COPIED))).not.toContain('opened!')
    expect(linkSummaryForCard('card-2', COPIED)).toMatchObject({ source: 'clipboard' })
  })

  it('forgets the held password once the card settles', () => {
    holdOpenedLinkForCard(OPENED, ['card-1'])
    dropHeldLink('card-1')
    expect(linkForCard('card-1', '')).toBeNull()
  })
})
