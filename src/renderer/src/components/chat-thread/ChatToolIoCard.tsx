import { Fragment } from 'react'
import type React from 'react'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'

export type ChatToolIoSection = {
  kind: 'in' | 'out'
  text: React.ReactNode
  isError?: boolean
  /** Terminal output gets a taller cap than the 150px default. */
  tall?: boolean
}

const LABEL = {
  in: () => translate('components.chat-thread.io.in', 'IN'),
  out: () => translate('components.chat-thread.io.out', 'OUT')
} as const

/** Expanded tool body: IN and OUT sections on the code fill, each scrolling on its own. */
export function ChatToolIoCard({
  sections
}: {
  sections: ChatToolIoSection[]
}): React.JSX.Element | null {
  if (sections.length === 0) {
    return null
  }
  return (
    <div className="my-1 ml-1 flex flex-col overflow-hidden rounded-[16px] border-[0.5px] border-chat-line-1 bg-chat-code font-mono text-[11px] leading-4">
      {sections.map((section, index) => (
        <Fragment key={section.kind}>
          {index > 0 && <div className="h-[0.5px] shrink-0 bg-chat-line-2" aria-hidden />}
          <div
            className={cn(
              'scrollbar-sleek grid grid-cols-[max-content_minmax(0,1fr)] items-baseline gap-x-3.5 overflow-y-auto px-4 py-3',
              section.tall ? 'max-h-[224px]' : 'max-h-[150px]'
            )}
          >
            {/* Sticky so the label stays put while a long payload scrolls beside it. */}
            <span className="sticky top-0 select-none self-start text-chat-ink-caption">
              {LABEL[section.kind]()}
            </span>
            <pre
              className={cn(
                'min-w-0 whitespace-pre-wrap break-words font-mono',
                section.isError ? 'text-destructive' : 'text-chat-ink-secondary'
              )}
            >
              {section.text}
            </pre>
          </div>
        </Fragment>
      ))}
    </div>
  )
}
