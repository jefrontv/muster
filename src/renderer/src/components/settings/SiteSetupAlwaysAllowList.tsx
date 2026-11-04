// Settings → Agent Capabilities: the setup actions the user ticked "Always allow" for on an
// approval card. Granting happens only on the card; this list only takes grants away.

import type React from 'react'
import { Trash2 } from 'lucide-react'
import type { GlobalSettings } from '../../../../shared/types'
import { normalizeSiteSetupAlwaysAllow } from '../../../../shared/site-setup-always-allow'
import { translate } from '@/i18n/i18n'
import { Button } from '@/components/ui/button'
import { siteSetupActionLabel } from '../sites/site-setup-action-labels'

export function SiteSetupAlwaysAllowList({
  settings,
  updateSettings,
  title,
  description
}: {
  settings: GlobalSettings
  updateSettings: (updates: Partial<GlobalSettings>) => void
  title: string
  description: string
}): React.JSX.Element {
  const grants = normalizeSiteSetupAlwaysAllow(settings.siteSetupAlwaysAllow)
  return (
    <div className="space-y-2">
      <div className="space-y-0.5">
        <p className="text-sm font-medium">{title}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      {grants.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          {translate(
            'auto.components.settings.AgentCapabilities.alwaysAllowEmpty',
            'Every setup change asks first.'
          )}
        </p>
      ) : (
        <ul className="divide-y divide-border/60 rounded-xl border border-border/60">
          {grants.map((action) => (
            <li key={action} className="flex items-center gap-3 py-1.5 pr-1.5 pl-3">
              <span className="min-w-0 flex-1 truncate text-[13px]">
                {siteSetupActionLabel(action)}
              </span>
              <Button
                variant="ghost"
                size="icon-xs"
                className="text-muted-foreground hover:text-destructive"
                aria-label={translate(
                  'auto.components.settings.AgentCapabilities.alwaysAllowRemove',
                  'Ask again for {{value0}}',
                  { value0: siteSetupActionLabel(action) }
                )}
                onClick={() =>
                  updateSettings({
                    siteSetupAlwaysAllow: grants.filter((granted) => granted !== action)
                  })
                }
              >
                <Trash2 />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
