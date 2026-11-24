import type { GlobalSettings } from '../../../../shared/types'
import { translate } from '@/i18n/i18n'
import { Label } from '../ui/label'
import { SearchableSetting } from './SearchableSetting'
import { SettingsSwitch } from './SettingsFormControls'

export function ProjectPagesExperimentalSetting({
  settings,
  updateSettings
}: {
  settings: GlobalSettings
  updateSettings: (updates: Partial<GlobalSettings>) => void
}): React.JSX.Element {
  const enabled = settings.experimentalProjectPages === true
  const title = translate('auto.components.settings.ExperimentalPane.pages.title', 'Pages')
  return (
    <SearchableSetting
      title={title}
      description={translate(
        'auto.components.settings.ExperimentalPane.pages.description',
        'Notion-like pages for each project that you and your agents can read and edit.'
      )}
      keywords={['pages', 'notes', 'docs', 'wiki', 'notion']}
      className="space-y-3 py-2"
      id="experimental-pages"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 shrink space-y-0.5">
          <Label>{title}</Label>
          <p className="text-xs text-muted-foreground">
            {translate(
              'auto.components.settings.ExperimentalPane.pages.copy',
              'Adds Pages to the sidebar under Sites. Each project gets its own nested pages.'
            )}
          </p>
        </div>
        <SettingsSwitch
          checked={enabled}
          ariaLabel={translate(
            'auto.components.settings.ExperimentalPane.pages.toggleLabel',
            'Toggle Pages'
          )}
          onChange={() => updateSettings({ experimentalProjectPages: !enabled })}
        />
      </div>
    </SearchableSetting>
  )
}
