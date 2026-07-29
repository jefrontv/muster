import { useCallback, useMemo } from 'react'
import { toast } from 'sonner'

import { useAppStore } from '@/store'
import { translate } from '@/i18n/i18n'
import { resolveActiveCollabSiteBinding } from '@/lib/activecollab-site-binding'
import type { ActiveCollabSiteBinding } from '@/lib/activecollab-site-binding'
import type { ActiveCollabTask } from '../../../shared/activecollab-types'
import { buildActiveCollabWorkspaceRequest } from './activecollab-start-work'

/**
 * The one place that turns "start work on this task" into a workspace.
 *
 * Shared by the task row and the detail pane deliberately: two call sites for one behaviour is how
 * surfaces end up with subtly different rules about when the control is available.
 */
export function useActiveCollabStartWork(projectId: number): {
  binding: ActiveCollabSiteBinding
  startWork: (task: ActiveCollabTask) => void
} {
  // Read defensively: these surfaces mount against partial store stand-ins in several suites, and
  // a bare read of an absent slice would fail the whole list rather than disable one control.
  const sites = useAppStore((s) => s.sites)
  const bindings = useAppStore((s) => s.settings?.activeCollabProjectSites)
  const instanceUrl = useAppStore((s) => s.activeCollabStatus?.connection?.instanceUrl ?? null)
  const openModal = useAppStore((s) => s.openModal)
  const linkSiteRepos = useAppStore((s) => s.linkSiteRepos)

  const binding = useMemo(
    () =>
      resolveActiveCollabSiteBinding({
        bindings: bindings ?? {},
        sites: sites ?? [],
        instanceUrl,
        projectId
      }),
    [bindings, instanceUrl, projectId, sites]
  )

  const startWork = useCallback(
    (task: ActiveCollabTask) => {
      if (binding.kind === 'unbound' || binding.kind === 'missing-site') {
        toast.error(
          translate(
            'auto.components.activecollab.start_work.unbound',
            'Link {{value0}} to a site first — use the link button on the project heading.',
            { value0: task.projectName }
          )
        )
        return
      }
      if (binding.kind === 'needs-repo') {
        // A site is only a folder until it is opened as a repo, and a worktree needs a repo. Offer
        // the recovery instead of a dead end, then continue once it lands.
        void (async () => {
          const result = await linkSiteRepos?.()
          if (!result || 'error' in result) {
            toast.error(
              translate(
                'auto.components.activecollab.start_work.open_failed',
                'Could not open {{value0}} as a repository.',
                { value0: binding.site.displayName }
              )
            )
            return
          }
          const next = resolveActiveCollabSiteBinding({
            bindings: useAppStore.getState().settings?.activeCollabProjectSites ?? {},
            sites: useAppStore.getState().sites ?? [],
            instanceUrl,
            projectId
          })
          if (next.kind !== 'ready') {
            toast.error(
              translate(
                'auto.components.activecollab.start_work.still_no_repo',
                '{{value0}} is not a git repository, so it cannot hold a workspace.',
                { value0: binding.site.displayName }
              )
            )
            return
          }
          openModal?.(
            'new-workspace-composer',
            buildActiveCollabWorkspaceRequest({ binding: next, task, instanceUrl })
          )
        })()
        return
      }
      openModal?.(
        'new-workspace-composer',
        buildActiveCollabWorkspaceRequest({ binding, task, instanceUrl })
      )
    },
    [binding, instanceUrl, linkSiteRepos, openModal, projectId]
  )

  return { binding, startWork }
}
