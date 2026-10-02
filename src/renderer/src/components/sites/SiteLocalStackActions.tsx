// The Local section's header actions: Start/Stop named for what is available, Restart (live while
// running), and the rarer actions behind ⋯ so they stay out of the common pointer path.

import { Loader2, MoreHorizontal, Play, RotateCw, Square } from 'lucide-react'
import type React from 'react'
import { useState } from 'react'
import type { SiteLocalStack } from '../../../../shared/site-types'
import { translate } from '@/i18n/i18n'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import type { useSiteStackActions } from './use-site-stack-actions'

type StackActions = ReturnType<typeof useSiteStackActions>

const SKELETON = 'animate-pulse rounded-md bg-muted/60'

/** The header buttons at their final size, held while detection is pending. */
export function SiteLocalStackActionsLoading(): React.JSX.Element {
  return (
    <div aria-hidden className="flex items-center gap-2">
      <span className={cn('h-8 w-24', SKELETON)} />
      <span className={cn('h-8 w-24', SKELETON)} />
      <span className={cn('size-8', SKELETON)} />
    </div>
  )
}

export function SiteLocalStackActions({
  sitePath,
  stack,
  running,
  dockerDown,
  servedDomain,
  actions,
  refresh,
  onChangeDomain
}: {
  sitePath: string
  stack: SiteLocalStack
  running: boolean
  dockerDown: boolean
  servedDomain: string
  actions: StackActions
  refresh: () => Promise<void>
  onChangeDomain: () => void
}): React.JSX.Element {
  const { pending, spinning } = actions
  const busy = pending !== ''
  const moreLabel = translate('auto.components.sites.SiteLocalStackCard.more', 'More actions')

  return (
    <>
      {/* Fixed, equal widths: the label swap mid-action never moves ⋯, and Restart holds its place. */}
      <div className="flex items-center gap-2">
        {/* One control, named for the action actually available. */}
        <Button
          size="sm"
          variant="outline"
          className="w-24"
          disabled={busy || dockerDown}
          onClick={() => void actions.startOrStop(running ? 'stop' : 'start')}
        >
          {spinning && (pending === 'start' || pending === 'stop') ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : running ? (
            <Square className="size-3.5" />
          ) : (
            <Play className="size-3.5" />
          )}
          {running
            ? translate('auto.components.sites.SiteLocalStackCard.stop', 'Stop')
            : translate('auto.components.sites.SiteLocalStackCard.start', 'Start')}
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="w-24"
          disabled={busy || !running}
          onClick={() => void actions.restart()}
        >
          {spinning && pending === 'restart' ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <RotateCw className="size-3.5" />
          )}
          {translate('auto.components.sites.SiteLocalStackCard.restart', 'Restart')}
        </Button>
        <DropdownMenu>
          <Tooltip>
            <TooltipTrigger asChild>
              <DropdownMenuTrigger asChild>
                <Button size="icon-sm" variant="outline" disabled={busy} aria-label={moreLabel}>
                  <MoreHorizontal />
                </Button>
              </DropdownMenuTrigger>
            </TooltipTrigger>
            <TooltipContent side="top" sideOffset={4}>
              {moreLabel}
            </TooltipContent>
          </Tooltip>
          <DropdownMenuContent align="end">
            {/* Only Agent Local can move a registered site's domain. */}
            {stack === 'agent-local' ? (
              <DropdownMenuItem onSelect={onChangeDomain}>
                {translate(
                  'auto.components.sites.SiteLocalStackCard.changeDomain',
                  'Change domain'
                )}
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuItem disabled={!servedDomain} onSelect={() => void actions.trust()}>
              {translate(
                'auto.components.sites.SiteLocalStackCard.trustHttps',
                'Trust HTTPS certificate'
              )}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => void refresh()}>
              {translate('auto.components.sites.SiteLocalStackCard.recheck', 'Re-check status')}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => void window.api.shell.openInFileManager(sitePath)}>
              {translate('auto.components.sites.SiteLocalStackCard.revealFolder', 'Reveal folder')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </>
  )
}

/** The Agent Local domain move, opened from ⋯ and shown under the fields. */
export function SiteLocalStackRename({
  servedDomain,
  actions,
  onClose
}: {
  servedDomain: string
  actions: StackActions
  onClose: () => void
}): React.JSX.Element {
  const { pending, spinning } = actions
  const busy = pending !== ''
  const [domain, setDomain] = useState('')
  const target = domain.trim()
  const changed = target.length > 0 && target !== servedDomain

  const rename = async (): Promise<void> => {
    if (await actions.rename(target)) {
      onClose()
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Input
        autoFocus
        className="min-w-0 flex-1"
        value={domain}
        // The served domain, so an empty field reads as "unchanged" rather than "cleared".
        placeholder={servedDomain}
        disabled={busy}
        aria-label={translate('auto.components.sites.SiteLocalStackCard.domain', 'Local domain')}
        onChange={(event) => setDomain(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && changed) {
            void rename()
          } else if (event.key === 'Escape') {
            onClose()
          }
        }}
      />
      <Button className="w-20" disabled={busy || !changed} onClick={() => void rename()}>
        {spinning && pending === 'rename' ? <Loader2 className="animate-spin" /> : null}
        {translate('auto.components.sites.SiteLocalStackCard.apply', 'Apply')}
      </Button>
      <Button variant="ghost" disabled={busy} onClick={onClose}>
        {translate('auto.components.sites.SiteLocalStackCard.cancel', 'Cancel')}
      </Button>
    </div>
  )
}
