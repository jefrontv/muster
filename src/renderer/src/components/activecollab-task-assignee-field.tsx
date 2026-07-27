// The Assignee row's control: reads as the current value, opens a searchable roster when acted on.
//
// Shaped after the due-date field rather than after a form widget — a loud outline button beside a
// bare date would read as the louder of two peers, when both are just values you can change.

import React, { useCallback, useRef, useState } from 'react'
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
  task: Pick<ActiveCollabTask, 'assigneeId' | 'assigneeName'>
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
  const mountedRef = useMountedRef()
  const [open, setOpen] = useState(false)
  const [users, setUsers] = useState<readonly ActiveCollabUser[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [failure, setFailure] = useState<ActiveCollabFailure | null>(null)
  // Gates the fetch to once per successful roster, so reopening the picker costs nothing.
  const requestedRef = useRef(false)

  const loadRoster = useCallback((): void => {
    if (requestedRef.current) {
      return
    }
    requestedRef.current = true
    setLoading(true)
    setFailure(null)
    void listUsers().then((result) => {
      if (!mountedRef.current) {
        return
      }
      setLoading(false)
      if (result.ok) {
        setUsers(result.value)
        return
      }
      // Let the next open retry: a roster that failed once is not a roster that is empty.
      requestedRef.current = false
      setFailure(result)
    })
  }, [listUsers, mountedRef])

  const handleOpenChange = useCallback(
    (nextOpen: boolean): void => {
      setOpen(nextOpen)
      if (nextOpen) {
        loadRoster()
      }
    },
    [loadRoster]
  )

  const select = useCallback(
    (assigneeId: number | null): void => {
      setOpen(false)
      onChange(assigneeId)
    },
    [onChange]
  )

  // The roster is the second chance at a name: ActiveCollab 8 ships no `assignee_name` on task rows,
  // so an id that read as unresolved before the picker was opened usually resolves after.
  const assignee = resolveActiveCollabAssignee(task, users ?? [])

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
          <ActiveCollabPersonBadge name={assignee.kind === 'named' ? assignee.name : null} />
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
          users={users}
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
