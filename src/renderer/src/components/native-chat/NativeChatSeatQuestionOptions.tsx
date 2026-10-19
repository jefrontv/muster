// Option rows and the free-text answer for the seated question card: 40px
// rounded rows with a first-line-aligned badge or checkbox, per DSH §4.

import type React from 'react'
import type { KeyboardEvent } from 'react'
import { Check, Pencil } from 'lucide-react'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import type { AskOption } from './native-chat-interactive-prompt'

export function NativeChatSeatOptionRow(props: {
  index: number
  option: AskOption
  multiSelect: boolean
  selected: boolean
  disabled: boolean
  onSelect: () => void
}): React.JSX.Element {
  const { option, selected } = props
  return (
    <button
      type="button"
      disabled={props.disabled}
      onClick={props.onSelect}
      aria-pressed={selected}
      className={cn(
        'flex min-h-10 w-full shrink-0 items-start gap-2 rounded-[12px] border py-2 pr-3 pl-2 text-left transition-colors duration-[120ms] ease-chat enabled:hover:bg-chat-hover disabled:cursor-default focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chat-accent motion-reduce:transition-none',
        selected ? 'border-chat-line-2 bg-chat-hover' : 'border-transparent'
      )}
    >
      {props.multiSelect ? (
        <span aria-hidden className="mt-0.5 grid size-5 shrink-0 place-items-center">
          <span
            className={cn(
              'grid size-3.5 place-items-center rounded-[4px] border-[0.5px] transition-colors duration-[120ms] ease-chat',
              selected
                ? 'border-foreground bg-foreground text-background'
                : 'border-chat-line-4 bg-transparent'
            )}
          >
            {selected ? <Check className="size-2.5" strokeWidth={3} /> : null}
          </span>
        </span>
      ) : (
        <span
          aria-hidden
          className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-[4px] bg-chat-hover text-xs leading-[18px] font-medium text-chat-ink-secondary"
        >
          {props.index + 1}
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block text-sm leading-6 font-medium text-foreground">{option.label}</span>
        {option.description ? (
          <span className="block text-sm leading-6 text-chat-ink-tertiary">
            {option.description}
          </span>
        ) : null}
      </span>
    </button>
  )
}

/** Shift+Enter keeps the newline; a bare Enter continues, outside IME composition. */
function continueOnEnter(onContinue: () => void) {
  return (event: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (
      event.key === 'Enter' &&
      !event.shiftKey &&
      !event.nativeEvent.isComposing &&
      event.keyCode !== 229
    ) {
      event.preventDefault()
      onContinue()
    }
  }
}

export function NativeChatSeatAnswerField(props: {
  value: string
  disabled: boolean
  /** Option-less questions: the answer is the whole body, in its own 64px frame. */
  block: boolean
  inputRef: (element: HTMLTextAreaElement | null) => void
  onChange: (value: string) => void
  onContinue: () => void
}): React.JSX.Element {
  const placeholder = translate(
    'components.native-chat.question.otherPlaceholder',
    'Type your answer'
  )
  const textarea = (
    <textarea
      ref={props.inputRef}
      rows={props.block ? 2 : 1}
      value={props.value}
      disabled={props.disabled}
      onChange={(event) => props.onChange(event.target.value)}
      onKeyDown={continueOnEnter(props.onContinue)}
      placeholder={placeholder}
      aria-label={placeholder}
      // field-sizing grows the field with the draft; past 6 lines (144px) it scrolls.
      className={cn(
        'scrollbar-sleek field-sizing-content max-h-[144px] w-full min-w-0 resize-none overflow-y-auto bg-transparent text-sm leading-6 break-words text-foreground caret-chat-accent outline-none placeholder:text-chat-ink-caption disabled:cursor-default disabled:opacity-50',
        props.block ? 'box-content min-h-12 px-3 py-2' : 'min-h-6'
      )}
    />
  )
  if (props.block) {
    return (
      <div className="mx-3 min-h-16 shrink-0 rounded-[16px] border-[0.5px] border-chat-line-4 transition-colors duration-[120ms] ease-chat focus-within:border-chat-accent">
        {textarea}
      </div>
    )
  }
  return (
    <div
      className={cn(
        'flex min-h-10 w-full shrink-0 items-start gap-2 rounded-[12px] border py-2 pr-3 pl-2 transition-colors duration-[120ms] ease-chat hover:bg-chat-hover focus-within:border-chat-line-2 focus-within:bg-chat-hover motion-reduce:transition-none',
        props.value.trim().length > 0 ? 'border-chat-line-2 bg-chat-hover' : 'border-transparent'
      )}
    >
      <span
        aria-hidden
        className="mt-0.5 grid size-5 shrink-0 place-items-center text-chat-ink-tertiary"
      >
        <Pencil className="size-3.5" />
      </span>
      {textarea}
    </div>
  )
}
