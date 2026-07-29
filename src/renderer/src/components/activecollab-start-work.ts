// Turning an ActiveCollab task into a workspace request.
//
// Split from the buttons that trigger it so the row and the detail pane cannot drift: two call
// sites for one behaviour is exactly how surfaces grow their own subtly different copies.

import { LOCAL_EXECUTION_HOST_ID } from '../../../shared/execution-host'
import type { ActiveCollabTask } from '../../../shared/activecollab-types'
import type { TaskSourceContext } from '../../../shared/task-source-context'
import { getLinkedWorkItemWorkspaceName } from '../../../shared/workspace-name'
import type { LinkedWorkItemSummary } from '@/lib/new-workspace'
import type { ActiveCollabSiteBinding } from '@/lib/activecollab-site-binding'

/**
 * ActiveCollab stores a task's path relative to its instance (`/projects/5937/tasks/509749`), so a
 * permalink only exists once an instance is known. Answering null keeps a relative path — which is
 * not a link — from being handed to an agent as though it were one.
 */
export function buildActiveCollabTaskPermalink(
  instanceUrl: string | null | undefined,
  urlPath: string
): string | null {
  const instance = (instanceUrl ?? '').trim().replace(/\/+$/, '')
  if (!instance) {
    return null
  }
  const path = urlPath.startsWith('/') ? urlPath : `/${urlPath}`
  return `${instance}${path}`
}

export type ActiveCollabWorkspaceRequest = {
  prefilledName: string
  initialRepoId: string
  linkedWorkItem: LinkedWorkItemSummary
  taskSourceContext: TaskSourceContext
  telemetrySource: 'activecollab-task'
}

export function buildActiveCollabWorkspaceRequest(args: {
  binding: Extract<ActiveCollabSiteBinding, { kind: 'ready' }>
  task: ActiveCollabTask
  instanceUrl: string | null | undefined
}): ActiveCollabWorkspaceRequest {
  const permalink = buildActiveCollabTaskPermalink(args.instanceUrl, args.task.urlPath)
  const linkedWorkItem: LinkedWorkItemSummary = {
    provider: 'activecollab',
    type: 'issue',
    number: args.task.id,
    title: args.task.name,
    // Empty rather than the relative path: a half-formed URL would reach the agent's draft.
    url: permalink ?? '',
    /** Task numbers repeat across projects, so identity is the pair. */
    activeCollabIdentifier: `${args.task.projectId}/${args.task.id}`,
    repoId: args.binding.repoId,
    projectName: args.task.projectName
  }
  const intentName = getLinkedWorkItemWorkspaceName({
    type: 'issue',
    number: args.task.id,
    title: args.task.name,
    provider: 'activecollab',
    activeCollabIdentifier: linkedWorkItem.activeCollabIdentifier
  })
  return {
    // Falling back to the raw name keeps a workspace nameable even when the title slugs to nothing.
    prefilledName: intentName?.displayName || args.task.name,
    initialRepoId: args.binding.repoId,
    linkedWorkItem,
    taskSourceContext: {
      kind: 'task-source',
      provider: 'activecollab',
      projectId: String(args.task.projectId),
      hostId: LOCAL_EXECUTION_HOST_ID,
      repoId: args.binding.repoId,
      providerIdentity: {
        provider: 'activecollab',
        instanceUrl: args.instanceUrl ?? null,
        projectId: String(args.task.projectId),
        projectName: args.task.projectName
      }
    },
    telemetrySource: 'activecollab-task'
  }
}
