import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type React from 'react'
import {
  computeSourceControlTreeSetPositions,
  resolveSourceControlTreeNavigation,
  resolveSourceControlTreeTabStop,
  type SourceControlTreeNavRow
} from './source-control-tree-navigation'
import {
  createSourceControlTreeRowScroller,
  type SourceControlTreeRowScroller
} from './source-control-tree-contexts'
import {
  isSourceControlTreeMacPlatform,
  openSourceControlTreeRowContextMenu,
  resolveSourceControlTreeKeyCommand,
  resolveSourceControlTreeKeyTarget,
  SOURCE_CONTROL_TREE_ROW_ATTRIBUTE
} from './source-control-tree-key-commands'

export type SourceControlTreeItemProps = {
  role: 'treeitem'
  'aria-level': number
  'aria-posinset': number
  'aria-setsize': number
  'aria-expanded'?: boolean
  'aria-selected'?: boolean
  'aria-label'?: string
  tabIndex: number
  'data-source-control-tree-row': string
  ref: (element: HTMLElement | null) => void
  onFocus: (event: React.FocusEvent<HTMLElement>) => void
  onBlur: (event: React.FocusEvent<HTMLElement>) => void
}

export type SourceControlTreeKeyboardRow = SourceControlTreeNavRow & { label: string }

export type SourceControlTreeKeyboardHandlers<TRow> = {
  open: (row: TRow, element: HTMLElement) => void
  setExpanded: (row: TRow, expanded: boolean) => void
  toggleIndex: (row: TRow, element: HTMLElement) => void
  discard: (row: TRow, element: HTMLElement) => void
}

