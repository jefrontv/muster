// Ported from the muster-bots fork (src/components/RichTable.tsx, MarkdownTable.tsx), Apache-2.0.
// A reply's markdown table as a card: search, sort, wrap, copy as CSV, download and expand.

import { Children, isValidElement, useDeferredValue, useEffect, useMemo, useState } from 'react'
import type React from 'react'
import { Check, Copy, Download, Maximize2, Search, WrapText } from 'lucide-react'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import { nextTableSort, tableCsv, tableRowOrder, type ChatTableSort } from './chat-table-data'
import { ChatTableViewport, type ChatTableAlign, type ChatTableCell } from './ChatTableViewport'

/** Tables this short skip the search bar and keep their actions in a slim footer. */
const SMALL_TABLE_ROWS = 8

const ACTION_CLASS =
  'inline-flex size-[30px] shrink-0 items-center justify-center rounded-md text-chat-ink-secondary transition-colors duration-100 ease-chat hover:bg-secondary hover:text-foreground aria-pressed:bg-secondary aria-pressed:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chat-accent'

type ElementWithChildren = React.ReactElement<{
  children?: React.ReactNode
  style?: React.CSSProperties
  alt?: string
}>

const elementsOf = (children: React.ReactNode): ElementWithChildren[] =>
  Children.toArray(children).filter(isValidElement) as ElementWithChildren[]

function plainText(node: React.ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') {
    return String(node)
  }
  if (Array.isArray(node)) {
    return node.map(plainText).join('')
  }
  if (!isValidElement(node)) {
    return ''
  }
  const element = node as ElementWithChildren
  if (element.type === 'br') {
    return '\n'
  }
  return plainText(element.props.children) || element.props.alt || ''
}

function alignOf(element: ElementWithChildren): ChatTableAlign | undefined {
  const align = element.props.style?.textAlign
  return align === 'left' || align === 'center' || align === 'right' ? align : undefined
}

/** Reads cells from react-markdown's already sanitised children; never renders raw HTML. */
function tableFromMarkdown(children: React.ReactNode): {
  columns: ChatTableCell[]
  rows: ChatTableCell[][]
} {
  const sections = elementsOf(children)
  const head = sections.find((section) => section.type === 'thead')
  const body = sections.find((section) => section.type === 'tbody')
  const cell = (element: ElementWithChildren): ChatTableCell => ({
    text: plainText(element.props.children),
    content: element.props.children,
    align: alignOf(element)
  })
  const headerRow = elementsOf(head?.props.children)[0]
  return {
    columns: elementsOf(headerRow?.props.children).map(cell),
    rows: elementsOf(body?.props.children).map((row) => elementsOf(row.props.children).map(cell))
  }
}

