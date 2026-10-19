// Messages sent while the agent works, shown above the composer instead of as
// thread bubbles. Each held message can be steered into the running turn,
// pulled back into the composer, or dropped.

import { useState } from 'react'
import { ImageIcon, Loader2, Pencil, X } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { translate } from '@/i18n/i18n'
import type { ChatThreadQueuedMessage } from '../../../../shared/chat-thread-stream-types'
import { stripNativeChatImagePathNotes } from './native-chat-file-reference-display'
import type { NativeChatMessageQueue } from './native-chat-view-types'

/** Rows: 36px floor, a line-1 divider above every row but the first. */
const ROW_CLASS =
  'flex min-h-9 items-center gap-2.5 py-1 pr-[5px] pl-3 text-[13px] leading-6 [&+&]:shadow-[inset_0_1px_0_var(--chat-line-1)]'

const ICON_ACTION_CLASS =
  'flex size-7 shrink-0 items-center justify-center rounded-full text-chat-ink-tertiary transition-colors duration-100 ease-chat hover:bg-chat-hover hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chat-accent [&_svg]:size-3.5'

const TEXT_ACTION_CLASS =
  'flex h-7 shrink-0 items-center rounded-full px-2.5 text-[13px] text-chat-ink-tertiary transition-colors duration-100 ease-chat hover:bg-chat-hover hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chat-accent'

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
      <li className={ROW_CLASS}>
        <span className="min-w-0 flex-1 truncate text-chat-ink-secondary">
          {translate('components.native-chat.queue.replaceDraft', 'Replace your draft?')}
        </span>
        <button
          type="button"
          className={TEXT_ACTION_CLASS}
          onClick={() => setConfirmingReplace(false)}
        >
          {translate('components.native-chat.queue.cancel', 'Cancel')}
        </button>
        <button
          type="button"
          className={TEXT_ACTION_CLASS}
          onClick={() => {
            setConfirmingReplace(false)
            onEdit(true)
          }}
        >
          {translate('components.native-chat.queue.replace', 'Replace')}
        </button>
      </li>
    )
  }

  return (
    <li className={ROW_CLASS}>
      {inFlight ? (
        <Loader2
          className="size-3.5 shrink-0 animate-spin text-chat-ink-tertiary motion-reduce:animate-none"
          aria-hidden
        />
      ) : null}
      <span
        className={
          inFlight
            ? 'min-w-0 flex-1 truncate text-chat-ink-tertiary'
            : 'min-w-0 flex-1 truncate text-chat-ink-secondary'
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
          className="flex shrink-0 items-center gap-0.5 text-xs text-chat-ink-tertiary"
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
        <div className="flex shrink-0 items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className={TEXT_ACTION_CLASS}
                onClick={onSteer}
                aria-label={translate('components.native-chat.queue.steerAria', 'Steer: {{text}}', {
                  text
                })}
              >
                {translate('components.native-chat.queue.steer', 'Steer')}
              </button>
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
              <button
                type="button"
                className={ICON_ACTION_CLASS}
                onClick={() => {
                  if (onEdit(false) === 'needs-confirm') {
                    setConfirmingReplace(true)
                  }
                }}
                aria-label={translate('components.native-chat.queue.editAria', 'Edit: {{text}}', {
                  text
                })}
              >
                <Pencil aria-hidden />
              </button>
            </TooltipTrigger>
            <TooltipContent side="top" sideOffset={4}>
              {translate('components.native-chat.queue.edit', 'Edit')}
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className={ICON_ACTION_CLASS}
                onClick={onRemove}
                aria-label={translate(
                  'components.native-chat.queue.removeAria',
                  'Remove: {{text}}',
                  { text }
                )}
              >
                <X aria-hidden />
              </button>
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
    // A tab inset 8px each side and tucked 3px under the composer card: -mb cancels the seat's 6px gap plus 3.
    <section
      className="relative isolate mx-2 -mb-[9px] overflow-hidden rounded-t-[16px] bg-chat-raised/60 py-0.5 backdrop-blur-[40px] backdrop-saturate-150 after:pointer-events-none after:absolute after:inset-0 after:rounded-[inherit] after:border-[0.5px] after:border-b-0 after:border-chat-line-1"
      aria-label={translate('components.native-chat.queue.label', 'Queued messages')}
    >
      <div className="flex h-9 items-center gap-2.5 px-3 py-1">
        <span className="min-w-0 flex-1 truncate text-[13px] leading-6 font-medium text-foreground">
          {translate('components.native-chat.queue.title', 'Queued')}
          {heldCount > 0 ? ` (${heldCount})` : null}
          {queue.paused ? (
            <span className="ml-2 font-normal text-chat-ink-tertiary">
              {translate('components.native-chat.queue.paused', 'Paused after Stop')}
            </span>
          ) : null}
        </span>
        {queue.paused ? (
          <button type="button" className={TEXT_ACTION_CLASS} onClick={queue.sendNext}>
            {translate('components.native-chat.queue.sendNext', 'Send next')}
          </button>
        ) : null}
      </div>
      <ul className="scrollbar-sleek max-h-[180px] overflow-y-auto">
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
  )
}
