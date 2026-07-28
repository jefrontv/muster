import { describe, expect, it } from 'vitest'

import { activeCollabGroupCollapseKey } from './task-page-activecollab-group-collapse'

// These keys go straight into the sidebar's persisted `collapsedGroups` array, so the format is a
// storage contract: changing it silently drops every collapse the user has already made.
describe('activeCollabGroupCollapseKey', () => {
  it('namespaces the project id', () => {
    expect(activeCollabGroupCollapseKey(3790)).toBe('activecollab-project:3790')
  })

  it('keeps distinct projects apart', () => {
    expect(activeCollabGroupCollapseKey(10)).not.toBe(activeCollabGroupCollapseKey(100))
  })

  // The set is shared with repo/host/lineage/pinned headers; an unprefixed id would collide.
  it('cannot be mistaken for a sidebar group key with the same id', () => {
    const key = activeCollabGroupCollapseKey(10)
    expect(['10', 'repo:10', 'host:10', 'lineage:10', 'pinned', 'all']).not.toContain(key)
  })
})
