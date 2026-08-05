import { describe, expect, it } from 'vitest'
import { Terminal } from 'lucide-react'
import {
  ACTION_PALETTE_MAX_PER_GROUP,
  rankActionPaletteEntries,
  selectActionPaletteResults
} from './action-palette-search'
import type { ActionPaletteEntry, ActionPaletteGroup } from './action-palette-entries'
import { CMD_J_PALETTE_QUERY_MAX_BYTES } from '../cmd-j/palette-results'

const GROUP_ORDER: Record<ActionPaletteGroup, number> = { action: 0, command: 1, settings: 2 }

function makeEntry({
  title,
  detail = 'Global',
  keywords = [],
  group = 'command',
  order = 0
}: {
  title: string
  detail?: string
  keywords?: string[]
  group?: ActionPaletteGroup
  order?: number
}): ActionPaletteEntry {
  return {
    id: `${group}:${title}`,
    group,
    groupOrder: GROUP_ORDER[group],
    title,
    detail,
    icon: Terminal,
    keybindingActionId: null,
    keywords,
    order,
    target: 'command',
    commandActionId: 'app.settings',
    invocable: true
  }
}

describe('rankActionPaletteEntries', () => {
  it('sorts by group then registry order when the query is empty', () => {
    const entries = [
      makeEntry({ title: 'Zebra setting', group: 'settings' }),
      makeEntry({ title: 'Second command', group: 'command', order: 1 }),
      makeEntry({ title: 'First command', group: 'command', order: 0 }),
      makeEntry({ title: 'An action', group: 'action' })
    ]

    expect(rankActionPaletteEntries('   ', entries).map((entry) => entry.title)).toEqual([
      'An action',
      'First command',
      'Second command',
      'Zebra setting'
    ])
  })

  it('ranks an exact title above a keyword-only match', () => {
    const entries = [
      makeEntry({ title: 'Reveal in Finder', keywords: ['terminal'] }),
      makeEntry({ title: 'Terminal' })
    ]

    expect(rankActionPaletteEntries('terminal', entries)[0].title).toBe('Terminal')
  })

  it('prefers a title prefix over a mid-word substring', () => {
    const entries = [
      makeEntry({ title: 'Reopen closed tab' }),
      makeEntry({ title: 'Close active tab' })
    ]

    expect(rankActionPaletteEntries('close', entries)[0].title).toBe('Close active tab')
  })

  it('matches initials through the subsequence scorer', () => {
    const entries = [makeEntry({ title: 'Go to File' }), makeEntry({ title: 'Grab Page Element' })]

    expect(rankActionPaletteEntries('gtf', entries).map((entry) => entry.title)).toEqual([
      'Go to File'
    ])
  })

  it('requires every query token to match somewhere', () => {
    const entries = [
      makeEntry({ title: 'Split terminal right', detail: 'Terminal Panes' }),
      makeEntry({ title: 'Split terminal down', detail: 'Terminal Panes' })
    ]

    expect(rankActionPaletteEntries('split right', entries).map((entry) => entry.title)).toEqual([
      'Split terminal right'
    ])
    expect(rankActionPaletteEntries('split sideways', entries)).toEqual([])
  })

  it('searches the settings path so a pane name narrows its rows', () => {
    const entries = [
      makeEntry({ title: 'Font Size', detail: 'Appearance › Font Size', group: 'settings' }),
      makeEntry({ title: 'Font Size', detail: 'Terminal › Font Size', group: 'settings', order: 1 })
    ]

    const ranked = rankActionPaletteEntries('terminal font', entries)

    expect(ranked.map((entry) => entry.detail)).toEqual(['Terminal › Font Size'])
  })

  it('refuses to score a pasted buffer', () => {
    const entries = [makeEntry({ title: 'Open Settings' })]
    const oversized = 'open settings '.repeat(CMD_J_PALETTE_QUERY_MAX_BYTES)

    expect(rankActionPaletteEntries(oversized, entries)).toEqual([])
  })
})

describe('selectActionPaletteResults', () => {
  it('caps each group on an empty query and reports the remainder', () => {
    const entries = Array.from({ length: ACTION_PALETTE_MAX_PER_GROUP + 4 }, (_, index) =>
      makeEntry({ title: `Command ${index}`, order: index })
    )

    const results = selectActionPaletteResults('', entries)

    expect(results.entries).toHaveLength(ACTION_PALETTE_MAX_PER_GROUP)
    expect(results.hiddenCount).toBe(4)
  })

  it('caps per group independently so every kind stays visible', () => {
    const entries = [
      ...Array.from({ length: ACTION_PALETTE_MAX_PER_GROUP + 2 }, (_, index) =>
        makeEntry({ title: `Command ${index}`, order: index })
      ),
      makeEntry({ title: 'A setting', group: 'settings' })
    ]

    const results = selectActionPaletteResults('', entries)

    expect(results.entries.filter((entry) => entry.group === 'command')).toHaveLength(
      ACTION_PALETTE_MAX_PER_GROUP
    )
    expect(results.entries.filter((entry) => entry.group === 'settings')).toHaveLength(1)
  })

  it('does not cap per group once a query narrows the list', () => {
    const entries = Array.from({ length: ACTION_PALETTE_MAX_PER_GROUP + 4 }, (_, index) =>
      makeEntry({ title: `Command ${index}`, order: index })
    )

    const results = selectActionPaletteResults('command', entries)

    expect(results.entries).toHaveLength(ACTION_PALETTE_MAX_PER_GROUP + 4)
    expect(results.hiddenCount).toBe(0)
  })
})
