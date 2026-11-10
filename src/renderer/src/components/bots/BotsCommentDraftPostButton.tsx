// Post, with a menu holding "Post & reassign to <person>".
import { ChevronDown, LoaderCircle } from 'lucide-react'
import type React from 'react'
import { Button } from '@/components/ui/button'
import { ButtonGroup } from '@/components/ui/button-group'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { translate } from '@/i18n/i18n'
import type { HandBackTo } from './bots-comment-draft-post-action'

export function BotsCommentDraftPostButton({
  label,
  size,
  busy,
  disabled,
  handBackTo,
  onPost
}: {
  label: string
  size: 'xs' | 'sm'
  busy: boolean
  disabled: boolean
  handBackTo: HandBackTo | null | undefined
  onPost: (handBackTo?: HandBackTo) => void
}): React.JSX.Element {
  const spinner = size === 'xs' ? 'size-3.5' : 'size-4'
  return (
    <DropdownMenu modal={false}>
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
        <DropdownMenuItem
          disabled={!handBackTo}
          title={
            handBackTo
              ? undefined
              : translate(
                  'auto.components.bots.commentDrafts.noHandBack',
                  'No one to hand this back to'
                )
          }
          onSelect={() => handBackTo && onPost(handBackTo)}
        >
          {handBackTo
            ? translate(
                'auto.components.bots.commentDrafts.postReassign',
                'Post & reassign to {{value0}}',
                {
                  value0: handBackTo.name
                }
              )
            : translate('auto.components.bots.commentDrafts.postReassignNone', 'Post & reassign')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
