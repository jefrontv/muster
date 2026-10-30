// Ported from the muster-bots fork (src/components/RichTable.tsx TableViewport), Apache-2.0.
// The table itself: sortable headers, fitted or fixed columns, virtual rows past 80.

import { useEffect, useMemo, useRef, useState } from 'react'
import type React from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { ArrowDown, ArrowUp } from 'lucide-react'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import {
  columnMinimums,
  columnWidths,
  fitsColumns,
  isTableNumber,
  type ChatTableSort
} from './chat-table-data'

export type ChatTableAlign = 'left' | 'center' | 'right'
export type ChatTableCell = { text: string; content?: React.ReactNode; align?: ChatTableAlign }

const VIRTUAL_ROWS = 80

export function ChatTableViewport(props: {
  columns: ChatTableCell[]
  rows: ChatTableCell[][]
  order: number[]
  name: string
  wrap: boolean
  large: boolean
  sort: ChatTableSort
  onSort: (column: number) => void
}): React.JSX.Element {
  const { columns, rows, order, sort } = props
  const scroll = useRef<HTMLDivElement>(null)
  const heading = useRef<HTMLTableSectionElement>(null)
  const [headingHeight, setHeadingHeight] = useState(40)
  const [available, setAvailable] = useState<number | null>(null)
  useEffect(() => {
    const element = scroll.current
    const head = heading.current
    if (!element || !head || typeof ResizeObserver === 'undefined') {
      return
    }
    const observer = new ResizeObserver(() => {
      setHeadingHeight(head.getBoundingClientRect().height)
      setAvailable(element.clientWidth || null)
    })
    observer.observe(element)
    observer.observe(head)
    return () => observer.disconnect()
  }, [])
  const virtual = order.length > VIRTUAL_ROWS
  const headers = useMemo(() => columns.map((column) => column.text), [columns])
  const values = useMemo(() => rows.map((row) => row.map((cell) => cell.text)), [rows])
  const minimums = useMemo(() => columnMinimums(headers, values), [headers, values])
  const widths = useMemo(() => columnWidths(headers, values), [headers, values])
  const fit = fitsColumns({ wrap: props.wrap, virtual, minimums, available })
  const numeric = useMemo(
    () =>
      columns.map((_, index) => {
        const filled = values
          .slice(0, 200)
          .map((row) => row[index]?.trim() ?? '')
          .filter(Boolean)
        return filled.length > 0 && filled.every(isTableNumber)
      }),
    [columns, values]
  )
  const virtualizer = useVirtualizer({
    count: order.length,
    getScrollElement: () => scroll.current,
    estimateSize: () => 42,
    getItemKey: (index) => order[index]!,
    overscan: 6,
    enabled: virtual,
    initialRect: { width: 800, height: 400 },
    scrollMargin: headingHeight
  })
  useEffect(() => {
    if (scroll.current) {
      scroll.current.scrollTop = 0
    }
  }, [order])
  const items = virtual
    ? virtualizer.getVirtualItems()
    : order.map((id, index) => ({ key: id, index, start: 0, end: 0 }))
  const before = virtual && items.length ? Math.max(0, items[0]!.start - headingHeight) : 0
  const after =
    virtual && items.length
      ? Math.max(0, virtualizer.getTotalSize() - items.at(-1)!.end + headingHeight)
      : 0
  const alignOf = (column: ChatTableCell, index: number): ChatTableAlign =>
    column.align ?? (numeric[index] ? 'right' : 'left')
  return (
    <div
      ref={scroll}
      tabIndex={0}
      role="region"
      aria-label={props.name}
      className="scrollbar-sleek overflow-auto overscroll-x-contain focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-chat-accent"
      style={{ maxHeight: props.large ? '65dvh' : virtual || !props.wrap ? 400 : undefined }}
    >
      <table
        aria-rowcount={order.length + 1}
        className={cn(
          'w-full border-separate border-spacing-0 text-sm',
          fit ? 'table-auto' : 'table-fixed'
        )}
        style={fit ? undefined : { minWidth: widths.reduce((a, b) => a + b, 0) }}
      >
        {!fit && (
          <colgroup>
            {widths.map((width, index) => (
              <col key={index} style={{ width }} />
            ))}
          </colgroup>
        )}
        <thead ref={heading} className="sticky top-0 z-10 bg-secondary">
          <tr aria-rowindex={1}>
            {columns.map((column, index) => {
              const label = translate(
                'components.chat-conversation.table.sort',
                'Sort by {{column}}',
                {
                  column: column.text || index + 1
                }
              )
              const sorted = sort?.column === index
              return (
                <th
                  key={index}
                  scope="col"
                  aria-sort={sorted ? (sort.descending ? 'descending' : 'ascending') : 'none'}
                  className="h-10 border-b border-chat-line-2 px-3 py-2 font-medium"
                  style={{ textAlign: alignOf(column, index) }}
                >
                  <div
                    className="break-words [overflow-wrap:anywhere]"
                    style={fit ? { minWidth: minimums[index] } : undefined}
                  >
                    <span dir="auto">{column.content ?? column.text}</span>
                    <button
                      type="button"
                      aria-label={label}
                      title={label}
                      onClick={() => props.onSort(index)}
                      className="ms-1 inline-flex size-6 items-center justify-center rounded-md align-middle text-chat-ink-secondary hover:bg-chat-hover hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chat-accent"
                    >
                      {sorted && sort.descending ? (
                        <ArrowDown className="size-3" aria-hidden />
                      ) : (
                        <ArrowUp className={cn('size-3', !sorted && 'opacity-35')} aria-hidden />
                      )}
                    </button>
                  </div>
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {before > 0 && (
            <tr aria-hidden>
              <td colSpan={columns.length} style={{ height: before, padding: 0 }} />
            </tr>
          )}
          {items.map((item) => (
            <tr
              key={item.key}
              data-index={item.index}
              ref={virtual ? virtualizer.measureElement : undefined}
              aria-rowindex={item.index + 2}
              className={cn('hover:bg-chat-hover', item.index % 2 === 1 && 'bg-chat-code')}
            >
              {columns.map((column, index) => {
                const cell = rows[order[item.index]!]![index]
                return (
                  <td
                    key={index}
                    className="border-b border-chat-line-1 px-3 py-2.5 align-top tabular-nums"
                    style={{ textAlign: cell?.align ?? alignOf(column, index) }}
                  >
                    <div
                      dir="auto"
                      title={props.wrap ? undefined : cell?.text}
                      className={
                        props.wrap
                          ? 'whitespace-pre-wrap break-words [overflow-wrap:anywhere]'
                          : 'truncate'
                      }
                    >
                      {cell?.content ?? cell?.text}
                    </div>
                  </td>
                )
              })}
            </tr>
          ))}
          {after > 0 && (
            <tr aria-hidden>
              <td colSpan={columns.length} style={{ height: after, padding: 0 }} />
            </tr>
          )}
        </tbody>
      </table>
      {order.length === 0 && (
        <p className="p-8 text-center text-sm text-chat-ink-secondary">
          {rows.length
            ? translate('components.chat-conversation.table.noResults', 'No matching rows')
            : translate('components.chat-conversation.table.empty', 'This table is empty')}
        </p>
      )}
    </div>
  )
}
