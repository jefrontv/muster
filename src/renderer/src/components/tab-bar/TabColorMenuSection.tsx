import { DropdownMenuItem } from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/store'
import { TAB_COLOR_SWATCHES, useUnifiedTabColor } from './tab-colors'

/** "Tab color" grid shared by every tab type's context menu. */
export function TabColorMenuSection({
  value,
  onChange
}: {
  value: string | null
  onChange: (color: string | null) => void
}): React.JSX.Element {
  const selected = value?.toLowerCase() ?? null
  return (
    <div className="px-2 pt-1.5 pb-1">
      <div className="mb-1.5 text-xs font-medium text-muted-foreground">
        {translate('auto.components.tab.bar.SortableTabContextMenu.35e8892fd0', 'Tab color')}
      </div>
      <div className="grid grid-cols-5 justify-items-center gap-1">
        {TAB_COLOR_SWATCHES.map((swatch) => {
          const isSelected = (swatch.value?.toLowerCase() ?? null) === (selected ?? null)
          return (
            <Tooltip key={swatch.value ?? 'none'}>
              <TooltipTrigger asChild>
                <DropdownMenuItem
                  aria-label={swatch.label}
                  aria-checked={isSelected}
                  role="menuitemradio"
                  data-tab-color-swatch={swatch.value ?? 'none'}
                  className="size-7 min-w-7 justify-center rounded-full p-0 focus-visible:ring-2 focus-visible:ring-ring data-[highlighted]:bg-foreground/[0.07]"
                  onSelect={() => onChange(swatch.value)}
                >
                  <span
                    className={cn(
                      'grid size-4 place-items-center rounded-full',
                      swatch.token
                        ? 'text-background'
                        : 'border border-dashed border-muted-foreground text-muted-foreground',
                      isSelected && 'ring-2 ring-foreground ring-offset-1 ring-offset-popover'
                    )}
                    style={swatch.token ? { backgroundColor: `var(${swatch.token})` } : undefined}
                  >
                    {isSelected ? (
                      <span aria-hidden className="block size-1.5 rounded-full bg-current" />
                    ) : swatch.token ? null : (
                      <span aria-hidden className="block h-px w-2.5 rotate-45 bg-current" />
                    )}
                  </span>
                </DropdownMenuItem>
              </TooltipTrigger>
              <TooltipContent side="bottom" sideOffset={4}>
                {swatch.label}
              </TooltipContent>
            </Tooltip>
          )
        })}
      </div>
    </div>
  )
}

/** Colour section for tabs whose colour lives only on the unified tab (editor, Pages, plan review, browser). */
export function UnifiedTabColorMenuSection({
  worktreeId,
  unifiedTabId
}: {
  worktreeId: string
  unifiedTabId: string
}): React.JSX.Element {
  const color = useUnifiedTabColor(worktreeId, unifiedTabId)
  const setUnifiedTabColor = useAppStore((s) => s.setUnifiedTabColor)
  return (
    <TabColorMenuSection
      value={color}
      onChange={(next) => setUnifiedTabColor(unifiedTabId, next)}
    />
  )
}
