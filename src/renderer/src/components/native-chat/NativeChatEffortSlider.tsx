// Chat mode's effort picker: a stepped track with a knob, in place of the radio list.
// It is a menu row so the dropdown's roving focus can reach it; arrows step it.

import { useEffect, useRef, useState } from 'react'
import type React from 'react'
import { Zap } from 'lucide-react'
import { DropdownMenuItem } from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import type { SessionOptionSelectChoice } from '../../../../shared/native-chat-session-options'
import { nativeChatSessionChoiceLabel } from './native-chat-session-option-labels'

/** Overshoots a touch, so the knob lands on its stop instead of stopping dead. */
const SPRING = 'ease-[cubic-bezier(0.34,1.4,0.64,1)]'

const stopShare = (index: number, count: number): number => (count < 2 ? 0 : index / (count - 1))

/** Track geometry: 32px tall, a 28px knob, so stops span the width less 16px each end. */
const at = (share: number, extra = 0): string => `calc(${share} * (100% - 32px) + ${16 + extra}px)`

export function NativeChatEffortSlider(props: {
  choices: readonly SessionOptionSelectChoice[]
  /** Applied (or settings-file) value; null leaves the knob off the track. */
  value: string | null
  disabled: boolean
  onChange: (value: string) => void
}): React.JSX.Element {
  const { choices } = props
  const last = Math.max(0, choices.length - 1)
  const track = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)
  // Raw 0..1 position while dragging; the knob follows the pointer, then springs to a stop.
  const [dragShare, setDragShare] = useState<number | null>(null)
  // The released stop, held until the applied value moves off `base` so the knob doesn't snap back.
  const [pending, setPending] = useState<{ index: number; base: string | null } | null>(null)
  useEffect(() => {
    if (!pending) {
      return
    }
    const timer = setTimeout(() => setPending(null), 3000)
    return () => clearTimeout(timer)
  }, [pending])
  const valueIndex = choices.findIndex((choice) => choice.value === props.value)
  const held = pending && pending.base === props.value ? pending.index : null
  const settled = held ?? (valueIndex >= 0 ? valueIndex : null)
  const shown = dragShare === null ? settled : Math.round(dragShare * last)
  const share = dragShare ?? (settled === null ? null : stopShare(settled, choices.length))
  const labels = choices.map((choice) => nativeChatSessionChoiceLabel(choice))
  const shownLabel =
    shown === null
      ? translate('components.native-chat.composer.defaultEffort', 'Default')
      : labels[shown]

  const shareAt = (clientX: number): number => {
    const rect = track.current?.getBoundingClientRect()
    if (!rect || rect.width <= 32) {
      return 0
    }
    return Math.min(1, Math.max(0, (clientX - rect.left - 16) / (rect.width - 32)))
  }
  const commit = (index: number): void => {
    const choice = choices[index]
    if (choice && choice.value !== props.value) {
      setPending({ index, base: props.value })
      props.onChange(choice.value)
    }
  }
  const step = (event: React.KeyboardEvent): void => {
    const from = shown ?? 0
    const to =
      event.key === 'ArrowRight'
        ? from + 1
        : event.key === 'ArrowLeft'
          ? from - 1
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? last
              : null
    // Up/Down stay with the menu so focus can leave the slider.
    if (to === null) {
      return
    }
    event.preventDefault()
    event.stopPropagation()
    if (!props.disabled) {
      commit(Math.min(last, Math.max(0, to)))
    }
  }
  const reduce = dragShare === null && 'motion-reduce:transition-none'

  return (
    <DropdownMenuItem
      role="slider"
      aria-label={translate('components.native-chat.composer.effort', 'Effort')}
      aria-valuemin={0}
      aria-valuemax={last}
      aria-valuenow={shown ?? undefined}
      aria-valuetext={shownLabel}
      disabled={props.disabled}
      onSelect={(event) => event.preventDefault()}
      onKeyDown={step}
      className="group/effort flex-col items-stretch gap-2.5 px-2 py-2 focus:bg-transparent"
    >
      <div className="flex items-center gap-1.5 text-xs">
        <Zap
          aria-hidden
          className="size-3.5 text-chat-accent transition-[fill-opacity] duration-300"
          fill="currentColor"
          fillOpacity={share === null ? 0 : 0.15 + share * 0.85}
        />
        <span className="text-muted-foreground">
          {translate('components.native-chat.composer.effort', 'Effort')}
        </span>
        <span
          key={shownLabel}
          className="ml-auto text-foreground animate-in fade-in slide-in-from-bottom-1 duration-200 motion-reduce:animate-none"
        >
          {shownLabel}
        </span>
      </div>
      <div
        ref={track}
        data-effort-track=""
        className="relative h-8 touch-none overflow-hidden rounded-full bg-foreground/[0.07] ring-foreground/15 group-data-[highlighted]/effort:ring-1 group-data-[disabled]/effort:opacity-50"
        onPointerDown={(event) => {
          if (props.disabled || event.button !== 0) {
            return
          }
          event.currentTarget.setPointerCapture(event.pointerId)
          dragging.current = true
          setDragShare(shareAt(event.clientX))
        }}
        onPointerMove={(event) => {
          if (dragging.current) {
            setDragShare(shareAt(event.clientX))
          }
        }}
        onPointerUp={(event) => {
          if (dragging.current) {
            dragging.current = false
            commit(Math.round(shareAt(event.clientX) * last))
            setDragShare(null)
          }
        }}
        onPointerCancel={() => {
          dragging.current = false
          setDragShare(null)
        }}
      >
        {share !== null ? (
          <span
            aria-hidden
            className={cn(
              'absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-chat-accent/10 to-chat-accent/45',
              dragShare === null && `transition-[width] duration-300 ${SPRING}`,
              reduce
            )}
            style={{ width: at(share, 16) }}
          />
        ) : null}
        {choices.map((choice, index) => {
          const passed = shown !== null && index <= shown
          return (
            <span
              key={choice.value}
              aria-hidden
              className={cn(
                'absolute top-1/2 size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full transition-colors duration-200',
                passed ? 'bg-foreground/50' : 'bg-foreground/30'
              )}
              style={{ left: at(stopShare(index, choices.length)) }}
            />
          )
        })}
        {share !== null ? (
          <span
            aria-hidden
            data-effort-knob=""
            className={cn(
              'absolute top-1/2 size-7 -translate-x-1/2 -translate-y-1/2 rounded-full bg-foreground shadow-[0_1px_3px_rgb(0_0_0/0.3)]',
              dragShare === null
                ? `transition-[left,scale,box-shadow] duration-300 ${SPRING}`
                : 'scale-110 shadow-[0_2px_10px_rgb(0_0_0/0.35)] transition-[scale,box-shadow] duration-150',
              reduce
            )}
            style={{ left: at(share) }}
          />
        ) : null}
      </div>
    </DropdownMenuItem>
  )
}
