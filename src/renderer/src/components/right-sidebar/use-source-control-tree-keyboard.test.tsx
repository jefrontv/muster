// @vitest-environment happy-dom

import { act, useContext, useEffect, useState, type ReactElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SourceControlKeyboardTree } from './source-control-keyboard-tree'
import { SourceControlTreeRowScrollContext } from './source-control-tree-contexts'
import {
  useSourceControlTreeKeyboard,
  type SourceControlTreeKeyboardHandlers,
  type SourceControlTreeKeyboardRow
} from './use-source-control-tree-keyboard'

const ROWS: SourceControlTreeKeyboardRow[] = [
  { id: 'section::staged', level: 1, expanded: true, label: 'Staged Changes, 2 files' },
  { id: 'staged::a.ts', level: 2, label: 'a.ts, modified, staged' },
  { id: 'staged::b.ts', level: 2, label: 'b.ts, added, staged' },
  { id: 'section::unstaged', level: 1, expanded: false, label: 'Changes, 1 file' }
]

let host: HTMLDivElement
let root: Root
let handlers: {
  [K in keyof SourceControlTreeKeyboardHandlers<SourceControlTreeKeyboardRow>]: ReturnType<
    typeof vi.fn
  >
}
let setMountedFromTest: (ids: Set<string>) => void
let scrollRequests: string[]

// Why: stands in for a virtualised section: rows outside `mounted` are not in the DOM until scrolled to.
function FakeVirtualList({
  rows,
  mounted,
  setMounted,
  render
}: {
  rows: readonly SourceControlTreeKeyboardRow[]
  mounted: Set<string>
  setMounted: (update: (prev: Set<string>) => Set<string>) => void
  render: (row: SourceControlTreeKeyboardRow) => ReactElement
}): ReactElement {
  const scroller = useContext(SourceControlTreeRowScrollContext)
  useEffect(
    () =>
      scroller?.register({
        scrollToRow: (id) => {
          scrollRequests.push(id)
          setMounted((prev) => new Set([...prev, id]))
          return true
        }
      }),
    [scroller, setMounted]
  )
  return <>{rows.filter((row) => mounted.has(row.id)).map(render)}</>
}

function Harness({ initiallyMounted }: { initiallyMounted: string[] }): ReactElement {
  const [mounted, setMounted] = useState(() => new Set(initiallyMounted))
  setMountedFromTest = setMounted
  const keyboard = useSourceControlTreeKeyboard(
    ROWS,
    handlers as unknown as SourceControlTreeKeyboardHandlers<SourceControlTreeKeyboardRow>
  )
  return (
    <div>
      <input data-testid="commit-message" />
      <SourceControlKeyboardTree keyboard={keyboard} label="Changed files">
        <FakeVirtualList
          rows={ROWS}
          mounted={mounted}
          setMounted={setMounted}
          render={(row) => (
            <div key={row.id} data-testid={row.id} {...keyboard.getTreeItemProps(row.id, false)}>
              {row.id}
              <button type="button" data-testid={`${row.id}-button`}>
                stage
              </button>
            </div>
          )}
        />
      </SourceControlKeyboardTree>
    </div>
  )
}

function render(initiallyMounted = ROWS.map((row) => row.id)): void {
  act(() => root.render(<Harness initiallyMounted={initiallyMounted} />))
}

function el(id: string): HTMLElement {
  const found = host.querySelector<HTMLElement>(`[data-testid="${id}"]`)
  if (!found) {
    throw new Error(`missing ${id}`)
  }
  return found
}

function press(target: Element, key: string, init: KeyboardEventInit = {}): void {
  act(() => {
    target.dispatchEvent(
      new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init })
    )
  })
}

function focus(target: HTMLElement): void {
  act(() => target.focus())
}

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  handlers = { open: vi.fn(), setExpanded: vi.fn(), toggleIndex: vi.fn(), discard: vi.fn() }
  scrollRequests = []
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})

afterEach(() => {
  act(() => root.unmount())
  host.remove()
  vi.restoreAllMocks()
})

