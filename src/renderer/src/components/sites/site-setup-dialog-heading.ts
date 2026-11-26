import type { CloneSourceRepo } from '../../../../shared/site-clone-source-types'
import type { SetupRunStep } from './site-setup-choices'
import { getSiteSetupDialogStrings } from './site-setup-dialog-strings'
import type { SiteSetupRequest } from './SiteSetupDialog'

export type SiteSetupScreen = 'source' | 'review' | 'running' | 'done'

/** The dialog's title and description line for each screen. */
export function siteSetupDialogHeading({
  screen,
  label,
  request,
  repo,
  steps
}: {
  screen: SiteSetupScreen
  label: string
  request: SiteSetupRequest
  repo: CloneSourceRepo | null
  steps: SetupRunStep[]
}): { title: string; description: string | null } {
  const strings = getSiteSetupDialogStrings()
  const title =
    screen === 'source'
      ? strings.sourceTitle
      : screen === 'review'
        ? strings.reviewTitle.replace('{{label}}', label)
        : screen === 'running'
          ? strings.runningTitle.replace('{{label}}', label)
          : steps.some((step) => step.state === 'failed')
            ? strings.finishedWithProblemsTitle.replace('{{label}}', label)
            : strings.doneTitle.replace('{{label}}', label)
  const description =
    screen === 'source'
      ? strings.sourceDescription
      : screen === 'review'
        ? request.agent
          ? strings.reviewAgentDescription.replace(
              '{{agent}}',
              request.agent.name ?? strings.anAgent
            )
          : request.kind === 'repo'
            ? strings.reviewRepoDescription.replace('{{repo}}', repo?.fullName ?? '')
            : request.kind === 'link'
              ? strings.reviewLinkDescription
              : strings.reviewSiteDescription
        : null
  return { title, description }
}
