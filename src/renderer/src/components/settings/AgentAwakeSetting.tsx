import type { GlobalSettings } from '../../../../shared/types'
import { Label } from '../ui/label'
import {
  getAgentAwakeDescription,
  getAgentAwakeSearchKeywords,
  getAgentAwakeTitle
} from './agent-awake-copy'
import { SearchableSetting } from './SearchableSetting'
import { Switch } from '@/components/ui/switch'

type AgentAwakeSettingProps = {
  settings: GlobalSettings
  updateSettings: (updates: Partial<GlobalSettings>) => void
}

export function AgentAwakeSetting({
  settings,
  updateSettings
}: AgentAwakeSettingProps): React.JSX.Element {
  const title = getAgentAwakeTitle()
  const description = getAgentAwakeDescription()

  return (
    <section className="space-y-3">
      <SearchableSetting
        title={title}
        description={description}
        keywords={getAgentAwakeSearchKeywords()}
      >
        <div className="flex items-start justify-between gap-4 py-2">
          <div className="min-w-0 flex-1 space-y-0.5">
            <Label>{title}</Label>
            <p className="text-xs text-muted-foreground">{description}</p>
          </div>
          <Switch
            checked={settings.keepComputerAwakeWhileAgentsRun}
            aria-label={title}
            onClick={() =>
              updateSettings({
                keepComputerAwakeWhileAgentsRun: !settings.keepComputerAwakeWhileAgentsRun
              })
            }
          />
        </div>
      </SearchableSetting>
    </section>
  )
}
