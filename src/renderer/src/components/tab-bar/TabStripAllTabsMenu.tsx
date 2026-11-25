import { ChevronDown, FileText, Globe, TerminalSquare } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'

export type TabStripMenuEntry = {
  id: string
  label: string
  type: 'terminal' | 'editor' | 'browser'
  isActive: boolean
}

const TYPE_ICONS = {
  terminal: TerminalSquare,
  editor: FileText,
  browser: Globe
} as const

/** Always mounted so its width never appears or disappears; hidden while every tab fits. */
export function TabStripAllTabsMenu({
  entries,
  hidden,
  onSelect
}: {
  entries: readonly TabStripMenuEntry[]
  hidden: boolean
  onSelect: (id: string) => void
}): React.JSX.Element {
  const label = translate('auto.components.tab.bar.TabStripAllTabsMenu.allTabs', 'All tabs')
  return (
    <DropdownMenu modal={false}>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon-md"
              className={cn('my-auto text-muted-foreground', hidden && 'invisible')}
              style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
              aria-label={label}
              aria-hidden={hidden || undefined}
              tabIndex={hidden ? -1 : undefined}
              data-tab-strip-all-tabs="true"
            >
              <ChevronDown />
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom" sideOffset={6}>
          {label}
        </TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end" sideOffset={6} className="w-72 max-w-[calc(100vw-1rem)]">
        {entries.map((entry) => {
          const Icon = TYPE_ICONS[entry.type]
          return (
            <DropdownMenuItem
              key={entry.id}
              aria-current={entry.isActive ? 'page' : undefined}
              className={cn(entry.isActive && 'bg-accent text-accent-foreground')}
              onSelect={() => onSelect(entry.id)}
            >
              <Icon className="size-3.5 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate">{entry.label}</span>
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