export function useSourceControlTreeKeyboard<TRow extends SourceControlTreeKeyboardRow>(
  rows: readonly TRow[],
  handlers: SourceControlTreeKeyboardHandlers<TRow>
) {
  const [rowScroller] = useState<SourceControlTreeRowScroller>(createSourceControlTreeRowScroller)
  const [activeId, setActiveIdState] = useState<string | null>(null)
  const [activeMounted, setActiveMounted] = useState(false)
  const activeIdRef = useRef<string | null>(null)
  const lastIndexRef = useRef(0)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const elementsRef = useRef(new Map<string, HTMLElement>())
  const focusedRowIdRef = useRef<string | null>(null)
  const pendingFocusIdRef = useRef<string | null>(null)
  const parkingRef = useRef(false)
  const pointerFocusRef = useRef(false)
  const handlersRef = useRef(handlers)
  useLayoutEffect(() => {
    handlersRef.current = handlers
  }, [handlers])

  const rowsById = useMemo(() => new Map(rows.map((row) => [row.id, row])), [rows])
  const setPositions = useMemo(() => computeSourceControlTreeSetPositions(rows), [rows])
  const rowIndexById = useMemo(() => new Map(rows.map((row, index) => [row.id, index])), [rows])

  const setActive = useCallback((id: string | null) => {
    activeIdRef.current = id
    setActiveIdState(id)
    setActiveMounted(id !== null && elementsRef.current.has(id))
  }, [])

  const parkFocusOnContainer = useCallback(() => {
    const container = containerRef.current
    if (!container) {
      return
    }
    parkingRef.current = true
    container.focus({ preventScroll: true })
    parkingRef.current = false
  }, [])

  const focusRow = useCallback(
    (id: string) => {
      setActive(id)
      const element = elementsRef.current.get(id)
      if (element) {
        pendingFocusIdRef.current = null
        element.focus({ preventScroll: true })
        element.scrollIntoView?.({ block: 'nearest' })
        return
      }
      pendingFocusIdRef.current = id
      rowScroller.scrollToRow(id)
    },
    [rowScroller, setActive]
  )

  // Why: the tab stop must follow row churn (staging, collapse, filter) without
  // stealing focus unless the focused row itself vanished.
  useLayoutEffect(() => {
    const next = resolveSourceControlTreeTabStop(rows, activeIdRef.current, lastIndexRef.current)
    lastIndexRef.current = next === null ? 0 : (rowIndexById.get(next) ?? 0)
    if (next === activeIdRef.current) {
      return
    }
    const hadParkedFocus =
      containerRef.current !== null && document.activeElement === containerRef.current
    if (hadParkedFocus && next !== null) {
      focusRow(next)
    } else {
      setActive(next)
    }
  }, [focusRow, rowIndexById, rows, setActive])

  const refCallbacksRef = useRef(new Map<string, (element: HTMLElement | null) => void>())
  const getRowRef = useCallback(
    (id: string) => {
      const cached = refCallbacksRef.current.get(id)
      if (cached) {
        return cached
      }
      const callback = (element: HTMLElement | null): void => {
        const elements = elementsRef.current
        if (element) {
          elements.set(id, element)
          if (id === activeIdRef.current) {
            setActiveMounted(true)
          }
          const wasPending = pendingFocusIdRef.current === id
          // Why: a row that scrolled back into the window reclaims focus parked on the container.
          const reclaim =
            id === activeIdRef.current && document.activeElement === containerRef.current
          if (wasPending || reclaim) {
            pendingFocusIdRef.current = null
            element.focus({ preventScroll: !wasPending })
            if (wasPending) {
              element.scrollIntoView?.({ block: 'nearest' })
            }
          }
          return
        }
        const previous = elements.get(id)
        elements.delete(id)
        if (id === activeIdRef.current) {
          setActiveMounted(false)
        }
        if (focusedRowIdRef.current !== id) {
          return
        }
        focusedRowIdRef.current = null
        const active = document.activeElement
        // Why: virtualisation unmounts rows scrolled out of view; park focus on the
        // tree so keys keep working instead of dropping to <body>.
        if (!active || active === document.body || (previous && previous.contains(active))) {
          parkFocusOnContainer()
        }
      }
      refCallbacksRef.current.set(id, callback)
      return callback
    },
    [parkFocusOnContainer]
  )

  const onRowFocus = useCallback(
    (event: React.FocusEvent<HTMLElement>) => {
      const id = event.currentTarget.getAttribute(SOURCE_CONTROL_TREE_ROW_ATTRIBUTE)
      if (id === null) {
        return
      }
      focusedRowIdRef.current = id
      if (activeIdRef.current !== id) {
        setActive(id)
      }
    },
    [setActive]
  )

  const onRowBlur = useCallback((event: React.FocusEvent<HTMLElement>) => {
    const next = event.relatedTarget
    // Why: a null relatedTarget includes the row being removed while focused; keep tracking it.
    if (next instanceof Node && !event.currentTarget.contains(next)) {
      focusedRowIdRef.current = null
    }
  }, [])

  const propsCacheRef = useRef(
    new Map<string, { signature: string; props: SourceControlTreeItemProps }>()
  )
  const getTreeItemProps = useCallback(
    (id: string, selected?: boolean): SourceControlTreeItemProps | undefined => {
      const row = rowsById.get(id)
      const index = rowIndexById.get(id)
      if (!row || index === undefined) {
        return undefined
      }
      const position = setPositions[index]
      const tabIndex = id === activeId ? 0 : -1
      const signature = [
        row.level,
        row.expanded,
        row.label,
        tabIndex,
        selected,
        position.posInSet,
        position.setSize
      ].join('|')
      const cached = propsCacheRef.current.get(id)
      if (cached?.signature === signature) {
        return cached.props
      }
      const props: SourceControlTreeItemProps = {
        role: 'treeitem',
        'aria-level': row.level,
        'aria-posinset': position.posInSet,
        'aria-setsize': position.setSize,
        'aria-expanded': row.expanded,
        'aria-selected': selected,
        'aria-label': row.label || undefined,
        tabIndex,
        [SOURCE_CONTROL_TREE_ROW_ATTRIBUTE]: id,
        ref: getRowRef(id),
        onFocus: onRowFocus,
        onBlur: onRowBlur
      }
      propsCacheRef.current.set(id, { signature, props })
      return props
    },
    [activeId, getRowRef, onRowBlur, onRowFocus, rowIndexById, rowsById, setPositions]
  )

  useLayoutEffect(() => {
    // Why: drop cached ref callbacks/props for rows that left the model so the maps stay bounded.
    for (const cache of [refCallbacksRef.current, propsCacheRef.current]) {
      for (const id of cache.keys()) {
        if (!rowsById.has(id)) {
          cache.delete(id)
        }
      }
    }
  }, [rowsById])

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.defaultPrevented || event.nativeEvent.isComposing) {
        return
      }
      const keyTarget = resolveSourceControlTreeKeyTarget(
        event.target as HTMLElement,
        event.currentTarget
      )
      const row = keyTarget ? rowsById.get(keyTarget.rowId ?? activeIdRef.current ?? '') : undefined
      const command = resolveSourceControlTreeKeyCommand(event, isSourceControlTreeMacPlatform())
      const element = row ? elementsRef.current.get(row.id) : undefined
      if (
        !row ||
        !command ||
        (command.type !== 'navigate' && !element) ||
        // Why: a mouse-focused nested button keeps its own Enter/Space; arrows and Delete still act on its row.
        (keyTarget?.onNestedControl && (command.type === 'open' || command.type === 'toggle-index'))
      ) {
        return
      }
      event.preventDefault()
      if (command.type === 'navigate') {
        const outcome = resolveSourceControlTreeNavigation(rows, row.id, command.command)
        if (outcome?.type === 'focus') {
          focusRow(outcome.id)
        } else if (outcome) {
          handlersRef.current.setExpanded(row, outcome.type === 'expand')
        }
      } else if (element && command.type === 'context-menu') {
        openSourceControlTreeRowContextMenu(element)
      } else if (element && command.type === 'open') {
        handlersRef.current.open(row, element)
      } else if (element && command.type === 'toggle-index') {
        handlersRef.current.toggleIndex(row, element)
      } else if (element && command.type === 'discard') {
        handlersRef.current.discard(row, element)
      }
    },
    [focusRow, rows, rowsById]
  )

  const onContainerFocus = useCallback(
    (event: React.FocusEvent<HTMLDivElement>) => {
      if (event.target !== event.currentTarget || parkingRef.current || pointerFocusRef.current) {
        return
      }
      // Why: the container is only tabbable while the tab-stop row is virtualised away.
      const id = resolveSourceControlTreeTabStop(rows, activeIdRef.current, lastIndexRef.current)
      if (id !== null) {
        focusRow(id)
      }
    },
    [focusRow, rows]
  )

  const onContainerPointerDown = useCallback(() => {
    pointerFocusRef.current = true
    // Why: the click's focus lands later in this same task, so clear on the next one.
    setTimeout(() => {
      pointerFocusRef.current = false
    }, 0)
  }, [])

  const setContainerRef = useCallback((element: HTMLDivElement | null) => {
    containerRef.current = element
  }, [])

  const hasRows = rows.length > 0
  const containerProps = {
    ref: setContainerRef,
    role: hasRows ? ('tree' as const) : undefined,
    'aria-multiselectable': hasRows ? true : undefined,
    tabIndex: hasRows ? (activeMounted ? -1 : 0) : undefined,
    onKeyDown,
    onFocus: onContainerFocus,
    onPointerDown: onContainerPointerDown
  }

  return { containerProps, rowScroller, getTreeItemProps }
}

export type SourceControlTreeKeyboard = ReturnType<typeof useSourceControlTreeKeyboard>
