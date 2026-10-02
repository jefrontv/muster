// Agent access on the ActiveCollab onboarding row: one button that installs the server, adds it to
// every agent on this computer and writes the credential file. Same panel as Settings.

import { ActiveCollabAgentAccessPanel } from '@/components/settings/activecollab-agent-access'
import { useActiveCollabAgentAccess } from '@/components/settings/use-activecollab-agent-access'
import { cn } from '@/lib/utils'

export function OnboardingActiveCollabMcpInstall(props: {
  compact?: boolean
}): React.JSX.Element | null {
  const { compact = false } = props
  const access = useActiveCollabAgentAccess()
  if (!access.checked) {
    return null
  }
  return (
    <div
      className={cn('border-t border-border py-3', compact ? 'px-4' : 'px-5')}
      data-testid="onboarding-activecollab-mcp"
    >
      <ActiveCollabAgentAccessPanel access={access} compact={compact} />
    </div>
  )
}
