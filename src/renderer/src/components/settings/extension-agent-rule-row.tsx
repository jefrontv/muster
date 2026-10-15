import { useState } from 'react'
import { toast } from 'sonner'
import { translate } from '@/i18n/i18n'
import { publishExtensionInventory } from '@/hooks/useExtensionInventory'
import type { ExtensionEntry } from '../../../../shared/extension-catalog-types'
import { SettingsSwitch } from './SettingsFormControls'

export function ExtensionAgentRuleRow({
  entry,
  active
}: {
  entry: ExtensionEntry & { agentRule: NonNullable<ExtensionEntry['agentRule']> }
  active: boolean
}): React.JSX.Element {
  const [busy, setBusy] = useState(false)
  const label = translate('auto.components.extensions.agent_rule', 'Add to agent rules')

  const toggle = async (): Promise<void> => {
    setBusy(true)
    try {
      const result = await window.api.extensions.setAgentRule({ id: entry.id, enabled: !active })
      if (result.ok) {
        publishExtensionInventory(result.value)
      } else {
        toast.error(result.error)
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-1.5 border-t border-border pt-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-muted-foreground">{label}</span>
        <SettingsSwitch
          checked={active}
          disabled={busy}
          ariaLabel={`${label} — ${entry.name}`}
          onChange={() => void toggle()}
        />
      </div>
      <p className="text-xs text-muted-foreground/70">
        {translate(
          'auto.components.extensions.agent_rule_hint',
          'Keeps this in your global CLAUDE.md and AGENTS.md:'
        )}
      </p>
      <p className="rounded-md bg-muted px-2 py-1.5 font-mono text-xs break-words text-muted-foreground">
        {entry.agentRule.text ?? entry.agentRule.file}
      </p>
    </div>
  )
}
