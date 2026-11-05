import { ArrowLeft, DownloadCloud, Ellipsis, FolderCog, GitBranchPlus, Globe } from 'lucide-react'
import type React from 'react'
import { translate } from '@/i18n/i18n'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { AddToSidebarButton } from './AddToSidebarButton'
import { getSiteCloneSourceStrings } from './site-clone-source-strings'

export function SitesPageHeader({
  narrow,
  backLabel,
  onBack,
  count,
  importing,
  autoAdd,
  onAddToSidebar,
  onAutoAddChange,
  onNewSite,
  onChooseFolders,
  onImport
}: {
  /** Icon-only actions, so the title still fits on a narrow page. */
  narrow: boolean
  backLabel: string
  onBack: () => void
  count: number
  importing: boolean
  autoAdd: boolean
  onAddToSidebar: () => void
  onAutoAddChange: (next: boolean) => void
  onNewSite: () => void
  onChooseFolders: () => void
  onImport: () => void
}): React.JSX.Element {
  return (
    <header className="flex shrink-0 items-center gap-3 border-b border-border py-3 pr-5 pl-3">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              className="shrink-0 text-muted-foreground"
              aria-label={backLabel}
              onClick={onBack}
            >
              <ArrowLeft className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            {backLabel}{' '}
            <kbd className="ml-1 font-sans text-muted-foreground">
              {translate('auto.components.sites.SitesPage.escKey', 'Esc')}
            </kbd>
          </TooltipContent>
        </Tooltip>
        <Globe className="size-4 shrink-0 text-muted-foreground" />
        <span className="text-sm font-medium">
          {translate('auto.components.sites.SitesPage.title', 'Sites')}
        </span>
        <span className="truncate whitespace-nowrap text-xs text-muted-foreground">
          {translate('auto.components.sites.SitesPage.count', '{{count}} configured', {
            count: count
          })}
        </span>
      </div>
      {/* New site leads: it is the action this page exists for. It keeps the filled variant so
          there is still one clear primary; everything after it is outline, which is what makes
          them legible — ghost rendered as bare text with no edge to press. */}
      {/* The dialog itself lives at the App root so a minimized clone survives leaving this
          page; this button only raises the flag. */}
      <Button
        size="sm"
        className={cn('shrink-0 gap-1.5', narrow && 'px-2')}
        aria-label={narrow ? getSiteCloneSourceStrings().trigger : undefined}
        onClick={onNewSite}
      >
        <GitBranchPlus className="size-3.5" />
        {narrow ? null : getSiteCloneSourceStrings().trigger}
      </Button>
      <AddToSidebarButton
        compact={narrow}
        busy={importing}
        autoAdd={autoAdd}
        onAdd={onAddToSidebar}
        onAutoAddChange={onAutoAddChange}
      />
      {/* Why: folder roots and ocsites import are one-time setup, so they share an overflow menu. */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="shrink-0 px-2"
            aria-label={translate(
              'auto.components.sites.SitesPage.moreActions',
              'More site actions'
            )}
          >
            <Ellipsis className="size-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={onChooseFolders}>
            <FolderCog className="size-3.5" />
            {translate('auto.components.sites.SitesPage.foldersMenu', 'Site folders…')}
          </DropdownMenuItem>
          <DropdownMenuItem disabled={importing} onSelect={onImport}>
            <DownloadCloud className="size-3.5" />
            {translate('auto.components.sites.SitesPage.import', 'Import from ocsites')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  )
}