function downloadCsv(name: string, csv: string): void {
  const url = URL.createObjectURL(new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = `${name.replace(/[\\/:*?"<>|]/g, '_').slice(0, 150) || 'table'}.csv`
  link.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function ChatRichTable({ children }: { children?: React.ReactNode }): React.JSX.Element {
  const { columns, rows } = useMemo(() => tableFromMarkdown(children), [children])
  const name = translate('components.chat-conversation.table.title', 'Table')
  const [query, setQuery] = useState('')
  const deferredQuery = useDeferredValue(query)
  const [sort, setSort] = useState<ChatTableSort>(null)
  const [wrap, setWrap] = useState(true)
  const [expanded, setExpanded] = useState(false)
  const [copied, setCopied] = useState<'idle' | 'copied' | 'failed'>('idle')
  const values = useMemo(() => rows.map((row) => row.map((cell) => cell.text)), [rows])
  const order = useMemo(
    () => tableRowOrder(values, deferredQuery, sort),
    [values, deferredQuery, sort]
  )
  useEffect(() => {
    if (copied === 'idle') {
      return
    }
    const timer = window.setTimeout(() => setCopied('idle'), 2500)
    return () => window.clearTimeout(timer)
  }, [copied])
  const csv = (): string =>
    tableCsv(
      columns.map((column) => column.text),
      order.map((index) => values[index]!)
    )
  const copy = (): void => {
    window.api.ui
      .writeClipboardText(csv())
      .then(() => setCopied('copied'))
      .catch(() => setCopied('failed'))
  }
  const count = translate(
    'components.chat-conversation.table.count',
    '{{shown}} of {{total}} rows, {{columns}} columns',
    {
      shown: order.length.toLocaleString(),
      total: rows.length.toLocaleString(),
      columns: columns.length
    }
  )

  const surface = (large: boolean): React.JSX.Element => {
    const small = !large && rows.length <= SMALL_TABLE_ROWS
    const actions = (
      <>
        {!small && (
          <button
            type="button"
            className={ACTION_CLASS}
            aria-label={translate('components.chat-conversation.table.wrap', 'Wrap text')}
            title={translate('components.chat-conversation.table.wrap', 'Wrap text')}
            aria-pressed={wrap}
            onClick={() => setWrap(!wrap)}
          >
            <WrapText className="size-3.5" aria-hidden />
          </button>
        )}
        <button
          type="button"
          className={ACTION_CLASS}
          aria-label={translate('components.chat-conversation.table.copy', 'Copy as CSV')}
          title={translate('components.chat-conversation.table.copy', 'Copy as CSV')}
          onClick={copy}
        >
          {copied === 'copied' ? (
            <Check className="size-3.5" aria-hidden />
          ) : (
            <Copy className="size-3.5" aria-hidden />
          )}
        </button>
        <button
          type="button"
          className={ACTION_CLASS}
          aria-label={translate('components.chat-conversation.table.download', 'Download CSV')}
          title={translate('components.chat-conversation.table.download', 'Download CSV')}
          onClick={() => downloadCsv(name, csv())}
        >
          <Download className="size-3.5" aria-hidden />
        </button>
        {!large && (
          <button
            type="button"
            className={ACTION_CLASS}
            aria-label={translate('components.chat-conversation.table.expand', 'Expand table')}
            title={translate('components.chat-conversation.table.expand', 'Expand table')}
            onClick={() => setExpanded(true)}
          >
            <Maximize2 className="size-3.5" aria-hidden />
          </button>
        )}
      </>
    )
    const copyStatus =
      copied === 'idle' ? null : (
        <span role={copied === 'failed' ? 'alert' : 'status'}>
          {copied === 'failed'
            ? translate('components.chat-conversation.table.copyFailed', 'Copy failed')
            : translate('components.chat-conversation.table.copied', 'Copied')}
        </span>
      )
    return (
      <div
        className={cn(
          'w-fit max-w-full min-w-[min(100%,var(--chat-prose-max))] overflow-hidden rounded-chat-bubble bg-sidebar text-foreground shadow-chat-hairline',
          large && 'w-full'
        )}
      >
        {!small && (
          <div className="flex flex-wrap items-center gap-1 border-b border-chat-line-2 px-2 py-1.5">
            <label className="flex min-w-24 flex-1 items-center gap-2 px-1 text-chat-ink-secondary">
              <Search className="size-3.5" aria-hidden />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                aria-label={translate('components.chat-conversation.table.search', 'Search table')}
                placeholder={translate('components.chat-conversation.table.search', 'Search table')}
                className="w-full min-w-0 bg-transparent py-1 text-xs text-foreground outline-none placeholder:text-chat-ink-caption"
              />
            </label>
            {actions}
          </div>
        )}
        <ChatTableViewport
          columns={columns}
          rows={rows}
          order={order}
          name={name}
          wrap={wrap}
          large={large}
          sort={sort}
          onSort={(column) => setSort(nextTableSort(sort, column))}
        />
        <footer
          className={cn(
            'flex items-center gap-2 text-[11px]',
            small
              ? 'justify-end gap-0.5 border-t border-chat-line-1 px-1.5 py-1 text-chat-ink-tertiary'
              : 'flex-wrap justify-between border-t border-chat-line-2 px-3 py-2 text-chat-ink-secondary'
          )}
        >
          {!small && <span role="status">{count}</span>}
          {copyStatus && <span className={cn(small && 'me-auto ps-1.5')}>{copyStatus}</span>}
          {small && actions}
        </footer>
      </div>
    )
  }

  return (
    <div data-chat-table="" className="my-4 first:mt-0 last:mb-0">
      {expanded ? null : surface(false)}
      <Dialog open={expanded} onOpenChange={setExpanded}>
        <DialogContent className="flex max-h-[94dvh] w-[min(96vw,1400px)] max-w-none flex-col gap-3 sm:max-w-none">
          <DialogTitle className="text-sm font-medium">{name}</DialogTitle>
          <div className="scrollbar-sleek min-h-0 overflow-auto">{expanded && surface(true)}</div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
