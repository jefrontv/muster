// The Watchers row: who gets notified about this task. `detail.subscriberIds` carries ids only, so
// names come from the same people read the assignee picker uses — project members first, instance
// roster as the fallback — which the store slice caches per project, so opening this popover after
// the picker costs no second request.
//
// The signed-in user's own watch state leads the list. Everyone else is a toggle; "am I watching
// this" is the question people actually open this control to answer, and hunting your own name in a
// roster to answer it is the wrong shape.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Check, Eye, EyeOff, LoaderCircle } from 'lucide-react'

import { describeActiveCollabFailure } from '@/components/activecollab-failure-message'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useMountedRef } from '@/hooks/useMountedRef'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/store'
import type { ActiveCollabFailure } from '../../../shared/activecollab-api-types'
import type { ActiveCollabUser } from '../../../shared/activecollab-types'
import { ActiveCollabPersonBadge } from './activecollab-task-person-badge'

type ActiveCollabTaskWatchersProps = {
  projectId: number
  subscriberIds: number[]
  disabled: boolean
  busy: boolean
  onSubscribedChange: (userId: number, subscribed: boolean) => void
}

/** Faces shown before the rest collapse into a count; more than this crowds the row. */
const VISIBLE_AVATARS = 4

const ROW_CLASS =
  'flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-[12px] transition-colors hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-50'

export function ActiveCollabTaskWatchers({
  projectId,
  subscriberIds,
  disabled,
  busy,
  onSubscribedChange
}: ActiveCollabTaskWatchersProps): React.JSX.Element {
  const listUsers = useAppStore((s) => s.listActiveCollabUsers)
  const listProjectMembers = useAppStore((s) => s.listActiveCollabProjectMembers)
  const viewerId = useAppStore((s) => s.activeCollabStatus.connection?.userId ?? null)
  const mountedRef = useMountedRef()
  const [open, setOpen] = useState(false)
  const [users, setUsers] = useState<readonly ActiveCollabUser[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [failure, setFailure] = useState<ActiveCollabFailure | null>(null)
  // Gates the read to once per successful list, so reopening the popover costs nothing.
  const requestedRef = useRef(false)

  // Membership is per project and this component instance outlives one task, so a switch to
  // another project must drop the old project's people before the next open.
  useEffect(() => {
    requestedRef.current = false
    setUsers(null)
    setFailure(null)
  }, [projectId])

  const loadPeople = useCallback((): void => {
    if (requestedRef.current) {
      return
    }
    requestedRef.current = true
    setLoading(true)
    setFailure(null)
    void (async (): Promise<void> => {
      // Same fallback contract as the assignee picker: a members read that fails or answers nobody
      // widens to the instance roster rather than presenting a list the user cannot act on.
      const members = await listProjectMembers(projectId)
      if (members.ok && members.value.length > 0) {
        if (mountedRef.current) {
          setLoading(false)
          setUsers(members.value)
        }
        return
      }
      const roster = await listUsers()
      if (!mountedRef.current) {
        return
      }
      setLoading(false)
      if (roster.ok) {
        setUsers(roster.value)
        return
      }
      // Let the next open retry: a list that failed once is not a list that is empty.
      requestedRef.current = false
      setFailure(roster)
    })()
  }, [listProjectMembers, listUsers, projectId, mountedRef])

  const handleOpenChange = useCallback(
    (nextOpen: boolean): void => {
      setOpen(nextOpen)
      if (nextOpen) {
        loadPeople()
      }
    },
    [loadPeople]
  )

  // Watchers keep `subscriberIds` order, and an id the roster cannot name is still a watcher — it
  // has to stay countable and removable.
  const watchers = useMemo(() => {
    const byId = new Map((users ?? []).map((user) => [user.id, user] as const))
    return subscriberIds.map((id) => ({ id, name: byId.get(id)?.name ?? null }))
  }, [subscriberIds, users])
  // Membership is asked once per roster row, and the roster runs to 176 on this instance.
  const subscribed = useMemo(() => new Set(subscriberIds), [subscriberIds])

  const viewerWatching = viewerId !== null && subscribed.has(viewerId)
  const viewerLabel = viewerWatching
    ? translate('auto.components.activecollab.task_workspace.unwatch', 'Stop watching')
    : translate('auto.components.activecollab.task_workspace.watch', 'Watch this task')

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-expanded={open}
          aria-label={translate('auto.components.activecollab.task_workspace.watchers', 'Watchers')}
          disabled={disabled}
          className="-ml-1.5 flex min-w-0 items-center gap-1.5 rounded-md border border-transparent px-1.5 py-0.5 text-[12px] transition hover:border-border/70 hover:bg-muted/40 focus-visible:border-ring focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50"
        >
          {watchers.length === 0 ? (
            <span data-testid="activecollab-task-watchers" className="text-muted-foreground">
              {translate('auto.components.activecollab.task_workspace.no_watchers', 'Nobody')}
            </span>
          ) : (
            <span data-testid="activecollab-task-watchers" className="flex items-center">
              {watchers.slice(0, VISIBLE_AVATARS).map((watcher) => (
                // Overlapped by a hair so a group of faces reads as one stack, not four chips.
                <ActiveCollabPersonBadge
                  key={watcher.id}
                  name={watcher.name}
                  userId={watcher.id}
                  className="-ml-1 border border-background first:ml-0"
                />
              ))}
              {watchers.length > VISIBLE_AVATARS ? (
                <span className="ml-1.5 tabular-nums text-muted-foreground">
                  +{watchers.length - VISIBLE_AVATARS}
                </span>
              ) : null}
            </span>
          )}
          {busy ? (
            <LoaderCircle className="size-3 shrink-0 animate-spin text-muted-foreground" />
          ) : null}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="popover-scroll-content scrollbar-sleek w-72 p-2">
        {viewerId === null ? null : (
          <div className="mb-1 border-b border-border/60 pb-1">
            <button
              type="button"
              disabled={disabled}
              aria-pressed={viewerWatching}
              onClick={() => onSubscribedChange(viewerId, !viewerWatching)}
              className={cn(ROW_CLASS, 'font-medium')}
            >
              {viewerWatching ? (
                <EyeOff className="size-3.5 shrink-0" />
              ) : (
                <Eye className="size-3.5 shrink-0" />
              )}
              {viewerLabel}
            </button>
          </div>
        )}
        {failure ? (
          <p role="alert" className="px-1 py-2 text-[12px] text-destructive">
            {describeActiveCollabFailure(failure)}
          </p>
        ) : loading ? (
          <div className="flex items-center justify-center py-6">
            <LoaderCircle className="size-4 animate-spin text-muted-foreground" />
          </div>
        ) : (users?.length ?? 0) === 0 ? (
          <p className="px-1 py-2 text-[12px] text-muted-foreground">
            {translate('auto.components.activecollab.task_workspace.no_people', 'No people match.')}
          </p>
        ) : (
          <div className="grid gap-0.5">
            {(users ?? []).map((user) => {
              const watching = subscribed.has(user.id)
              return (
                <button
                  key={user.id}
                  type="button"
                  disabled={disabled}
                  aria-pressed={watching}
                  onClick={() => onSubscribedChange(user.id, !watching)}
                  className={cn(ROW_CLASS, watching && 'text-foreground')}
                >
                  <ActiveCollabPersonBadge name={user.name} userId={user.id} />
                  <span className="min-w-0 flex-1 truncate">{user.name}</span>
                  {watching ? <Check className="size-3.5 shrink-0" /> : null}
                </button>
              )
            })}
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}
