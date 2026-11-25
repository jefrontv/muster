import { X } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useOptionalShortcutLabel } from '@/hooks/useShortcutLabel'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'

export type TabCloseButtonMode = 'always' | 'hover' | 'over-indicator'

const MODE_CLASSES: Record<TabCloseButtonMode, string> = {
  always: 'grid text-muted-foreground',
  hover: 'grid text-transparent group-hover:text-muted-foreground',
  'over-indicator': 'hidden text-muted-foreground group-hover:grid group-focus-within:grid'
}

export function TabCloseButton({
  mode,
  ariaLabel,
  onClose
}: {
  mode: TabCloseButtonMode
  ariaLabel?: string
  onClose: () => void
}): React.JSX.Element {
  const closeShortcut = useOptionalShortcutLabel('tab.close')
  const closeLabel = translate('auto.components.tab.bar.TabCloseButton.closeTab', 'Close tab')

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className={cn(
            'hit-area z-10 size-4 shrink-0 place-items-center rounded-full hover:bg-foreground/[0.07] hover:!text-foreground focus-visible:bg-foreground/[0.07] focus-visible:!text-foreground',
            MODE_CLASSES[mode]
          )}
          // Why: E2E drives the real close path through this attribute, not the tab chrome.
          data-tab-close-button="true"
          // Why: tabs own keyboard focus; Cmd/Ctrl+W and the context menu close from the keyboard.
          tabIndex={-1}
          aria-label={ariaLabel ?? closeLabel}
          onPointerDown={(e) => {
            if (e.button === 0) {
              e.stopPropagation()
            }
          }}
          onMouseDown={(e) => {
            if (e.button === 0) {
              e.stopPropagation()
            }
          }}
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            onClose()
          }}
        >
          <X className="size-3" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom" sideOffset={6}>
        {closeShortcut ? `${closeLabel} (${closeShortcut})` : closeLabel}
      </TooltipContent>
    </Tooltip>
  )
}
