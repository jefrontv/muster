// "Post & reassign to someone else": the project's members, with a filter box at the top.
import type React from 'react'
import { useEffect, useState } from 'react'
import {
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger
} from '@/components/ui/dropdown-menu'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import type { ActiveCollabUser } from '../../../../shared/activecollab-types'
import type { HandBackTo } from './bots-comment-draft-post-action'

type Members =
  | { state: 'loading' }
  | { state: 'failed' }
  | { state: 'ready'; users: ActiveCollabUser[] }

export function filterMembers(
  users: readonly ActiveCollabUser[],
  query: string,
  selfId: number | null
): ActiveCollabUser[] {
  const needle = query.trim().toLowerCase()
  return users
    .filter((user) => user.id !== selfId && (!needle || user.name.toLowerCase().includes(needle)))
    .toSorted((a, b) => a.name.localeCompare(b.name))
}

export function BotsReassignMemberMenu({
  projectId,
  selfId,
  onPick
}: {
  projectId: number
  selfId: number | null
  onPick: (person: HandBackTo) => void
}): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [members, setMembers] = useState<Members>({ state: 'loading' })

  useEffect(() => {
    if (!open) {
      return
    }
    let live = true
    void useAppStore
      .getState()
      .listActiveCollabProjectMembers(projectId)
      .then((result) => {
        if (live) {
          setMembers(result.ok ? { state: 'ready', users: result.value } : { state: 'failed' })
        }
      })
    return () => {
      live = false
    }
  }, [open, projectId])

  const shown = members.state === 'ready' ? filterMembers(members.users, query, selfId) : []

  return (
    <DropdownMenuSub open={open} onOpenChange={setOpen}>
      <DropdownMenuSubTrigger>
        {translate(
          'auto.components.bots.commentDrafts.reassignSomeoneElse',
          'Post & reassign to someone else'
        )}
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="w-64 p-1">
        <input
          autoFocus
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          // Menu typeahead would otherwise eat the letters; arrows and Escape still drive the menu.
          onKeyDown={(event) => {
            if (!['ArrowDown', 'ArrowUp', 'Escape', 'Tab'].includes(event.key)) {
              event.stopPropagation()
            }
          }}
          placeholder={translate(
            'auto.components.bots.commentDrafts.reassignFilter',
            'Find a person'
          )}
          aria-label={translate(
            'auto.components.bots.commentDrafts.reassignFilter',
            'Find a person'
          )}
          className="mb-1 h-8 w-full rounded-md bg-foreground/[0.05] px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <div className="max-h-64 overflow-y-auto">
          {members.state === 'loading' ? (
            <DropdownMenuItem disabled>
              {translate('auto.components.bots.commentDrafts.reassignLoading', 'Loading people…')}
            </DropdownMenuItem>
          ) : members.state === 'failed' ? (
            <DropdownMenuItem disabled>
              {translate(
                'auto.components.bots.commentDrafts.reassignFailedLoad',
                "Couldn't load the project's people"
              )}
            </DropdownMenuItem>
          ) : shown.length === 0 ? (
            <DropdownMenuItem disabled>
              {translate('auto.components.bots.commentDrafts.reassignNoMatch', 'No one matches')}
            </DropdownMenuItem>
          ) : (
            shown.map((user) => (
              <DropdownMenuItem
                key={user.id}
                onSelect={() => onPick({ userId: user.id, name: user.name })}
              >
                {user.name}
              </DropdownMenuItem>
            ))
          )}
        </div>
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  )
}
