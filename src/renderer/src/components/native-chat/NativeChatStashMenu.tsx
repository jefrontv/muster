// Composer-footer prompt-stash control: a stack icon with a count badge that
// pulses on stash, opening a menu of stashed prompts to restore or delete.

import { Layers, X } from 'lucide-react'
import type React from 'react'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { promptStashRelativeLabel, promptStashSnippet } from './native-chat-prompt-stash'
import type { NativeChatPromptStash } from './use-native-chat-prompt-stash'

export function NativeChatStashMenu({
  stash
}: {
  stash: NativeChatPromptStash
}): React.JSX.Element {
  const label = translate('auto.components.native-chat.stash.label', 'Stashed prompts')
  const now = Date.now()
  return (
    <DropdownMenu
      onOpenChange={(open) => {
        // Another thread or surface may have stashed since this menu last opened.
        if (open) {
          stash.refresh()
        }
      }}
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={label}
              className="relative pointer-coarse:size-11"
            >
              <Layers className="size-4" />
              {stash.entries.length > 0 ? (
                <span
                  className={cn(
                    'absolute -right-0.5 -top-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-primary px-0.5 text-[9px] font-medium leading-none text-primary-foreground transition-transform',
                    stash.pulse && 'scale-125'
                  )}
                >
                  {stash.entries.length}
                </span>
              ) : null}
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent side="top" sideOffset={4}>
          {label}
        </TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="start" side="top" className="w-80">
        <DropdownMenuLabel className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          {label}
        </DropdownMenuLabel>
        {stash.entries.length === 0 ? (
          <p className="px-2 pb-2 pt-1 text-xs text-muted-foreground">
            {translate(
              'auto.components.native-chat.stash.empty',
              'Nothing stashed yet. Press the save shortcut with a prompt in the composer to stash it.'
            )}
          </p>
        ) : (
          stash.entries.map((entry) => (
            <DropdownMenuItem
              key={entry.id}
              className="group/stash gap-2"
              onSelect={() => stash.restore(entry)}
            >
              <span className="min-w-0 flex-1 truncate text-sm">
                {promptStashSnippet(entry.text)}
              </span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {promptStashRelativeLabel(entry.createdAt, now)}
              </span>
              <button
                type="button"
                aria-label={translate(
                  'auto.components.native-chat.stash.delete',
                  'Delete stashed prompt'
                )}
                className="flex size-4 shrink-0 items-center justify-center rounded-sm text-muted-foreground opacity-0 transition-opacity hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring group-hover/stash:opacity-100"
                onClick={(event) => {
                  event.stopPropagation()
                  event.preventDefault()
                  stash.remove(entry.id)
                }}
              >
                <X className="size-3" />
              </button>
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
