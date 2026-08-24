// ActiveCollab's own bell, brought into the My Work band: what changed on the tasks you follow.
//
// Deliberately NOT loaded on mount. The band is on screen for the whole Tasks visit, so a bell that
// fetched on render would cost a request per visit for a panel most visits never open. First open
// reads, every reopen re-reads, and a latched refusal reads nothing at all.
//
// The badge count is the panel's own `totalUnread`, which the instance is allowed to answer as
// "not computed" (null). One source, so the badge and the panel header can never disagree — and
// null renders NOTHING rather than a zero, because unknown is not none.

import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Bell, LoaderCircle } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import type {
  ActiveCollabFailure,
  ActiveCollabTaskRef
} from '../../../shared/activecollab-api-types'
import type { ActiveCollabObjectUpdate } from '../../../shared/activecollab-types'
import { describeActiveCollabFailure } from './activecollab-failure-message'
import { ActiveCollabUpdateRow } from './activecollab-update-row'

type UpdatesState = {
  status: 'idle' | 'loading' | 'ready' | 'failed'
  updates: readonly ActiveCollabObjectUpdate[]
  /** Null means the instance did not compute a count — see the module note. */
  totalUnread: number | null
  hasMore: boolean
  /** True only while a later page is in flight, so the loaded rows stay on screen. */
  appending: boolean
  failure: ActiveCollabFailure | null
}

const IDLE: UpdatesState = {
  status: 'idle',
  updates: [],
  totalUnread: null,
  hasMore: false,
  appending: false,
  failure: null
}

const STATUS_MESSAGE_CLASS = 'px-3 py-6 text-center text-[12px] text-muted-foreground'

