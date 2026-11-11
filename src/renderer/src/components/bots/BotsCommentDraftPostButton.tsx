// Post, with a menu of people to hand the task to: quick picks first, then anyone on the project.
import { ChevronDown, LoaderCircle } from 'lucide-react'
import type React from 'react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { ButtonGroup } from '@/components/ui/button-group'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import type { BotsHandBackPerson } from '../../../../shared/bots-comment-draft-types'
import type { HandBackTo } from './bots-comment-draft-post-action'
import {
  reassignCandidates,
  rememberReassign,
  rememberedReassign
} from './bots-draft-reassign-candidates'
import { BotsReassignMemberMenu } from './BotsReassignMemberMenu'

export function BotsCommentDraftPostButton({
  label,
  size,
  busy,
  disabled,
  projectId,
  handBackPeople,
  getBodyHtml,
  onPost
}: {
  label: string
  size: 'xs' | 'sm'
  busy: boolean
  disabled: boolean
  projectId: number
  handBackPeople: readonly BotsHandBackPerson[] | undefined
  /** Read when the menu opens, so a mention typed a moment ago is offered. */
  getBodyHtml: () => string
  onPost: (handBackTo?: HandBackTo) => void
}): React.JSX.Element {
  const spinner = size === 'xs' ? 'size-3.5' : 'size-4'
  const selfId = useAppStore((s) => s.activeCollabStatus.connection?.userId ?? null)
  const [candidates, setCandidates] = useState<HandBackTo[]>([])

  const onOpenChange = (open: boolean): void => {
    if (open) {
      setCandidates(
        reassignCandidates({
          remembered: rememberedReassign(projectId),
          bodyHtml: getBodyHtml(),
          handBackPeople: handBackPeople ?? [],
          selfId
        })
      )
    }
  }

  const reassign = (person: HandBackTo): void => {
    rememberReassign(projectId, person)
    onPost(person)
  }

  return (
    <DropdownMenu modal={false} onOpenChange={onOpenChange}>
      <ButtonGroup>
        <Button type="button" size={size} disabled={disabled} onClick={() => onPost()}>
          {busy ? <LoaderCircle className={`${spinner} animate-spin`} /> : null}
          {label}
        </Button>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            size={size === 'xs' ? 'icon-xs' : 'icon-sm'}
            disabled={disabled}
            aria-label={translate(
              'auto.components.bots.commentDrafts.moreOptions',
              'More post options'
            )}
          >
            <ChevronDown className="size-3.5" />
          </Button>
        </DropdownMenuTrigger>
      </ButtonGroup>
      <DropdownMenuContent align="start">
        <DropdownMenuItem onSelect={() => onPost()}>
          {translate('auto.components.bots.commentDrafts.post', 'Post')}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {candidates.map((person) => (
          <DropdownMenuItem key={person.userId} onSelect={() => reassign(person)}>
            {translate(
              'auto.components.bots.commentDrafts.postReassign',
              'Post & reassign to {{value0}}',
              { value0: person.name }
            )}
          </DropdownMenuItem>
        ))}
        {candidates.length > 0 ? <DropdownMenuSeparator /> : null}
        <BotsReassignMemberMenu projectId={projectId} selfId={selfId} onPick={reassign} />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
