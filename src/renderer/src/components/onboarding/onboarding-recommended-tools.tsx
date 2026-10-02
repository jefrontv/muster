// "Recommended tools" on the site tools step: efront's own Extension Hub entries, installed one
// after another from one button. Without this a new staff member finished onboarding never having
// heard of efront Memory or Agent Local.
//
// One at a time because the hub runner refuses a second run while one is going.

import { Check, LoaderCircle } from 'lucide-react'
import { useState } from 'react'
import type { ExtensionInventory } from '../../../../shared/extension-state-types'
import { Button } from '@/components/ui/button'
import { refreshExtensionInventory, useExtensionInventory } from '@/hooks/useExtensionInventory'
import { translate } from '@/i18n/i18n'

/** Which hub entries count as recommended for a new efront machine (decision D5). */
export const RECOMMENDED_EXTENSION_IDS = [
  'efront-memory',
  'agent-local',
  'acf-json-mcp',
  'context7-mcp'
] as const

type InventoryItem = ExtensionInventory['entries'][number]

/** Entries this machine can install: the platform supports it and the access probe allows it. */
export function recommendedExtensions(inventory: ExtensionInventory | null): InventoryItem[] {
  const entries = inventory?.entries ?? []
  return RECOMMENDED_EXTENSION_IDS.flatMap((id) => {
    const item = entries.find(({ entry }) => entry.id === id)
    if (
      !item ||
      item.state.status === 'unsupported-platform' ||
      item.state.status === 'no-access'
    ) {
      return []
    }
    return [item]
  })
}

export function OnboardingRecommendedTools(): React.JSX.Element | null {
  const { inventory } = useExtensionInventory()
  const [running, setRunning] = useState<string | null>(null)
  const [failed, setFailed] = useState<string[]>([])
  const items = recommendedExtensions(inventory)
  if (items.length === 0) {
    return null
  }
  const pending = items.filter(({ state }) => !state.installed)

  const installAll = async (): Promise<void> => {
    setFailed([])
    for (const { entry } of pending) {
      setRunning(entry.id)
      const result = await window.api.extensions.runCommand({ id: entry.id, mode: 'install' })
      if (!result.ok || result.value.code !== 0) {
        setFailed((previous) => [...previous, entry.name])
      }
      await refreshExtensionInventory(false)
    }
    setRunning(null)
  }

  return (
    <div className="space-y-2.5 rounded-xl border border-border bg-muted/20 p-3">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-medium text-foreground">
            {translate('auto.components.onboarding.RecommendedTools.title', 'Recommended tools')}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {translate(
              'auto.components.onboarding.RecommendedTools.description',
              'efront’s own tools for your agents. Each one is in Settings > Extensions afterwards.'
            )}
          </p>
        </div>
        {pending.length > 0 ? (
          <Button
            size="sm"
            className="shrink-0"
            disabled={running !== null}
            onClick={() => void installAll()}
          >
            {running ? <LoaderCircle className="animate-spin" /> : null}
            {running
              ? translate('auto.components.onboarding.RecommendedTools.installing', 'Installing…')
              : translate(
                  'auto.components.onboarding.RecommendedTools.install',
                  'Install recommended'
                )}
          </Button>
        ) : null}
      </div>
      <ul className="space-y-1">
        {items.map(({ entry, state }) => (
          <li key={entry.id} className="flex items-center gap-2 text-xs">
            <span className="flex size-4 shrink-0 items-center justify-center">
              {running === entry.id ? (
                <LoaderCircle className="size-3.5 animate-spin text-muted-foreground" />
              ) : state.installed ? (
                <Check className="size-3.5 text-[var(--status-success)]" />
              ) : (
                <span className="size-1.5 rounded-full bg-muted-foreground/50" />
              )}
            </span>
            <span className="min-w-0 flex-1 truncate text-foreground">{entry.name}</span>
            <span className="shrink-0 text-muted-foreground">
              {state.installed
                ? translate('auto.components.onboarding.RecommendedTools.installed', 'Installed')
                : translate(
                    'auto.components.onboarding.RecommendedTools.not_installed',
                    'Not installed'
                  )}
            </span>
          </li>
        ))}
      </ul>
      {failed.length > 0 ? (
        <p role="alert" className="text-xs break-words text-destructive">
          {translate(
            'auto.components.onboarding.RecommendedTools.failed',
            'Could not install {{names}}. Open Settings > Extensions to see why.'
          ).replace('{{names}}', failed.join(', '))}
        </p>
      ) : null}
    </div>
  )
}
