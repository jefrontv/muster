// Project writes for agents: add, rename, re-icon, remove from the sidebar, and create workspaces.
// Each one shows an approval card in Muster and runs in the GUI once approved.

import { isAbsolute } from 'node:path'
import type { SiteSetupApprovalDetail } from '../../../shared/site-setup-approval-types'
import { readString, SiteMcpToolError } from './site-mcp-arguments'
import { stageSetupWrite } from './site-mcp-approval-tools'
import type { SiteMcpContext, SiteMcpTool } from './site-mcp-context'
import { PROJECT_PROPERTY, resolveMcpProject, type McpProject } from './site-mcp-project-resolve'
import { objectSchema } from './site-mcp-schemas'

export function cardDetails(rows: [string, string][]): SiteSetupApprovalDetail[] {
  return rows.filter(([, value]) => value.length > 0).map(([label, value]) => ({ label, value }))
}

/** Approve-for-this-project covers later project changes, keyed apart from site ids. */
function projectScope(project: McpProject): { siteId: string; siteName: string } {
  return { siteId: `project:${project.id}`, siteName: project.name }
}

/** The live domain of the project's site, for "use the site's favicon". */
function siteFaviconDomain(context: SiteMcpContext, project: McpProject): string {
  const site = project.site ? context.store.getSite(project.site.id) : null
  if (!site) {
    throw new SiteMcpToolError(
      'This project has no linked site to take a favicon from. Pass favicon_domain instead.'
    )
  }
  const environments = [
    site.environments[site.activeEnvironment],
    ...Object.values(site.environments)
  ]
  const domain = environments.find((environment) => environment?.liveDomain)?.liveDomain ?? ''
  if (!domain) {
    throw new SiteMcpToolError(`${site.displayName} has no live domain set. Pass favicon_domain.`)
  }
  return domain
}

