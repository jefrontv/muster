import { describe, expect, it } from 'vitest'
import type {
  ExtensionInventoryEntry,
  ExtensionStatus
} from '../../../../shared/extension-state-types'
import {
  countExtensionsByTab,
  DEFAULT_EXTENSION_FILTER,
  extensionTabFor,
  filterExtensions,
  sortExtensionsByUrgency
} from './extension-filter'

function item(
  id: string,
  overrides: {
    kind?: 'skill' | 'mcp' | 'app'
    status?: ExtensionStatus
    installed?: boolean
    keywords?: string[]
    description?: string
  } = {}
): ExtensionInventoryEntry {
  return {
    entry: {
      id,
      kind: overrides.kind ?? 'mcp',
      name: id,
      description: overrides.description ?? '',
      keywords: overrides.keywords ?? [],
      version: '1.0.0',
      install: { method: 'bundled-skill', skill: 'inert' },
      latest: { source: 'bundled' }
    },
    state: {
      id,
      installed: overrides.installed ?? false,
      installedVersion: null,
      latestVersion: null,
      status: overrides.status ?? 'not-installed',
      binaryPath: null,
      harnesses: [],
      autoUpdateSupported: false,
      autoUpdateEnabled: false
    }
  }
}

describe('extensionTabFor', () => {
  it('sends skills left and everything else right', () => {
    expect(extensionTabFor(item('a', { kind: 'skill' }))).toBe('skills')
    expect(extensionTabFor(item('b', { kind: 'mcp' }))).toBe('tools')
    expect(extensionTabFor(item('c', { kind: 'app' }))).toBe('tools')
  })
})

describe('filterExtensions', () => {
  const entries = [
    item('acme-mcp', { keywords: ['tasks'] }),
    item('wp-skill', { kind: 'skill', installed: true, status: 'current' }),
    item('old-tool', { kind: 'app', installed: true, status: 'outdated' })
  ]

  it('shows only the active tab', () => {
    expect(filterExtensions(entries, DEFAULT_EXTENSION_FILTER).map((e) => e.entry.id)).toEqual([
      'acme-mcp',
      'old-tool'
    ])
  })

  it('matches a keyword that is not in the name', () => {
    const result = filterExtensions(entries, { ...DEFAULT_EXTENSION_FILTER, query: 'tasks' })
    expect(result.map((e) => e.entry.id)).toEqual(['acme-mcp'])
  })

  it('requires every search term, so two words narrow rather than widen', () => {
    const list = [item('one', { description: 'alpha beta' }), item('two', { description: 'alpha' })]
    const result = filterExtensions(list, { ...DEFAULT_EXTENSION_FILTER, query: 'alpha beta' })
    expect(result.map((e) => e.entry.id)).toEqual(['one'])
  })

  it('filters by status', () => {
    expect(
      filterExtensions(entries, { ...DEFAULT_EXTENSION_FILTER, status: 'updates' }).map(
        (e) => e.entry.id
      )
    ).toEqual(['old-tool'])
    expect(
      filterExtensions(entries, { ...DEFAULT_EXTENSION_FILTER, status: 'available' }).map(
        (e) => e.entry.id
      )
    ).toEqual(['acme-mcp'])
  })
})

describe('countExtensionsByTab', () => {
  it('honours the search so the inactive tab shows real matches', () => {
    const entries = [item('acme-mcp'), item('acme-skill', { kind: 'skill' }), item('other')]
    expect(countExtensionsByTab(entries, 'acme')).toEqual({ skills: 1, tools: 1 })
  })

  it('counts everything when nothing is typed', () => {
    expect(countExtensionsByTab([item('a'), item('b', { kind: 'skill' })], '')).toEqual({
      skills: 1,
      tools: 1
    })
  })
})

describe('sortExtensionsByUrgency', () => {
  it('leads with what needs doing and sinks what cannot be done', () => {
    const entries = [
      item('installed', { installed: true, status: 'current' }),
      item('blocked', { status: 'no-access' }),
      item('available'),
      item('outdated', { installed: true, status: 'outdated' })
    ]
    expect(sortExtensionsByUrgency(entries).map((e) => e.entry.id)).toEqual([
      'outdated',
      'available',
      'installed',
      'blocked'
    ])
  })

  it('breaks ties by name rather than by scan order', () => {
    const entries = [item('zeta'), item('alpha')]
    expect(sortExtensionsByUrgency(entries).map((e) => e.entry.id)).toEqual(['alpha', 'zeta'])
  })
})
