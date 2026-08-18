// Environment CRUD and branch → environment resolution.
// Ported from ocsites mcp_server.py:2831-2998.
//
// Secrets are keyed on the environment name, so a rename or duplicate must carry them across and a
// delete must drop them — otherwise the next run is blocked on a credential the user still
// believes is stored. The copy goes through the secret store; no password value is read here.

import {
  createEmptySiteEnvironment,
  resolveSiteEnvironment,
  type SiteEnvironment
} from '../../../shared/site-types'
import {
  readBoolean,
  readRequiredString,
  readString,
  resolveMcpSite,
  SiteMcpToolError,
  type ToolArguments
} from './site-mcp-arguments'
import type { SiteMcpContext, SiteMcpTool } from './site-mcp-context'
import { objectSchema, SITE_PROPERTY } from './site-mcp-schemas'
import { buildEnvironmentSummary, buildEnvironmentView, describeResolution } from './site-mcp-views'

const NAME_PROPERTY = {
  name: { type: 'string', description: 'Environment name. Matched against git branch names.' }
} as const

// Shared by create_environment and duplicate_environment, which ocsites defined as the same call.
async function createEnvironment(
  context: SiteMcpContext,
  args: ToolArguments
): Promise<Record<string, unknown>> {
  const site = resolveMcpSite(context, readString(args, 'site'))
  const name = readRequiredString(args, 'name')
  const copyFrom = readString(args, 'copy_from')
  if (Object.hasOwn(site.environments, name)) {
    throw new SiteMcpToolError(`Environment '${name}' already exists.`)
  }
  const source = copyFrom.length > 0 ? site.environments[copyFrom] : null
  if (copyFrom.length > 0 && !source) {
    throw new SiteMcpToolError(`copy_from env '${copyFrom}' does not exist.`, {
      available_environments: Object.keys(site.environments)
    })
  }
  const seed: SiteEnvironment = source ? { ...source } : createEmptySiteEnvironment()
  const updated = await context.updateSite(site.id, {
    environments: { ...site.environments, [name]: seed },
    activeEnvironment: site.activeEnvironment || name
  })
  if (copyFrom.length > 0) {
    context.copyEnvironmentSecrets(site.id, copyFrom, name)
  }
  return {
    created: name,
    copied_from: copyFrom.length > 0 ? copyFrom : null,
    ...buildEnvironmentView(await context.summarize(updated ?? site))
  }
}

