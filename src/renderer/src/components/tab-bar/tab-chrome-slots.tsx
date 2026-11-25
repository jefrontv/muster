import type React from 'react'
import { Pin } from 'lucide-react'
import { cn } from '@/lib/utils'
import { TabCloseButton } from './TabCloseButton'
import { TabStateDot } from './TabStateDot'
import type { TabTrailingState } from './tab-trailing-state'

/** Fixed 16px icon slot so icon swaps (agent state, loading, collapse) never change tab width. */
export function TabLeadingSlot({
  children,
  className,
  style
}: {
  children: React.ReactNode
  className?: string
  style?: React.CSSProperties
}): React.JSX.Element {
  return (
    <span
      data-tab-leading-slot="true"
      className={cn('relative grid size-4 shrink-0 place-items-center', className)}
      style={style}
    >
      {children}
    </span>
  )
}

/** Fixed 16px slot shared by the close button, state dots and the pin. */
export function TabTrailingSlot({
  state,
  closeAriaLabel,
  onClose
}: {
  state: TabTrailingState
  closeAriaLabel?: string
  onClose: () => void
}): React.JSX.Element {
  const { indicator, close } = state
  return (
    <span
      data-tab-trailing-slot={indicator ?? 'close'}
      className="relative grid size-4 shrink-0 place-items-center"
    >
      {indicator === 'pinned' ? (
        <Pin className="size-3 text-muted-foreground" aria-hidden />
      ) : indicator ? (
        <TabStateDot indicator={indicator} hideOnHover={close !== 'never'} />
      ) : null}
      {close === 'never' ? null : (
        <TabCloseButton
          mode={indicator ? 'over-indicator' : close}
          ariaLabel={closeAriaLabel}
          onClose={onClose}
        />
      )}
    </span>
  )
}

/** Tooltip text for a tab: the full label plus quieter detail lines. */
export function TabTooltipBody({
  label,
  details
}: {
  label: string
  details?: readonly string[]
}): React.JSX.Element {
  return (
    <>
      <span className="block">{label}</span>
      {details?.map((detail) => (
        <span key={detail} className="block text-background/70">
          {detail}
        </span>
      ))}
    </>
  )
}