describe('useSourceControlTreeKeyboard', () => {
  it('exposes a tree with exactly one tabbable row and treeitem semantics', () => {
    render()
    const tree = host.querySelector('[role="tree"]')
    expect(tree?.getAttribute('aria-label')).toBe('Changed files')
    const items = Array.from(host.querySelectorAll('[role="treeitem"]'))
    expect(items.map((item) => item.getAttribute('tabindex'))).toEqual(['0', '-1', '-1', '-1'])
    expect(el('staged::a.ts').getAttribute('aria-label')).toBe('a.ts, modified, staged')
    expect(el('staged::a.ts').getAttribute('aria-level')).toBe('2')
    expect(el('section::unstaged').getAttribute('aria-expanded')).toBe('false')
    expect(el('staged::a.ts').hasAttribute('aria-expanded')).toBe(false)
  })

  it('moves focus with arrows, Home and End and carries the tab stop along', () => {
    render()
    focus(el('section::staged'))
    press(el('section::staged'), 'ArrowDown')
    expect(document.activeElement).toBe(el('staged::a.ts'))
    expect(el('staged::a.ts').getAttribute('tabindex')).toBe('0')
    expect(el('section::staged').getAttribute('tabindex')).toBe('-1')
    press(el('staged::a.ts'), 'End')
    expect(document.activeElement).toBe(el('section::unstaged'))
    press(el('section::unstaged'), 'Home')
    expect(document.activeElement).toBe(el('section::staged'))
    press(el('section::staged'), 'ArrowUp')
    expect(document.activeElement).toBe(el('section::staged'))
  })

  it('collapses and expands with Left/Right and moves to the parent from a leaf', () => {
    render()
    focus(el('staged::b.ts'))
    press(el('staged::b.ts'), 'ArrowLeft')
    expect(document.activeElement).toBe(el('section::staged'))
    press(el('section::staged'), 'ArrowLeft')
    expect(handlers.setExpanded).toHaveBeenCalledWith(ROWS[0], false)
    focus(el('section::unstaged'))
    press(el('section::unstaged'), 'ArrowRight')
    expect(handlers.setExpanded).toHaveBeenCalledWith(ROWS[3], true)
  })

  it('maps Enter, Space and Delete to row commands', () => {
    render()
    const row = el('staged::a.ts')
    focus(row)
    press(row, 'Enter')
    press(row, ' ')
    press(row, 'Delete')
    expect(handlers.open).toHaveBeenCalledWith(ROWS[1], row)
    expect(handlers.toggleIndex).toHaveBeenCalledWith(ROWS[1], row)
    expect(handlers.discard).toHaveBeenCalledWith(ROWS[1], row)
  })

  it('treats Backspace as discard only on Mac', () => {
    render()
    const row = el('staged::a.ts')
    focus(row)
    const userAgent = vi.spyOn(navigator, 'userAgent', 'get')
    userAgent.mockReturnValue('Windows NT')
    press(row, 'Backspace')
    expect(handlers.discard).not.toHaveBeenCalled()
    userAgent.mockReturnValue('Macintosh')
    press(row, 'Backspace')
    expect(handlers.discard).toHaveBeenCalledTimes(1)
  })

  it('opens the row context menu with Shift+F10 and the ContextMenu key', () => {
    render()
    const row = el('staged::a.ts')
    const onContextMenu = vi.fn()
    row.addEventListener('contextmenu', onContextMenu)
    focus(row)
    press(row, 'F10', { shiftKey: true })
    press(row, 'ContextMenu')
    expect(onContextMenu).toHaveBeenCalledTimes(2)
  })

  it('ignores keys typed outside the tree', () => {
    render()
    const input = el('commit-message')
    focus(input)
    press(input, ' ')
    press(input, 'ArrowDown')
    press(input, 'Delete')
    expect(handlers.toggleIndex).not.toHaveBeenCalled()
    expect(handlers.discard).not.toHaveBeenCalled()
    expect(document.activeElement).toBe(input)
  })

  it('leaves Enter/Space to a nested control but still navigates from it', () => {
    render()
    const button = el('staged::a.ts-button')
    focus(button)
    press(button, ' ')
    press(button, 'Enter')
    expect(handlers.toggleIndex).not.toHaveBeenCalled()
    expect(handlers.open).not.toHaveBeenCalled()
    press(button, 'ArrowDown')
    expect(document.activeElement).toBe(el('staged::b.ts'))
  })

  it('scrolls an unmounted target row into the window, then focuses it', () => {
    render(['section::staged', 'staged::a.ts'])
    focus(el('section::staged'))
    press(el('section::staged'), 'End')
    expect(scrollRequests).toEqual(['section::unstaged'])
    expect(document.activeElement).toBe(el('section::unstaged'))
  })

  it('parks focus on the tree while the focused row is virtualised away, then restores it', () => {
    render()
    const tree = host.querySelector<HTMLElement>('[role="tree"]')
    focus(el('staged::b.ts'))
    act(() => setMountedFromTest(new Set(['section::staged', 'staged::a.ts'])))
    expect(document.activeElement).toBe(tree)
    // Why: with the tab-stop row unmounted the container itself must stay reachable by Tab.
    expect(tree?.getAttribute('tabindex')).toBe('0')
    press(tree as HTMLElement, 'ArrowUp')
    expect(document.activeElement).toBe(el('staged::a.ts'))

    focus(el('staged::a.ts'))
    act(() => setMountedFromTest(new Set(['section::staged'])))
    expect(document.activeElement).toBe(tree)
    act(() => setMountedFromTest(new Set(ROWS.map((row) => row.id))))
    expect(document.activeElement).toBe(el('staged::a.ts'))
    expect(tree?.getAttribute('tabindex')).toBe('-1')
  })
})