export const SITE_MCP_ENV_TOOLS: readonly SiteMcpTool[] = [
  {
    name: 'list_environments',
    description:
      'List every environment for a site with redacted summaries, plus the environment the current git branch resolves to and why. Passwords appear only as set/not-set flags.',
    inputSchema: objectSchema({ ...SITE_PROPERTY }),
    async run(context, args) {
      const site = resolveMcpSite(context, readString(args, 'site'))
      return buildEnvironmentView(await context.summarize(site))
    }
  },
  {
    name: 'create_environment',
    description:
      'Create a new environment for a site. With copy_from, the new environment is seeded from an existing one, including its stored passwords. Does not change which environment a run targets — the branch still decides.',
    inputSchema: objectSchema(
      {
        ...NAME_PROPERTY,
        ...SITE_PROPERTY,
        copy_from: { type: 'string', description: 'Existing environment to seed the new one from.' }
      },
      ['name']
    ),
    run: createEnvironment
  },
  {
    name: 'duplicate_environment',
    description:
      'Duplicate an environment under a new name. Equivalent to create_environment with copy_from.',
    inputSchema: objectSchema(
      {
        source: { type: 'string', description: 'Environment to copy.' },
        new_name: { type: 'string', description: 'Name for the copy.' },
        ...SITE_PROPERTY
      },
      ['source', 'new_name']
    ),
    run(context, args) {
      return createEnvironment(context, {
        site: args.site,
        name: readRequiredString(args, 'new_name'),
        copy_from: readRequiredString(args, 'source')
      })
    }
  },
  {
    name: 'rename_environment',
    description:
      'Rename an environment, carrying its stored passwords across. Branch resolution then looks for the new name, so renaming can change what a deploy targets.',
    inputSchema: objectSchema(
      {
        old_name: { type: 'string', description: 'Current environment name.' },
        new_name: { type: 'string', description: 'New environment name.' },
        ...SITE_PROPERTY
      },
      ['old_name', 'new_name']
    ),
    async run(context, args) {
      const site = resolveMcpSite(context, readString(args, 'site'))
      const from = readRequiredString(args, 'old_name')
      const to = readRequiredString(args, 'new_name')
      if (!Object.hasOwn(site.environments, from)) {
        throw new SiteMcpToolError(`Environment '${from}' does not exist.`, {
          available_environments: Object.keys(site.environments)
        })
      }
      if (from !== to && Object.hasOwn(site.environments, to)) {
        throw new SiteMcpToolError(`Environment '${to}' already exists.`)
      }
      // Rebuilt by iteration rather than delete-then-add so the environment keeps its position.
      const environments: Record<string, SiteEnvironment> = {}
      for (const [name, environment] of Object.entries(site.environments)) {
        environments[name === from ? to : name] = environment
      }
      context.copyEnvironmentSecrets(site.id, from, to)
      if (from !== to) {
        context.deleteEnvironmentSecrets(site.id, from)
      }
      const updated = await context.updateSite(site.id, {
        environments,
        activeEnvironment: site.activeEnvironment === from ? to : site.activeEnvironment
      })
      return {
        renamed: { from, to },
        ...buildEnvironmentView(await context.summarize(updated ?? site))
      }
    }
  },
  {
    name: 'delete_environment',
    description:
      'Delete an environment and its stored passwords. Requires confirm=true, and refuses to delete the last remaining environment.',
    inputSchema: objectSchema(
      {
        ...NAME_PROPERTY,
        ...SITE_PROPERTY,
        confirm: { type: 'boolean', description: 'Must be true. Deleting drops stored passwords.' }
      },
      ['name']
    ),
    async run(context, args) {
      const site = resolveMcpSite(context, readString(args, 'site'))
      const name = readRequiredString(args, 'name')
      const names = Object.keys(site.environments)
      if (!names.includes(name)) {
        throw new SiteMcpToolError(`Environment '${name}' does not exist.`, {
          available_environments: names
        })
      }
      if (names.length <= 1) {
        throw new SiteMcpToolError('Cannot delete the only environment for a site.')
      }
      if (!readBoolean(args, 'confirm')) {
        const summary = await context.summarize(site)
        return {
          ok: false,
          blocked: true,
          needs_confirmation: true,
          error: `Refusing to delete env '${name}' without confirm=true.`,
          would_delete: buildEnvironmentSummary(
            site,
            name,
            summary.secrets[name] ?? { ssh: false, db: false }
          )
        }
      }
      const environments = { ...site.environments }
      delete environments[name]
      context.deleteEnvironmentSecrets(site.id, name)
      const remaining = Object.keys(environments)
      const updated = await context.updateSite(site.id, {
        environments,
        activeEnvironment:
          site.activeEnvironment === name ? (remaining[0] ?? '') : site.activeEnvironment
      })
      return { deleted: name, ...buildEnvironmentView(await context.summarize(updated ?? site)) }
    }
  },
  {
    name: 'get_resolved_environment',
    description:
      'Report which environment run_import_functions / run_deploy_functions would target right now, and the reason for that resolution.',
    inputSchema: objectSchema({ ...SITE_PROPERTY }),
    async run(context, args) {
      const site = resolveMcpSite(context, readString(args, 'site'))
      const summary = await context.summarize(site)
      return {
        ok: true,
        site: site.displayName,
        site_id: site.id,
        current_branch: summary.branch ?? '',
        resolved_environment: summary.resolvedEnvironment.environment,
        resolution_reason: describeResolution(summary.resolvedEnvironment, summary.branch),
        requires_confirmation: summary.resolvedEnvironment.requiresConfirmation,
        available_environments: Object.keys(site.environments)
      }
    }
  },
  {
    name: 'which_env_for_branch',
    description:
      'Predict which environment would resolve if the given branch were checked out. Nothing is checked out — purely a lookup.',
    inputSchema: objectSchema(
      {
        branch_name: { type: 'string', description: 'Hypothetical branch name.' },
        ...SITE_PROPERTY
      },
      ['branch_name']
    ),
    run(context, args) {
      const site = resolveMcpSite(context, readString(args, 'site'))
      const branch = readRequiredString(args, 'branch_name')
      const resolution = resolveSiteEnvironment(site, branch)
      return Promise.resolve({
        ok: true,
        site: site.displayName,
        site_id: site.id,
        branch_name: branch,
        resolved_environment: resolution.environment,
        resolution_reason: describeResolution(resolution, branch),
        requires_confirmation: resolution.requiresConfirmation,
        available_environments: Object.keys(site.environments)
      })
    }
  }
]
