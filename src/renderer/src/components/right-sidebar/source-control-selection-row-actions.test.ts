import { describe, expect, it, vi } from 'vitest'
import type { GitStatusEntry } from '../../../../shared/types'
import type { FlatEntry } from './useSourceControlSelection'
import {
  createSourceControlSelectionRowActions,
  planSourceControlRowDiscardAction,
  planSourceControlRowIndexAction
} from './source-control-selection-row-actions'

function flat(
  path: string,
  area: FlatEntry['area'],
  status: GitStatusEntry['status'] = 'modified'
) {
  const entry: GitStatusEntry = { path, area, status }
  return { key: `${area}::${path}`, entry, area }
}

const a = flat('a.ts', 'unstaged')
const b = flat('b.ts', 'unstaged')
const c = flat('c.ts', 'untracked', 'untracked')
const s = flat('s.ts', 'staged')

describe('planSourceControlRowIndexAction', () => {
  it('acts on the single row when it is not part of a multi-selection', () => {
    expect(planSourceControlRowIndexAction(a.key, a.entry, [])).toEqual({
      type: 'stage',
      paths: ['a.ts'],
      bulk: false
    })
    expect(planSourceControlRowIndexAction(a.key, a.entry, [b, c])).toEqual({
      type: 'stage',
      paths: ['a.ts'],
      bulk: false
    })
  })

  it('stages every stageable selected row when the row is in the selection', () => {
    expect(planSourceControlRowIndexAction(a.key, a.entry, [a, b, s])).toEqual({
      type: 'stage',
      paths: ['a.ts', 'b.ts'],
      bulk: true
    })
  })

  it('unstages every staged selected row from a staged row', () => {
    const t = flat('t.ts', 'staged')
    expect(planSourceControlRowIndexAction(s.key, s.entry, [a, s, t])).toEqual({
      type: 'unstage',
      paths: ['s.ts', 't.ts'],
      bulk: true
    })
  })
})

describe('planSourceControlRowDiscardAction', () => {
  it('discards just the row outside a selection', () => {
    expect(planSourceControlRowDiscardAction(a.key, a.entry, [])).toEqual({
      type: 'discard-entry',
      entry: a.entry
    })
  })

  it('discards selected rows that share the invoked row area', () => {
    expect(planSourceControlRowDiscardAction(a.key, a.entry, [a, b, c, s])).toEqual({
      type: 'discard-paths',
      area: 'unstaged',
      paths: ['a.ts', 'b.ts']
    })
  })

  it('offers nothing for staged rows', () => {
    expect(planSourceControlRowDiscardAction(s.key, s.entry, [s])).toBeNull()
  })
})

describe('createSourceControlSelectionRowActions', () => {
  it('routes plans to single and bulk handlers', () => {
    const handlers = {
      stage: vi.fn(async () => {}),
      unstage: vi.fn(async () => {}),
      stagePaths: vi.fn(async () => {}),
      unstagePaths: vi.fn(async () => {}),
      discardEntry: vi.fn(),
      discardPaths: vi.fn()
    }
    const single = createSourceControlSelectionRowActions([], handlers)
    single.index(a.key, a.entry)
    single.discard(a.key, a.entry)
    expect(handlers.stage).toHaveBeenCalledWith('a.ts')
    expect(handlers.discardEntry).toHaveBeenCalledWith(a.entry)

    const bulk = createSourceControlSelectionRowActions([a, b], handlers)
    bulk.index(b.key, b.entry)
    bulk.discard(b.key, b.entry)
    expect(handlers.stagePaths).toHaveBeenCalledWith(['a.ts', 'b.ts'])
    expect(handlers.discardPaths).toHaveBeenCalledWith('unstaged', ['a.ts', 'b.ts'])
  })
})
