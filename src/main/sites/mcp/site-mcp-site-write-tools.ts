// Site writes for agents: register a checkout as a site, configure it in one approved batch, and
// add a site root folder. Each shows an approval card in Muster first.

import { isAbsolute } from 'node:path'
import { readString, resolveMcpSite, SiteMcpToolError } from './site-mcp-arguments'
import { stageSetupWrite } from './site-mcp-approval-tools'
import { collectToggleUpdates, SITE_MCP_CONFIG_TOOLS } from './site-mcp-config-tools'
import type { SiteMcpContext, SiteMcpTool } from './site-mcp-context'
import { SITE_MCP_ENV_TOOLS } from './site-mcp-env-tools'
import { buildFieldPatches } from './site-mcp-fields'
import { cardDetails } from './site-mcp-project-write-tools'
import { PROJECT_PROPERTY, resolveMcpProject } from './site-mcp-project-resolve'
import { objectSchema, SITE_PROPERTY } from './site-mcp-schemas'

type EnvironmentPlan = {
  name: string
  copyFrom: string
  fields: Record<string, unknown>
  toggles: Record<string, unknown>
}

const MAX_ENVIRONMENTS = 12

function tool(tools: readonly SiteMcpTool[], name: string): SiteMcpTool {
  const found = tools.find((candidate) => candidate.name === name)
  if (!found) {
    throw new Error(`missing tool ${name}`)
  }
  return found
}

function record(value: unknown, key: string, environment: string): Record<string, unknown> {
  if (value === undefined) {
    return {}
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new SiteMcpToolError(`${environment}: \`${key}\` must be an object.`)
  }
  return value as Record<string, unknown>
}

/** Validates every entry before the card shows, so the user never approves a batch that fails. */
function readEnvironmentPlans(args: Record<string, unknown>): EnvironmentPlan[] {
  const raw = args.environments
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_ENVIRONMENTS) {
    throw new SiteMcpToolError(`environments must be a list of 1 to ${MAX_ENVIRONMENTS} entries.`)
  }
  return raw.map((entry: unknown) => {
    const item = record(entry, 'environments[]', 'entry')
    const unknown = Object.keys(item).filter(
      (key) => !['name', 'copy_from', 'fields', 'toggles'].includes(key)
    )
    if (unknown.length > 0) {
      throw new SiteMcpToolError(
        `Unknown environment keys: ${unknown.join(', ')}. Nothing was run.`
      )
    }
    const name = typeof item.name === 'string' ? item.name.trim() : ''
    if (!name) {
      throw new SiteMcpToolError('Each environment needs a `name`.')
    }
    const plan = {
      name,
      copyFrom: typeof item.copy_from === 'string' ? item.copy_from.trim() : '',
      fields: record(item.fields, 'fields', name),
      toggles: record(item.toggles, 'toggles', name)
    }
    // Both throw on unknown keys and password fields; the result is thrown away here.
    buildFieldPatches(plan.fields)
    collectToggleUpdates(plan.toggles)
    return plan
  })
}

function describePlan(plan: EnvironmentPlan, exists: boolean): string {
  const parts = [
    exists ? '' : plan.copyFrom ? `new, copied from ${plan.copyFrom}` : 'new',
    ...Object.entries(plan.fields).map(([key, value]) => `${key} = ${String(value)}`),
    ...Object.entries(plan.toggles).map(([key, value]) => `${key} ${value ? 'on' : 'off'}`)
  ]
  return parts.filter(Boolean).join('; ') || 'no changes'
}

async function applyPlans(context: SiteMcpContext, siteId: string, plans: EnvironmentPlan[]) {
  const results: Record<string, unknown>[] = []
  for (const plan of plans) {
    const site = context.store.getSite(siteId)
    if (!site) {
      throw new SiteMcpToolError('The site was removed before the change ran.')
    }
    const target = { site: site.id }
    if (!(plan.name in site.environments)) {
      await tool(SITE_MCP_ENV_TOOLS, 'create_environment').run(context, {
        ...target,
        name: plan.name,
        ...(plan.copyFrom ? { copy_from: plan.copyFrom } : {})
      })
    }
    if (Object.keys(plan.fields).length > 0) {
      await tool(SITE_MCP_CONFIG_TOOLS, 'set_deployment_fields').run(context, {
        ...target,
        env: plan.name,
        fields: plan.fields
      })
    }
    if (Object.keys(plan.toggles).length > 0) {
      await tool(SITE_MCP_CONFIG_TOOLS, 'set_deployment_toggles').run(context, {
        ...target,
        env: plan.name,
        toggles: plan.toggles
      })
    }
    results.push({ environment: plan.name, applied: true })
  }
  return { ok: true, site_id: siteId, environments: results }
}

