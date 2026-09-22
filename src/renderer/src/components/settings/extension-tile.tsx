// One extension in the grid: enough to decide whether to open it, and nothing else.
//
// Everything that used to be stacked inline — harness rows, config paths, switches — moved into the
// detail dialog. A grid of four identical tiles reads at a glance; four expanded cards did not.

import { BookOpen, Package, Server } from 'lucide-react'
import { IntegrationStatusPill } from '@/components/integration-status-pill'
import { cn } from '@/lib/utils'
import type { ExtensionKind } from '../../../../shared/extension-catalog-types'
import type { ExtensionInventoryEntry } from '../../../../shared/extension-state-types'
import { describeExtensionStatus } from '../extensions/extension-status-presentation'

const KIND_ICONS: Record<ExtensionKind, React.ComponentType<{ className?: string }>> = {
  skill: BookOpen,
  mcp: Server,
  app: Package
}

export function ExtensionTile({
  item,
  onOpen
}: {
  item: ExtensionInventoryEntry
  onOpen: () => void
}): React.JSX.Element {
  const { entry, state } = item
  const status = describeExtensionStatus(state.status)
  const Icon = KIND_ICONS[entry.kind]
  const dimmed = state.status === 'unsupported-platform' || state.status === 'no-access'

  return (
    <button
      type="button"
      onClick={onOpen}
      data-extension-id={entry.id}
      data-extension-status={state.status}
      className={cn(
        'group flex h-full flex-col gap-2 rounded-xl border border-border bg-card p-3.5 text-left shadow-xs transition-colors',
        'hover:bg-accent focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
        dimmed && 'opacity-60'
      )}
    >
      <div className="flex items-start gap-2.5">
        <span className="mt-0.5 shrink-0 text-muted-foreground">
          <Icon className="size-4" />
        </span>
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{entry.name}</span>
      </div>

      <p className="line-clamp-2 min-h-8 text-xs leading-4 text-muted-foreground">
        {entry.description}
      </p>

      <div className="mt-auto flex items-center justify-between gap-2 pt-0.5">
        <IntegrationStatusPill
          tone={status.tone === 'connected' ? 'connected' : status.tone === 'attention' ? 'attention' : 'neutral'}
        >
          {status.label}
        </IntegrationStatusPill>
        {state.installedVersion ? (
          <span className="shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground/70">
            {state.installedVersion}
          </span>
        ) : null}
      </div>
    </button>
  )
}
