// Resolves a `project` argument (id, name or path) against Muster's sidebar projects.

import { normalizeRuntimePathForComparison } from '../../../shared/cross-platform-path'
import { SiteMcpToolError } from './site-mcp-arguments'
import type { SiteMcpContext } from './site-mcp-context'

export type McpProject = {
  id: string
  name: string
  path: string
  kind: string
  host: string
  site: { id: string; name: string } | null
}

export const PROJECT_PROPERTY = {
  project: {
    type: 'string',
    description:
      "Project id, name, or path, as list_projects reports it. Omit to use the project containing the agent's working directory."
  }
} as const

export async function listMcpProjects(context: SiteMcpContext): Promise<McpProject[]> {
  return ((await context.readSetup('projects', {})) ?? []) as McpProject[]
}

export async function resolveMcpProject(
  context: SiteMcpContext,
  selector: string
): Promise<McpProject> {
  const projects = await listMcpProjects(context)
  if (selector.length === 0) {
    const cwd = normalizeRuntimePathForComparison(context.cwd)
    // Longest path first, so a nested project wins over its parent folder.
    const containing = projects
      .filter((project) => {
        const path = normalizeRuntimePathForComparison(project.path)
        return cwd === path || cwd.startsWith(`${path}/`)
      })
      .sort((left, right) => right.path.length - left.path.length)[0]
    if (!containing) {
      throw new SiteMcpToolError('No project contains the working directory. Pass `project`.')
    }
    return containing
  }
  const byId = projects.find((project) => project.id === selector)
  if (byId) {
    return byId
  }
  const path = normalizeRuntimePathForComparison(selector)
  const byPath = projects.find(
    (project) => normalizeRuntimePathForComparison(project.path) === path
  )
  if (byPath) {
    return byPath
  }
  const byName = projects.filter((project) => project.name.toLowerCase() === selector.toLowerCase())
  if (byName.length === 1) {
    return byName[0]
  }
  throw new SiteMcpToolError(
    byName.length > 1
      ? `More than one project is named "${selector}". Pass its id or path.`
      : `No project matches "${selector}". Call list_projects to see them.`,
    byName.length > 1
      ? { matches: byName.map((project) => ({ id: project.id, path: project.path })) }
      : {}
  )
}