export function ActiveCollabUpdatesBell({
  onSelect
}: {
  onSelect: (ref: ActiveCollabTaskRef) => void
}): React.JSX.Element {
  // Optional-call, matching activecollab-task-detail-state: the store hydrates progressively and
  // several suites mount this band on a partial stand-in. No panel beats taking the band down.
  const listUpdates = useAppStore((s) => s.listActiveCollabUpdates)
  const updatesUnsupported = useAppStore((s) => s.activeCollabUpdatesUnsupported ?? false)
  const clearUpdatesUnsupported = useAppStore((s) => s.clearActiveCollabUpdatesUnsupported)
  // Same optional-call reason as above, and the same model the task rows draw their unread dot
  // from — so a row that looks unread here looks unread in the list too.
  const unreadByTask = useAppStore((s) => s.activeCollabUnread?.byTask)
  const [open, setOpen] = useState(false)
  const [state, setState] = useState<UpdatesState>(IDLE)
  // Bumped per read so a closed-then-reopened panel cannot be written by the previous open's answer.
  const requestRef = useRef(0)
  const pageRef = useRef(1)

  useEffect(() => {
    if (!open) {
      requestRef.current += 1
      setState(IDLE)
      return
    }
    // A remembered refusal must not turn every open into another 500.
    if (updatesUnsupported || !listUpdates) {
      requestRef.current += 1
      return
    }
    const request = (requestRef.current += 1)
    pageRef.current = 1
    setState({ ...IDLE, status: 'loading' })
    void listUpdates({ page: 1 }).then((result) => {
      if (request !== requestRef.current) {
        return
      }
      setState(
        result.ok
          ? {
              status: 'ready',
              updates: result.value.updates,
              totalUnread: result.value.totalUnread,
              hasMore: result.value.hasMore,
              appending: false,
              failure: null
            }
          : { ...IDLE, status: 'failed', failure: result }
      )
    })
  }, [listUpdates, open, updatesUnsupported])

  const loadMore = useCallback(() => {
    if (!listUpdates) {
      return
    }
    const request = requestRef.current
    const page = pageRef.current + 1
    setState((previous) => ({ ...previous, appending: true }))
    void listUpdates({ page }).then((result) => {
      if (request !== requestRef.current) {
        return
      }
      if (!result.ok) {
        setState((previous) => ({ ...previous, appending: false, failure: result }))
        return
      }
      pageRef.current = page
      setState((previous) => ({
        ...previous,
        updates: [...previous.updates, ...result.value.updates],
        hasMore: result.value.hasMore,
        appending: false,
        failure: null
      }))
    })
  }, [listUpdates])

  const pick = useCallback(
    (update: ActiveCollabObjectUpdate) => {
      onSelect({ projectId: update.projectId, taskId: update.taskId })
      setOpen(false)
    },
    [onSelect]
  )

  // Clearing the latch re-runs the effect above, which re-issues the read exactly once.
  const retry = useCallback(() => {
    clearUpdatesUnsupported?.()
  }, [clearUpdatesUnsupported])

  const unread = state.totalUnread
  const hasUnread = unread !== null && unread > 0
  const label = hasUnread
    ? translate(
        'auto.components.activecollab.updates.bell_unread',
        'My updates, {{value0}} unread',
        { value0: String(unread) }
      )
    : translate('auto.components.activecollab.updates.bell', 'My updates')
  const title = translate('auto.components.activecollab.updates.title', 'My Updates')

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            {/* `xs` rather than `icon-xs`: with nothing to report the svg padding rule collapses it
                to the same 24px square as its neighbours, and the count grows it inline instead of
                floating a chip over the icon. */}
            <Button type="button" variant="ghost" size="xs" aria-label={label}>
              <Bell aria-hidden="true" />
              {hasUnread ? (
                // Same pill the Tasks sidebar button uses, so the two counts read as one feature.
                <span
                  data-testid="activecollab-updates-badge"
                  aria-hidden="true"
                  className="rounded-full bg-primary/15 px-1 text-[10px] font-medium tabular-nums text-primary"
                >
                  {unread > 9 ? '9+' : unread}
                </span>
              ) : null}
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent side="top" sideOffset={4}>
          {label}
        </TooltipContent>
      </Tooltip>
      {/* Radix names the content `role="dialog"`, so it needs its own name: the visible title is a
          span, not a heading, and an unnamed dialog announces as nothing. */}
      <PopoverContent align="end" sideOffset={4} className="w-80 p-0" aria-label={title}>
        <div className="flex items-center justify-between gap-2 border-b border-border/50 px-3 py-2">
          <span className="text-[13px] font-semibold text-foreground">{title}</span>
          {/* Null is silent: reporting "no new updates" for a count the instance refused to compute
              would be a claim we cannot make. */}
          {unread === null ? null : (
            <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
              {unread === 0
                ? translate('auto.components.activecollab.updates.none_unread', 'No new updates')
                : unread}
            </span>
          )}
        </div>

        {updatesUnsupported ? (
          <div role="alert" className={STATUS_MESSAGE_CLASS}>
            <p>
              {translate(
                'auto.components.activecollab.updates.unsupported',
                "This ActiveCollab won't serve its notification stream, so recent updates aren't available here. Open a task to see its own comments and changes."
              )}
            </p>
            <Button variant="outline" size="sm" onClick={retry} className="mt-3">
              {translate('auto.components.activecollab.updates.retry', 'Try again')}
            </Button>
          </div>
        ) : state.status === 'loading' ? (
          <div className="flex items-center justify-center py-8">
            <LoaderCircle
              data-testid="activecollab-updates-loading"
              className="size-4 animate-spin text-muted-foreground"
            />
          </div>
        ) : state.failure ? (
          <p role="alert" className="px-3 py-6 text-center text-[12px] text-destructive">
            {describeActiveCollabFailure(state.failure)}
          </p>
        ) : state.status === 'ready' && state.updates.length === 0 ? (
          <p className={STATUS_MESSAGE_CLASS}>
            {translate('auto.components.activecollab.updates.empty', "You're all caught up.")}
          </p>
        ) : null}

        {state.updates.length > 0 ? (
          // Tall enough to scan a working day's worth without scrolling; Radix still clamps the
          // popover to the viewport, so this is a ceiling rather than a fixed height.
          <ul className="max-h-[32rem] overflow-y-auto scrollbar-sleek">
            {state.updates.map((update) => (
              <ActiveCollabUpdateRow
                key={`${update.projectId}-${update.taskId}`}
                update={update}
                unread={Boolean(unreadByTask?.[String(update.taskId)])}
                onPick={pick}
              />
            ))}
          </ul>
        ) : null}

        {state.hasMore ? (
          <div className="border-t border-border/50">
            <Button
              variant="ghost"
              size="sm"
              disabled={state.appending}
              onClick={loadMore}
              className="w-full justify-center rounded-none text-[12px] font-normal"
            >
              {state.appending ? (
                <LoaderCircle className="size-3.5 animate-spin" />
              ) : (
                translate('auto.components.activecollab.updates.view_all', 'View all my updates')
              )}
            </Button>
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  )
}
