import type { RefObject } from 'react'
import { Check, Pencil, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import type { AskAnswerSelection, AskPrompt } from './native-chat-interactive-prompt'
import { useNativeChatSurface } from './native-chat-surface-context'
import { useNativeChatQuestionAnswers } from './use-native-chat-question-answers'
import { NativeChatSeatQuestionCard } from './NativeChatSeatQuestionCard'

export type NativeChatQuestionCardProps = {
  prompt: AskPrompt
  /** Whether the snapshotted answer is still being delivered to the agent. */
  isSubmitting?: boolean
  /** Deliver the chosen answer (per-question option indices + free text). */
  onAnswer: (selections: AskAnswerSelection[]) => void
  /** Dismiss the prompt (sends Escape to the agent). */
  onCancel: () => void
  /** Exposes the free-text row so pane-level Paste can target it while the
   *  card replaces the composer (a textarea in the seat, an input when docked). */
  answerInputRef?: RefObject<HTMLInputElement | HTMLTextAreaElement | null>
}

/**
 * Native renderer for an agent's AskUserQuestion prompt: a numbered pick-list
 * (mobile/Claude-Code parity) with a header + close, a hover-highlighted row per
 * option, and an always-present free-text row for a custom answer. Single-select
 * commits on click; multi-select toggles and confirms via the trailing action.
 * Multi-question prompts step through tabs across the top. Neutral shadcn tokens.
 * In the chat seat it draws NativeChatSeatQuestionCard instead.
 */
export function NativeChatQuestionCard({
  prompt,
  isSubmitting = false,
  onAnswer,
  onCancel,
  answerInputRef
}: NativeChatQuestionCardProps): React.JSX.Element {
  const answers = useNativeChatQuestionAnswers({ prompt, onAnswer, onCancel })
  const { index, total, isLast, question: q, currentAnswered, confirm, answerFor } = answers
  const { seat } = useNativeChatSurface()
  if (seat) {
    return (
      <NativeChatSeatQuestionCard
        answers={answers}
        isSubmitting={isSubmitting}
        onCancel={onCancel}
        answerInputRef={answerInputRef}
      />
    )
  }

  return (
    // Part of the composer: docked in the bottom input region, matching the
    // composer's width and padding, rendered as the "ask" dialog card directly
    // above the text input. Its free-text row is the answer input.
    <div className="shrink-0 bg-background" aria-busy={isSubmitting}>
      <div className="mx-auto w-full max-w-3xl px-3 pt-2 pb-4 sm:px-4">
        {total > 1 ? (
          <div className="mb-2 flex gap-1 overflow-x-auto pb-1 scrollbar-sleek">
            {prompt.questions.map((qq, i) => (
              <button
                key={i}
                type="button"
                disabled={isSubmitting}
                onClick={() => answers.setIndex(i)}
                className={cn(
                  'flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs font-medium disabled:pointer-events-none',
                  i === index
                    ? 'bg-accent text-accent-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <span className="max-w-[10rem] truncate">
                  {qq.header ||
                    translate('components.native-chat.question.step', 'Step {{value0}}', {
                      value0: i + 1
                    })}
                </span>
                {answerFor(i).length > 0 ? (
                  <Check className="size-3 text-primary" strokeWidth={3} />
                ) : null}
              </button>
            ))}
          </div>
        ) : null}

        <div className="overflow-hidden rounded-lg border border-input bg-card shadow-xs">
          <div className="flex items-center justify-between gap-2 px-3.5 py-2.5">
            <p
              className="min-w-0 truncate text-sm font-semibold text-foreground"
              title={q.question}
            >
              {q.question}
            </p>
            <button
              type="button"
              onClick={onCancel}
              aria-label={translate('components.native-chat.question.cancel', 'Cancel')}
              className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X className="size-4" />
            </button>
          </div>

          {/* Scroll only kicks in on long option lists; the sleek scrollbar rides
              the card's right edge instead of crowding the choices. */}
          <div className="max-h-[50vh] divide-y divide-border/60 overflow-y-auto border-t border-border scrollbar-sleek">
            {q.options.map((opt, i) => (
              <OptionRow
                key={`${i}:${opt.label}`}
                badge={String(i + 1)}
                label={opt.label}
                description={opt.description}
                selected={(answers.selections[index] ?? []).includes(i)}
                disabled={isSubmitting}
                onSelect={() => answers.pickOption(i)}
              />
            ))}
            <div className="flex items-center gap-3 px-3.5 py-2.5">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                <Pencil className="size-3.5" />
              </span>
              <input
                ref={docked(answerInputRef)}
                disabled={isSubmitting}
                value={answers.otherText[index]}
                onChange={(e) => answers.setOther(index, e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    confirm(true)
                  }
                }}
                placeholder={translate(
                  'components.native-chat.question.otherPlaceholder',
                  'Type your answer'
                )}
                className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground/60 disabled:cursor-default disabled:opacity-50"
              />
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => confirm()}
                className={cn(
                  'shrink-0 whitespace-nowrap rounded-md px-3 py-1 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default disabled:opacity-50',
                  currentAnswered
                    ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                )}
              >
                {isSubmitting
                  ? translate('components.native-chat.question.sending', 'Sending…')
                  : currentAnswered
                    ? isLast
                      ? translate('components.native-chat.question.send', 'Submit')
                      : translate('components.native-chat.question.next', 'Next')
                    : translate('components.native-chat.question.skip', 'Skip')}
              </button>
            </div>
          </div>
        </div>

        {total > 1 ? (
          <p className="mt-2 text-right text-xs text-muted-foreground">
            {index + 1}/{total}
          </p>
        ) : null}
      </div>
    </div>
  )
}

function OptionRow({
  badge,
  label,
  description,
  selected,
  disabled,
  onSelect
}: {
  badge: string
  label: string
  description?: string
  selected: boolean
  disabled: boolean
  onSelect: () => void
}): React.JSX.Element {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onSelect}
      // Selection is otherwise only the visual check/badge swap; expose it to
      // assistive tech.
      aria-pressed={selected}
      className={cn(
        'flex w-full items-center gap-3 px-3.5 py-2.5 text-left transition-colors disabled:pointer-events-none',
        selected ? 'bg-accent' : 'hover:bg-accent'
      )}
    >
      <span
        className={cn(
          'flex size-6 shrink-0 items-center justify-center rounded-md text-xs font-medium',
          selected ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
        )}
      >
        {selected ? <Check className="size-3.5" strokeWidth={3} /> : badge}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm text-foreground" title={label}>
          {label}
        </span>
        {description ? (
          <span className="block truncate text-xs text-muted-foreground" title={description}>
            {description}
          </span>
        ) : null}
      </span>
    </button>
  )
}

/** The docked look keeps its single-line input, so narrow the shared ref for it. */
function docked(
  ref: RefObject<HTMLInputElement | HTMLTextAreaElement | null> | undefined
): RefObject<HTMLInputElement | null> | undefined {
  return ref as RefObject<HTMLInputElement | null> | undefined
}
