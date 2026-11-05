import type { JSX } from 'react'
import { Switch } from '@/components/ui/switch'

type AiCommitPrSettingsSwitchProps = {
  checked: boolean
  label: string
  onToggle: () => void
}

export function AiCommitPrSettingsSwitch({
  checked,
  label,
  onToggle
}: AiCommitPrSettingsSwitchProps): JSX.Element {
  return <Switch checked={checked} aria-label={label} onClick={onToggle} className="shrink-0" />
}
