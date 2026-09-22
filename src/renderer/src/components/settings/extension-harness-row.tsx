// One harness's registration for one extension, on one line.
//
// Three harnesses per MCP means this row repeats three times inside every card, so it has to stay
// quiet: a name, a state, the file it lives in, and an action only when there is something to do.
// The earlier version gave each harness its own bordered block with two always-visible buttons,
// which turned a four-extension list into a wall.

import { LoaderCircle, MoreHorizontal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import type { ExtensionHarnessState } from '../../../../shared/extension-state-types'
import { describeExtensionHarness } from '../extensions/extension-status-presentation'
import { shortenExtensionConfigPath } from '../extensions/extension-config-path'

const DOT_TONE = {
  connected: 'bg-emerald-500',
  attention: 'bg-amber-500',
  neutral: 'bg-muted-foreground/50'
} as const

export function ExtensionHarnessRow({
  harness,
  busy,
  onInstall,
  onUninstall
}: {
  harness: ExtensionHarnessState
  busy: boolean
  onInstall: () => void
  onUninstall: () => void
}): React.JSX.Element {
  const copy = describeExtensionHarness(harness)
  const needsAction = copy.kind !== 'current'

  return (
    <div
      className="flex items-center gap-3 px-3 py-2 text-xs"
      data-harness-id={harness.id}
      data-harness-state={copy.kind}
    >
      <span className={cn('size-1.5 shrink-0 rounded-full', DOT_TONE[copy.tone])} />
      <span className="w-24 shrink-0 truncate font-medium text-foreground">{harness.label}</span>
      <span
        className={cn(
          'min-w-0 flex-1 truncate font-mono text-[11px]',
          harness.error ? 'text-destructive' : 'text-muted-foreground/70'
        )}
        title={harness.error ?? harness.configPath}
      >
        {harness.error ?? shortenExtensionConfigPath(harness.configPath)}
      </span>
      <span className="shrink-0 text-muted-foreground">{copy.label}</span>

      {needsAction ? (
        <Button variant="outline" size="xs" disabled={busy} onClick={onInstall}>
          {busy ? <LoaderCircle className="animate-spin" /> : null}
          {copy.actionLabel}
        </Button>
      ) : null}

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon-xs"
            className="shrink-0"
            aria-label={translate(
              'auto.components.extensions.harness_more',
              'More actions for {{harness}}'
            ).replace('{{harness}}', harness.label)}
          >
            <MoreHorizontal className="size-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem disabled={busy} onSelect={onInstall}>
            {translate('auto.components.extensions.harness_rewrite', 'Rewrite entry')}
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={busy || !harness.configured}
            variant="destructive"
            onSelect={onUninstall}
          >
            {translate('auto.components.extensions.harness_remove', 'Remove entry')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
