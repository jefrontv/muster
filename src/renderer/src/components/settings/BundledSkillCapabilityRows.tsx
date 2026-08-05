// One switch per skill shipped in the app bundle.
//
// Split out of AgentCapabilitiesPane so the pane stays about policy and this file stays about
// rendering a list that arrives asynchronously (the manifest and each SKILL.md are read in main).

import type React from 'react'
import type { BundledAgentSkill } from '../../../../shared/bundled-agent-skills'
import { SearchableSetting } from './SearchableSetting'
import { SettingsSwitchRow } from './SettingsFormControls'
import { translate } from '@/i18n/i18n'

type BundledSkillCapabilityRowsProps = {
  /** null while the main process is still reading the bundle. */
  skills: BundledAgentSkill[] | null
  isEnabled: (name: string) => boolean
  onToggle: (name: string, enabled: boolean) => void
}

function autoInstallLabel(skill: BundledAgentSkill): string {
  return skill.autoInstalled
    ? translate(
        'auto.components.settings.BundledSkillCapabilityRows.autoInstalled',
        'Installed automatically at startup.'
      )
    : translate(
        'auto.components.settings.BundledSkillCapabilityRows.installOnDemand',
        'Shipped with Muster; installed only when you ask for it.'
      )
}

export function BundledSkillCapabilityRows({
  skills,
  isEnabled,
  onToggle
}: BundledSkillCapabilityRowsProps): React.JSX.Element {
  if (skills === null) {
    return (
      <p className="text-xs text-muted-foreground">
        {translate(
          'auto.components.settings.BundledSkillCapabilityRows.loading',
          'Reading the bundled skills…'
        )}
      </p>
    )
  }

  if (skills.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        {translate(
          'auto.components.settings.BundledSkillCapabilityRows.empty',
          'This build ships no bundled agent skills.'
        )}
      </p>
    )
  }

  return (
    <div className="divide-y divide-border/50">
      {skills.map((skill) => {
        const description = skill.description
          ? `${skill.description} ${autoInstallLabel(skill)}`
          : autoInstallLabel(skill)
        return (
          <SearchableSetting
            key={skill.name}
            title={skill.name}
            description={description}
            keywords={[skill.name, 'skill', 'agent']}
          >
            <SettingsSwitchRow
              label={skill.name}
              description={description}
              checked={isEnabled(skill.name)}
              onChange={() => onToggle(skill.name, !isEnabled(skill.name))}
            />
          </SearchableSetting>
        )
      })}
    </div>
  )
}
