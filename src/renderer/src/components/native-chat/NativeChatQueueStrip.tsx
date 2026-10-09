// Messages sent while the agent works, shown above the composer instead of as
// thread bubbles. Each held message can be steered into the running turn,
// pulled back into the composer, or dropped.

import { useState } from 'react'
import { ImageIcon, Loader2, Pencil, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { translate } from '@/i18n/i18n'
import type { ChatThreadQueuedMessage } from '../../../../shared/chat-thread-stream-types'
import { stripNativeChatImagePathNotes } from './native-chat-file-reference-display'
import type { NativeChatMessageQueue } from './native-chat-view-types'

/** The text a queued message shows and restores, without the image path notes the composer appends. */
export function nativeChatQueuedMessageText(item: ChatThreadQueuedMessage): string {
  return stripNativeChatImagePathNotes(item.text).trim()
}

function QueueRow({
  item,
  onSteer,
  onEdit,
  onRemove
}: {
  item: ChatThreadQueuedMessage
  onSteer: () => void
  onEdit: (confirmed: boolean) => 'edited' | 'needs-confirm'
  onRemove: () => void
}): React.JSX.Element {
  const [confirmingReplace, setConfirmingReplace] = useState(false)
  const text = nativeChatQueuedMessageText(item)
  const imageCount = item.imagePaths?.length ?? 0
  const inFlight = item.state !== 'queued'

  if (confirmingReplace) {
    return (
      <li className="flex min-h-8 items-center gap-2 px-2 py-1 text-[13px]">
        <span className="min-w-0 flex-1 truncate text-muted-foreground">
          {translate('components.native-chat.queue.replaceDraft', 'Replace your draft?')}
        </span>
        <Button size="xs" variant="ghost" onClick={() => setConfirmingReplace(false)}>
          {translate('components.native-chat.queue.cancel', 'Cancel')}
        </Button>
        <Button
          size="xs"
          variant="secondary"
          onClick={() => {
            setConfirmingReplace(false)
            onEdit(true)
          }}
        >
          {translate('components.native-chat.queue.replace', 'Replace')}
        </Button>
      </li>
    )
  }

  return (
    <li className="flex min-h-8 items-center gap-2 px-2 py-1 text-[13px]">
      {inFlight ? (
        <Loader2 className="size-3.5 shrink-0 animate-spin text-muted-foreground" aria-hidden />
      ) : null}
      <span
        className={
          inFlight ? 'min-w-0 flex-1 truncate text-muted-foreground' : 'min-w-0 flex-1 truncate'
        }
      >
        {inFlight ? (
          <span className="mr-1.5">
            {item.state === 'steering'
              ? translate('components.native-chat.queue.steering', 'Steering…')
              : translate('components.native-chat.queue.sending', 'Sending…')}
          </span>
        ) : null}
        {text}
      </span>
      {imageCount > 0 ? (
        <span
          className="flex shrink-0 items-center gap-0.5 text-xs text-muted-foreground"
          aria-label={translate(
            'components.native-chat.queue.imageCount',
            '{{count}} images attached',
            { count: imageCount }
          )}
        >
          <ImageIcon className="size-3" aria-hidden />
          {imageCount}
        </span>
      ) : null}
      {inFlight ? null : (
        <div className="flex shrink-0 items-center gap-0.5">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="xs"
                variant="ghost"
                onClick={onSteer}
                aria-label={translate('components.native-chat.queue.steerAria', 'Steer: {{text}}', {
                  text
                })}
              >
                {translate('components.native-chat.queue.steer', 'Steer')}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top" sideOffset={4}>
              {translate(
                'components.native-chat.queue.steerTooltip',
                'Send now. The agent reads it at its next step.'
              )}
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="icon-xs"
                variant="ghost"
                onClick={() => {
                  if (onEdit(false) === 'needs-confirm') {
                    setConfirmingReplace(true)
                  }
                }}
                aria-label={translate('components.native-chat.queue.editAria', 'Edit: {{text}}', {
                  text
                })}
              >
                <Pencil />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top" sideOffset={4}>
              {translate('components.native-chat.queue.edit', 'Edit')}
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="icon-xs"
                variant="ghost"
                onClick={onRemove}
                aria-label={translate(
                  'components.native-chat.queue.removeAria',
                  'Remove: {{text}}',
                  { text }
                )}
              >
                <X />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top" sideOffset={4}>
              {translate('components.native-chat.queue.remove', 'Remove')}
            </TooltipContent>
          </Tooltip>
        </div>
      )}
    </li>
  )
}

export function NativeChatQueueStrip({
  queue,
  composerHasDraft,
  restoreToComposer
}: {
  queue: NativeChatMessageQueue
  composerHasDraft: () => boolean
  /** Puts the message back in the composer, replacing any draft. */
  restoreToComposer: (text: string, imagePaths: string[]) => void
}): React.JSX.Element | null {
  if (queue.items.length === 0) {
    return null
  }
  const heldCount = queue.items.filter((item) => item.state === 'queued').length
  const edit = (item: ChatThreadQueuedMessage, confirmed: boolean): 'edited' | 'needs-confirm' => {
    if (!confirmed && composerHasDraft()) {
      return 'needs-confirm'
    }
    queue.remove(item.id)
    restoreToComposer(nativeChatQueuedMessageText(item), item.imagePaths ?? [])
    return 'edited'
  }
  return (
    <div className="px-3 pt-2 sm:px-4">
      <section
        className="mx-auto w-full max-w-3xl rounded-lg border border-border bg-muted/30"
        aria-label={translate('components.native-chat.queue.label', 'Queued messages')}
      >
        <div className="flex min-h-7 items-center gap-2 border-b border-border/60 px-2 py-0.5">
          <span className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
            {translate('components.native-chat.queue.title', 'Queued')}
            {heldCount > 0 ? ` (${heldCount})` : null}
          </span>
          {queue.paused ? (
            <>
              <span className="text-xs text-muted-foreground">
                {translate('components.native-chat.queue.paused', 'Paused after Stop')}
              </span>
              <Button size="xs" variant="outline" className="ml-auto" onClick={queue.sendNext}>
                {translate('components.native-chat.queue.sendNext', 'Send next')}
              </Button>
            </>
          ) : null}
        </div>
        <ul className="py-0.5">
          {queue.items.map((item) => (
            <QueueRow
              key={item.id}
              item={item}
              onSteer={() => queue.steer(item.id)}
              onEdit={(confirmed) => edit(item, confirmed)}
              onRemove={() => queue.remove(item.id)}
            />
          ))}
        </ul>
      </section>
    </div>
  )
}