export const SITE_MCP_SITE_WRITE_TOOLS: readonly SiteMcpTool[] = [
  {
    name: 'register_site',
    description:
      'Make a project or folder a Muster site so it can be configured, imported and deployed. Pass `project` or an absolute `path`. An existing site at that path is reused, not duplicated. The user approves it in Muster first.',
    inputSchema: objectSchema({
      ...PROJECT_PROPERTY,
      path: { type: 'string', description: 'Absolute checkout path, when it is not a project.' },
      name: { type: 'string', description: 'Site display name. Default: the folder name.' }
    }),
    requiresSiteSetup: true,
    async run(context, args) {
      const explicitPath = readString(args, 'path')
      if (explicitPath && !isAbsolute(explicitPath)) {
        throw new SiteMcpToolError('path must be an absolute path.')
      }
      const project = explicitPath
        ? null
        : await resolveMcpProject(context, readString(args, 'project'))
      const path = explicitPath || project?.path || ''
      const existing = context.store.findSiteByPath(path)
      const name = readString(args, 'name')
      return stageSetupWrite(
        context,
        {
          action: 'register_site',
          title: existing ? `Link ${existing.displayName}` : 'Register a site',
          summary: existing
            ? 'A site already exists at this path. It is reused and linked to the project.'
            : 'Create a site record for this checkout, with one empty environment.',
          details: cardDetails([
            ['Folder', path],
            ['Name', existing ? existing.displayName : name || 'Folder name'],
            ['Project', project?.name ?? '']
          ]),
          siteId: null,
          siteName: null
        },
        (approvalId) =>
          context.writeSetup('register-site', approvalId, { path, name, repoId: project?.id ?? '' })
      )
    }
  },
  {
    name: 'configure_site',
    description:
      'Set up several environments of a site in one approved batch. Each entry names an environment (created if missing, optionally copied from another) with `fields` as set_deployment_fields takes them and `toggles` as set_deployment_toggles takes them. Passwords are refused: use request_site_secret. A site the user approved for this session skips the card.',
    inputSchema: objectSchema(
      {
        ...SITE_PROPERTY,
        environments: {
          type: 'array',
          description: 'Environments to create or update, in order.',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              copy_from: { type: 'string' },
              fields: { type: 'object' },
              toggles: { type: 'object' }
            },
            required: ['name'],
            additionalProperties: false
          }
        }
      },
      ['environments']
    ),
    requiresSiteSetup: true,
    async run(context, args) {
      const site = resolveMcpSite(context, readString(args, 'site'))
      const plans = readEnvironmentPlans(args)
      return stageSetupWrite(
        context,
        {
          action: 'configure_site',
          title: `Configure ${site.displayName}`,
          summary: `Apply these settings to ${plans.length} environment${plans.length === 1 ? '' : 's'}.`,
          details: cardDetails(
            plans.map((plan) => [plan.name, describePlan(plan, plan.name in site.environments)])
          ),
          siteId: site.id,
          siteName: site.displayName
        },
        () => applyPlans(context, site.id, plans)
      )
    }
  },
  {
    name: 'add_site_root',
    description:
      'Add a folder Muster scans for site checkouts and clones new projects into. The user approves it in Muster first.',
    inputSchema: objectSchema({ path: { type: 'string', description: 'Absolute folder path.' } }, [
      'path'
    ]),
    requiresSiteSetup: true,
    async run(context, args) {
      const path = readString(args, 'path')
      if (!path || !isAbsolute(path)) {
        throw new SiteMcpToolError('path must be an absolute folder path.')
      }
      return stageSetupWrite(
        context,
        {
          action: 'add_site_root',
          title: 'Add a site root',
          summary: 'Muster will scan this folder for sites and offer it for new clones.',
          details: cardDetails([['Folder', path]]),
          siteId: null,
          siteName: null
        },
        (approvalId) => context.writeSetup('add-site-root', approvalId, { path })
      )
    }
  }
]
