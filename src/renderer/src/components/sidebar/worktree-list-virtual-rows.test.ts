import { describe, expect, it } from 'vitest'
import {
  GROUP_HEADER_ROW_HEIGHT,
  HOST_HEADER_ROW_HEIGHT,
  NEW_CARD_STYLE_GROUP_HEADER_TOP_MARGIN,
  NEW_CARD_STYLE_TWO_LINE_ROW_HEIGHT,
  estimateRenderRowSize,
  pruneStaleVirtualRowElementCache,
  type RenderRow
} from './worktree-list-virtual-rows'

// Why: estimates only read `type`, `key` and `rows.length`; full row fixtures add nothing.
const header = (key: string): RenderRow => ({ type: 'header', key }) as unknown as RenderRow
const hostHeader = (key: string): RenderRow =>
  ({ type: 'host-header', key }) as unknown as RenderRow
const item = (key: string): RenderRow => ({ type: 'item', key }) as unknown as RenderRow
const lineageGroup = (childCount: number): RenderRow =>
  ({
    type: 'lineage-group',
    key: 'lineage',
    rows: Array.from({ length: childCount + 1 }, (_, index) => item(`wt:${index}`))
  }) as unknown as RenderRow
const folderWorkspace = (): RenderRow =>
  ({ type: 'folder-workspace', key: 'fw' }) as unknown as RenderRow
const rows: RenderRow[] = [
  header('hdr:a'),
  item('wt:a'),
  header('hdr:b'),
  hostHeader('host:b'),
  lineageGroup(2),
  folderWorkspace()
]

describe('estimateRenderRowSize', () => {
  it('keeps legacy estimates when the new-style flag is off', () => {
    const legacy = rows.map((_, index) => estimateRenderRowSize(rows, index, 0))
    expect(legacy).toEqual([28, 116, 32, 36, 292, 64])
    expect(rows.map((_, index) => estimateRenderRowSize(rows, index, 0, false))).toEqual(legacy)
  })

  it('uses the 8px new-style header top spacing and compact row heights', () => {
    expect(rows.map((_, index) => estimateRenderRowSize(rows, index, 0, true))).toEqual([
      GROUP_HEADER_ROW_HEIGHT,
      NEW_CARD_STYLE_TWO_LINE_ROW_HEIGHT,
      GROUP_HEADER_ROW_HEIGHT + NEW_CARD_STYLE_GROUP_HEADER_TOP_MARGIN,
      HOST_HEADER_ROW_HEIGHT + 4,
      50 + 2 * 54,
      50
    ])
    expect(GROUP_HEADER_ROW_HEIGHT + NEW_CARD_STYLE_GROUP_HEADER_TOP_MARGIN).toBe(36)
  })
})

describe('pruneStaleVirtualRowElementCache', () => {
  it('removes stale measured row elements before they retain old WorktreeCard scopes', () => {
    const activeElement = {
      isConnected: true,
      getAttribute: (name: string) =>
        name === 'data-worktree-virtual-row-key' ? 'wt:active' : null
    } as Element
    const staleElement = {
      isConnected: false,
      getAttribute: (name: string) => (name === 'data-worktree-virtual-row-key' ? 'wt:stale' : null)
    } as Element
    const connectedStaleElement = {
      isConnected: true,
      getAttribute: (name: string) =>
        name === 'data-worktree-virtual-row-key' ? 'wt:connected-stale' : null
    } as Element
    const retainedScope = {
      defaultHostId: 'runtime:env-1',
      handlerName: 'handleOpenReviewInOrca'
    }
    Object.assign(staleElement, { __retainedWorktreeCardScopeForTest: retainedScope })

    const virtualizer = {
      elementsCache: new Map<string, Element>([
        ['wt:active', activeElement],
        ['wt:stale', staleElement],
        ['wt:connected-stale', connectedStaleElement]
      ]),
      measureElement: (element: Element | null) => {
        if (element) {
          throw new Error('stale cache pruning should not remeasure rows')
        }
      }
    }

    pruneStaleVirtualRowElementCache({
      activeRowKeys: new Set(['wt:active']),
      virtualizer
    })

    expect(virtualizer.elementsCache.get('wt:active')).toBe(activeElement)
    expect(virtualizer.elementsCache.has('wt:stale')).toBe(false)
    expect(virtualizer.elementsCache.get('wt:connected-stale')).toBe(connectedStaleElement)
  })
})