export const SITE_MCP_PROJECT_WRITE_TOOLS: readonly SiteMcpTool[] = [
  {
    name: 'create_project',
    description:
      "Add a project to Muster's Code sidebar: clone `clone_url` into `parent_dir` (default: the primary site root from discover_site_folders), or add an existing folder at `path`. The user approves it in Muster first; the result says how to collect the approval. An approved clone returns a `job_id` straight away: poll get_setup_job until it succeeds (its result is the new project) and tell the user the progress.",
    inputSchema: objectSchema({
      clone_url: {
        type: 'string',
        description: 'Git URL to clone (list_clone_sources gives these).'
      },
      parent_dir: { type: 'string', description: 'Absolute folder to clone into.' },
      path: {
        type: 'string',
        description: 'Absolute path of an existing folder or checkout to add.'
      },
      kind: {
        type: 'string',
        enum: ['git', 'folder', 'auto'],
        description: 'For `path`. Default auto.'
      }
    }),
    requiresSiteSetup: true,
    async run(context, args) {
      const cloneUrl = readString(args, 'clone_url')
      const path = readString(args, 'path')
      if (Boolean(cloneUrl) === Boolean(path)) {
        throw new SiteMcpToolError('Pass exactly one of `clone_url` or `path`.')
      }
      const parentDir = readString(args, 'parent_dir')
      for (const [key, value] of [
        ['path', path],
        ['parent_dir', parentDir]
      ] as const) {
        if (value && !isAbsolute(value)) {
          throw new SiteMcpToolError(`${key} must be an absolute path.`)
        }
      }
      return stageSetupWrite(
        context,
        {
          action: 'create_project',
          title: cloneUrl ? 'Clone a project' : 'Add a project',
          summary: cloneUrl
            ? 'Clone this repository and add it to the Code sidebar.'
            : 'Add this folder to the Code sidebar. Nothing in it is changed.',
          details: cardDetails([
            ['Clone from', cloneUrl],
            ['Into', cloneUrl ? parentDir || 'Primary site root' : ''],
            ['Folder', path],
            ['Kind', path ? readString(args, 'kind') || 'auto' : '']
          ]),
          siteId: null,
          siteName: null
        },
        async (approvalId) => {
          const written = (await context.writeSetup('create-project', approvalId, {
            cloneUrl,
            parentDir,
            path,
            kind: readString(args, 'kind')
          })) as Record<string, unknown>
          return written?.job_id
            ? {
                ...written,
                next_step: 'Poll get_setup_job with this job_id until it succeeds or fails.'
              }
            : written
        }
      )
    }
  },
  {
    name: 'update_project',
    description:
      "Rename a sidebar project and/or set its icon to a website's favicon. `use_site_favicon` takes the favicon from the linked site's live domain. The user approves it in Muster first.",
    inputSchema: objectSchema({
      ...PROJECT_PROPERTY,
      name: { type: 'string', description: 'New display name.' },
      favicon_domain: {
        type: 'string',
        description: 'Website to take the favicon from, e.g. acme.com.'
      },
      use_site_favicon: {
        type: 'boolean',
        description: "Use the linked site's live domain favicon."
      }
    }),
    requiresSiteSetup: true,
    async run(context, args) {
      const project = await resolveMcpProject(context, readString(args, 'project'))
      const name = readString(args, 'name')
      const explicitDomain = readString(args, 'favicon_domain')
      const useSite = args.use_site_favicon === true
      if (explicitDomain && useSite) {
        throw new SiteMcpToolError('Pass favicon_domain or use_site_favicon, not both.')
      }
      const faviconDomain = useSite ? siteFaviconDomain(context, project) : explicitDomain
      if (!name && !faviconDomain) {
        throw new SiteMcpToolError(
          'Nothing to change: pass `name`, `favicon_domain` or `use_site_favicon`.'
        )
      }
      return stageSetupWrite(
        context,
        {
          action: 'update_project',
          title: `Update ${project.name}`,
          summary: 'Change how this project shows in the Code sidebar.',
          details: cardDetails([
            ['Name', name ? `${project.name} → ${name}` : ''],
            ['Icon', faviconDomain ? `Favicon from ${faviconDomain}` : '']
          ]),
          ...projectScope(project)
        },
        (approvalId) =>
          context.writeSetup('update-project', approvalId, {
            repo: project.id,
            name,
            faviconDomain
          })
      )
    }
  },
  {
    name: 'remove_project',
    description:
      'Take a project out of the Code sidebar. Files on disk are never deleted. The user approves it in Muster first.',
    inputSchema: objectSchema({ ...PROJECT_PROPERTY }),
    requiresSiteSetup: true,
    async run(context, args) {
      const project = await resolveMcpProject(context, readString(args, 'project'))
      return stageSetupWrite(
        context,
        {
          action: 'remove_project',
          title: `Remove ${project.name} from the sidebar`,
          summary: 'The project leaves the Code sidebar. Its files stay on disk.',
          details: cardDetails([['Folder', project.path]]),
          // A removal always gets its own card, even for an approved project.
          siteId: null,
          siteName: null
        },
        (approvalId) => context.writeSetup('remove-project', approvalId, { repo: project.id })
      )
    }
  },
  {
    name: 'create_worktree',
    description:
      'Create a new git worktree workspace for a project, on a new branch. It does not take focus in Muster. The user approves it in Muster; "Approve for <project>" covers later ones.',
    inputSchema: objectSchema(
      {
        ...PROJECT_PROPERTY,
        name: { type: 'string', description: 'Workspace name; the branch is derived from it.' },
        base_branch: {
          type: 'string',
          description: "Branch to start from. Default: the project's base."
        }
      },
      ['name']
    ),
    requiresSiteSetup: true,
    async run(context, args) {
      const project = await resolveMcpProject(context, readString(args, 'project'))
      if (project.kind === 'folder') {
        throw new SiteMcpToolError(`${project.name} is a folder project, not a git repository.`)
      }
      const name = readString(args, 'name')
      if (!name) {
        throw new SiteMcpToolError('`name` is required.')
      }
      const baseBranch = readString(args, 'base_branch')
      return stageSetupWrite(
        context,
        {
          action: 'create_worktree',
          title: `New workspace in ${project.name}`,
          summary: 'Create a git worktree on a new branch.',
          details: cardDetails([
            ['Name', name],
            ['From', baseBranch || 'Project base branch']
          ]),
          ...projectScope(project)
        },
        (approvalId) =>
          context.writeSetup('create-worktree', approvalId, { repo: project.id, name, baseBranch })
      )
    }
  }
]
