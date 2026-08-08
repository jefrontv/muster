import { useEffect, useState } from 'react'
import { ChevronRight, CircleCheck, MessageSquareText, Wrench } from 'lucide-react'
import {
  activeCollabToolEvent,
  type ActiveCollabToolEvent
} from '../../../../shared/native-chat-activecollab-events'
import { ActiveCollabIcon } from '@/components/icons/ActiveCollabIcon'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import {
  isToolCallBlock,
  isToolResultBlock,
  type NativeChatBlock
} from '../../../../shared/native-chat-types'
import { diffFromText, diffFromToolCall, type DiffLine } from './native-chat-diff'
import { useNativeChatToggleScrollCompensation } from './use-native-chat-toggle-scroll-compensation'
import {
  countToolCalls,
  formatToolInput,
  humanizeToolName,
  summarizeToolInput,
  toolRunNameCounts
} from './native-chat-tool-summary'
import { NativeChatDiffView } from './NativeChatDiffView'

const MAX_TOOL_RESULT_CHARS = 4000

/** A single inline tool line — `▸ ToolName  preview` — that expands in place to
 *  show the call's diff/input or the result's body. Tool calls read as flat
 *  lines in the conversation rather than boxed blocks (mobile parity). Lines only
 *  mount while the parent run is open, so each starts expanded (opening the run
 *  reveals every line at once) and is then individually collapsible. */
