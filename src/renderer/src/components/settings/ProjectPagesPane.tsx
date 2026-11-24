// Settings → Pages: the feature switch and every Pages option.
import type React from 'react'
import { toast } from 'sonner'
import { isSitesMcpExposedToAgents } from '../../../../shared/agent-capabilities'
import type { GlobalSettings } from '../../../../shared/types'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import { Button } from '../ui/button'
import { getProjectPagesPaneSearchEntries } from './project-pages-settings-search'
import { ProjectPagesAgentAccessSection } from './ProjectPagesAgentAccessSection'
import { SearchableSetting } from './SearchableSetting'
import { SettingsRow, SettingsSegmentedControl, SettingsSwitchRow } from './SettingsFormControls'

type Props = {
  settings: GlobalSettings
  updateSettings: (updates: Partial<GlobalSettings>) => void
}

/** Turning Pages off also closes what is showing it, so nothing points at a hidden feature. */
function closeOpenPages(): void {
  const state = useAppStore.getState()
  if (state.activeView === 'pages') {
    state.closePagesPage()
  }
  for (const file of state.openFiles) {
    if (file.mode === 'project-pages') {
      state.closeFile(file.id)
    }
  }
}

export function ProjectPagesPane({ settings, updateSettings }: Props): React.JSX.Element {
  const entries = getProjectPagesPaneSearchEntries()
  const enabled = settings.experimentalProjectPages === true
  const openIn = settings.projectPagesOpenIn ?? 'tab'
  const agentDots = settings.projectPagesAgentChangeDots !== false
  const outline = settings.projectPagesOutline !== false

  return (
    <div className="space-y-2">
      <SearchableSetting {...entries.enabled} id="pages-enabled">
        <SettingsSwitchRow
          label={entries.enabled.title}
          description={entries.enabled.description}
          checked={enabled}
          onChange={() => {
            if (enabled) {
              closeOpenPages()
            }
            updateSettings({ experimentalProjectPages: !enabled })
          }}
        />
      </SearchableSetting>
      {enabled ? (
        <>
          <SearchableSetting {...entries.openIn} id="pages-open-in">
            <SettingsRow
              label={entries.openIn.title}
              description={entries.openIn.description}
              control={
                <SettingsSegmentedControl
                  size="sm"
                  ariaLabel={entries.openIn.title}
                  value={openIn}
                  onChange={(value) => updateSettings({ projectPagesOpenIn: value })}
                  options={[
                    {
                      value: 'tab',
                      label: translate('auto.components.settings.pages.openIn.tab', 'Project tab')
                    },
                    {
                      value: 'page',
                      label: translate('auto.components.settings.pages.openIn.page', 'Pages view')
                    }
                  ]}
                />
              }
            />
          </SearchableSetting>
          <SearchableSetting {...entries.agentDots} id="pages-agent-dots">
            <SettingsSwitchRow
              label={entries.agentDots.title}
              description={entries.agentDots.description}
              checked={agentDots}
              onChange={() => updateSettings({ projectPagesAgentChangeDots: !agentDots })}
            />
          </SearchableSetting>
          <SearchableSetting {...entries.outline} id="pages-outline">
            <SettingsSwitchRow
              label={entries.outline.title}
              description={entries.outline.description}
              checked={outline}
              onChange={() => updateSettings({ projectPagesOutline: !outline })}
            />
          </SearchableSetting>
          <SearchableSetting {...entries.intro} id="pages-intro">
            <SettingsRow
              label={entries.intro.title}
              description={entries.intro.description}
              control={
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    void window.api.ui
                      .set({ pagesIntroSeen: false })
                      .then(() =>
                        toast.success(
                          translate(
                            'auto.components.settings.pages.intro.done',
                            'The Pages introduction will show next time Muster starts.'
                          )
                        )
                      )
                  }
                >
                  {translate('auto.components.settings.pages.intro.button', 'Show again')}
                </Button>
              }
            />
          </SearchableSetting>
          <ProjectPagesAgentAccessSection
            settings={settings}
            updateSettings={updateSettings}
            sitesMcpEnabled={isSitesMcpExposedToAgents(settings)}
          />
        </>
      ) : null}
    </div>
  )
}
