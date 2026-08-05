// The Assignee row's control: reads as the current value, opens a searchable people list when
// acted on. The list is the task's PROJECT members, not the 176-row instance roster — only they
// can be assigned — widening to the roster only when the members read fails or answers nobody.
//
// Shaped after the due-date field rather than after a form widget — a loud outline button beside a
// bare date would read as the louder of two peers, when both are just values you can change.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ChevronsUpDown, LoaderCircle } from 'lucide-react'

import { describeActiveCollabFailure } from '@/components/activecollab-failure-message'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useMountedRef } from '@/hooks/useMountedRef'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/store'
import type { ActiveCollabFailure } from '../../../shared/activecollab-api-types'
import type { ActiveCollabTask, ActiveCollabUser } from '../../../shared/activecollab-types'
import { ActiveCollabAssigneePickerList } from './activecollab-task-assignee-picker'
import { activeCollabAssigneeLabel, resolveActiveCollabAssignee } from './activecollab-task-people'
import { ActiveCollabPersonBadge } from './activecollab-task-person-badge'

type ActiveCollabTaskAssigneeFieldProps = {
  task: Pick<ActiveCollabTask, 'assigneeId' | 'assigneeName' | 'projectId'>
  disabled: boolean
  busy: boolean
  /** An explicit null UNASSIGNS; omitting the key would leave the server's assignee alone. */
  onChange: (assigneeId: number | null) => void
}

export function ActiveCollabTaskAssigneeField({
  task,
  disabled,
  busy,
  onChange
}: ActiveCollabTaskAssigneeFieldProps): React.JSX.Element {
  const listUsers = useAppStore((s) => s.listActiveCollabUsers)
  const listProjectMembers = useAppStore((s) => s.listActiveCollabProjectMembers)
  const mountedRef = useMountedRef()
  const [open, setOpen] = useState(false)
  const [users, setUsers] = useState<readonly ActiveCollabUser[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [failure, setFailure] = useState<ActiveCollabFailure | null>(null)
  // Gates the fetch to once per successful list, so reopening the picker costs nothing.
  const requestedRef = useRef(false)

  // Membership is per project, and the workspace reuses this component instance across tasks: a
  // switch to another project must drop the old project's people before the next open.
  useEffect(() => {
    requestedRef.current = false
    setUsers(null)
    setFailure(null)
  }, [task.projectId])

  const loadPeople = useCallback((): void => {
    if (requestedRef.current) {
      return
    }
    requestedRef.current = true
    setLoading(true)
    setFailure(null)
    void (async (): Promise<void> => {
      // Project members first — same fallback contract as the @mention menu
      // (`activeCollabMentionPeople`): a members read that fails or answers nobody widens to the
      // instance roster rather than presenting an empty menu the user can neither read nor fix.
      const members = await listProjectMembers(task.projectId)
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
  }, [listProjectMembers, listUsers, task.projectId, mountedRef])

  const handleOpenChange = useCallback(
    (nextOpen: boolean): void => {
      setOpen(nextOpen)
      if (nextOpen) {
        loadPeople()
      }
    },
    [loadPeople]
  )

  const select = useCallback(
    (assigneeId: number | null): void => {
      setOpen(false)
      onChange(assigneeId)
    },
    [onChange]
  )

  // The list is the second chance at a name: ActiveCollab 8 ships no `assignee_name` on task rows,
  // so an id that read as unresolved before the picker was opened usually resolves after.
  const assignee = resolveActiveCollabAssignee(task, users ?? [])

  // The current assignee must stay offerable even after leaving the project: without this row the
  // scoped menu could neither display the selection nor let the user re-pick it after filtering.
  const offeredUsers = useMemo(() => {
    if (users === null || task.assigneeId === null) {
      return users
    }
    if (users.some((user) => user.id === task.assigneeId)) {
      return users
    }
    const name = task.assigneeName?.trim()
    return [
      ...users,
      {
        id: task.assigneeId,
        name: name || activeCollabAssigneeLabel({ kind: 'unresolved' }),
        avatarUrl: null
      }
    ]
  }, [users, task.assigneeId, task.assigneeName])

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          role="combobox"
          aria-expanded={open}
          aria-label={translate('auto.components.activecollab.task_workspace.assignee', 'Assignee')}
          disabled={disabled}
          className="-ml-1.5 flex min-w-0 items-center gap-2 rounded-md border border-transparent px-1.5 py-0.5 text-[12px] transition hover:border-border/70 hover:bg-muted/40 focus-visible:border-ring focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50"
        >
          <ActiveCollabPersonBadge
            name={assignee.kind === 'named' ? assignee.name : null}
            userId={task.assigneeId}
          />
          <span
            data-testid="activecollab-task-assignee"
            className={cn(
              'min-w-0 truncate',
              assignee.kind === 'named' ? 'text-foreground' : 'text-muted-foreground'
            )}
          >
            {activeCollabAssigneeLabel(assignee)}
          </span>
          {busy ? (
            <LoaderCircle className="size-3 shrink-0 animate-spin text-muted-foreground" />
          ) : (
            <ChevronsUpDown className="size-3 shrink-0 opacity-40" />
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-0">
        <ActiveCollabAssigneePickerList
          users={offeredUsers}
          loading={loading}
          errorMessage={failure ? describeActiveCollabFailure(failure) : null}
          selectedUserId={task.assigneeId}
          disabled={disabled}
          onSelect={select}
        />
      </PopoverContent>
    </Popover>
  )
}