function ToolLine({ block }: { block: NativeChatBlock }): React.JSX.Element | null {
  // Why: tool results (MCP JSON payloads especially) are working material, not
  // conversation — keep them behind the preview until asked for.
  const [expanded, setExpanded] = useState(() => !isToolResultBlock(block))
  const { elementRef, captureBeforeToggle } = useNativeChatToggleScrollCompensation(expanded)

  let name: string
  let preview: string
  let diff: DiffLine[] | null = null
  let body: { output: string; isError?: boolean } | null = null
  // Full, formatted input shown when a diff-less tool call is expanded.
  let detail: string | null = null

  if (isToolCallBlock(block)) {
    name = humanizeToolName(block.name)
    preview = summarizeToolInput(block.input)
    diff = diffFromToolCall(block.name, block.input)
    detail = diff ? null : formatToolInput(block.input)
  } else if (isToolResultBlock(block)) {
    name = translate('components.native-chat.tool.result', 'Result')
    preview = block.output.split('\n')[0]?.slice(0, 80) ?? ''
    diff = diffFromText(block.output)
    body = { output: block.output, isError: block.isError }
  } else {
    return null
  }

  // Only offer expansion when there's more than the inline preview already shows —
  // avoids re-rendering the same truncated string in a box below it.
  const detailAddsInfo = detail !== null && detail.replace(/\s+/g, ' ').trim() !== preview
  const hasDetail = diff !== null || body !== null || detailAddsInfo

  return (
    <div ref={elementRef}>
      <button
        type="button"
        onClick={() => {
          if (!hasDetail) {
            return
          }
          captureBeforeToggle()
          setExpanded((v) => !v)
        }}
        className={cn(
          'group flex w-full items-center gap-1.5 py-0.5 text-left',
          hasDetail ? 'cursor-pointer' : 'cursor-default'
        )}
      >
        <code className="shrink-0 font-mono text-xs font-semibold text-foreground/90 transition-colors group-hover:text-foreground">
          {name}
        </code>
        {preview ? (
          <span
            className="min-w-0 truncate font-mono text-[11px] text-muted-foreground transition-colors group-hover:text-foreground/70"
            title={preview}
          >
            {preview}
          </span>
        ) : null}
        {hasDetail ? (
          // Chevron sits on the right; hidden until hover when collapsed, always
          // shown (pointing down) when expanded — mirrors Codex's disclosure affordance.
          <ChevronRight
            className={cn(
              'size-3.5 shrink-0 text-muted-foreground transition-all',
              expanded ? 'rotate-90 opacity-100' : 'opacity-0 group-hover:opacity-100'
            )}
          />
        ) : null}
      </button>
      {hasDetail && expanded ? (
        <div className="space-y-1.5 py-1">
          {diff ? <NativeChatDiffView lines={diff} /> : null}
          {!diff && body ? (
            <pre
              className={cn(
                'max-h-64 overflow-auto whitespace-pre-wrap break-words rounded bg-accent p-2 font-mono text-[11px] scrollbar-sleek',
                body.isError ? 'text-destructive' : 'text-foreground/80'
              )}
            >
              {body.output.length > MAX_TOOL_RESULT_CHARS
                ? `${body.output.slice(0, MAX_TOOL_RESULT_CHARS)}…`
                : body.output}
            </pre>
          ) : null}
          {!diff && !body && detail ? (
            <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded bg-accent p-2 font-mono text-[11px] text-foreground/80 scrollbar-sleek">
              {detail.length > MAX_TOOL_RESULT_CHARS
                ? `${detail.slice(0, MAX_TOOL_RESULT_CHARS)}…`
                : detail}
            </pre>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

/** An ActiveCollab write rendered as a task event instead of a wrench row —
 *  "Completed task #77" reads as an outcome, not plumbing. */
function ActiveCollabEventChip({ event }: { event: ActiveCollabToolEvent }): React.JSX.Element {
  const done = event.kind === 'complete'
  return (
    <span
      className={cn(
        'flex max-w-full items-center gap-1.5 rounded-full border py-1 pl-2.5 pr-3 text-xs font-medium',
        done
          ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
          : 'border-border/60 bg-muted/40 text-muted-foreground'
      )}
    >
      {done ? (
        <CircleCheck className="size-3.5 shrink-0" />
      ) : event.kind === 'comment' ? (
        <MessageSquareText className="size-3.5 shrink-0" />
      ) : (
        <ActiveCollabIcon className="size-3 shrink-0" />
      )}
      <span className="min-w-0 truncate">{event.label}</span>
    </span>
  )
}

/** A run of a message's tool calls/results, collapsed to a one-line summary that
 *  expands to the individual inline tool lines. `expandSignal` lets the global
 *  toolbar toggle drive every run at once while still allowing per-run override. */
export function NativeChatToolRun({
  blocks,
  expandSignal
}: {
  blocks: NativeChatBlock[]
  /** Toolbar-driven desired open state. Each change re-syncs this run's state. */
  expandSignal: boolean
}): React.JSX.Element {
  const [open, setOpen] = useState(expandSignal)
  // Re-sync when the global toolbar toggle flips.
  useEffect(() => setOpen(expandSignal), [expandSignal])
  const { elementRef, captureBeforeToggle } = useNativeChatToggleScrollCompensation(open)

  // AC writes surface as task-event chips; the wrench pill covers the rest.
  const events = blocks
    .filter(isToolCallBlock)
    .map((block) => activeCollabToolEvent(block.name, block.input))
    .filter((event): event is ActiveCollabToolEvent => event !== null)
  const plainBlocks = blocks.filter(
    (block) => !isToolCallBlock(block) || activeCollabToolEvent(block.name, block.input) === null
  )
  // Result-only runs keep the pill (their body is only reachable through it);
  // a run that is purely AC events needs no wrench at all.
  const callCount = countToolCalls(plainBlocks) || (events.length > 0 ? 0 : plainBlocks.length)
  const nameCounts = toolRunNameCounts(plainBlocks)
  const countLabel = translate(
    callCount === 1 ? 'components.native-chat.tool.countOne' : 'components.native-chat.tool.countN',
    callCount === 1 ? '1 tool call' : `${callCount} tool calls`,
    { count: callCount }
  )

  return (
    // Extra top margin sets the tool run apart from the assistant prose above it
    // so the turn's activity doesn't crowd the message text.
    <div ref={elementRef} className="mt-3 space-y-1.5">
      {events.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5">
          {events.map((event, index) => (
            <ActiveCollabEventChip key={index} event={event} />
          ))}
        </div>
      ) : null}
      {callCount > 0 ? (
        <button
          type="button"
          onClick={() => {
            captureBeforeToggle()
            setOpen((v) => !v)
          }}
          className={cn(
            'group flex max-w-full items-center gap-1.5 rounded-full border border-border/60 py-1 pl-2.5 pr-2 text-left transition-colors',
            open ? 'bg-muted/70' : 'bg-muted/40 hover:bg-muted/70'
          )}
        >
          <Wrench className="size-3 shrink-0 text-muted-foreground" />
          <span className="shrink-0 text-xs font-medium text-muted-foreground transition-colors group-hover:text-foreground/80">
            {countLabel}
          </span>
          {nameCounts.length > 0 ? (
            <span className="min-w-0 truncate text-xs text-muted-foreground/70 transition-colors group-hover:text-muted-foreground">
              {nameCounts
                .map((entry) => (entry.count > 1 ? `${entry.name} ×${entry.count}` : entry.name))
                .join(' · ')}
            </span>
          ) : null}
          <ChevronRight
            className={cn(
              'size-3.5 shrink-0 text-muted-foreground transition-transform',
              open && 'rotate-90'
            )}
          />
        </button>
      ) : null}
      {open ? (
        <div className="ml-2 mt-1.5 border-l border-border/60 pl-3">
          {blocks.map((block, i) => (
            <ToolLine key={i} block={block} />
          ))}
        </div>
      ) : null}
    </div>
  )
}
