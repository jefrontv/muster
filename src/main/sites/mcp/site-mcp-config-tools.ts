// Deployment config tools: get_deployment_status, get_deployment_config, list_deployment_toggles,
// set_deployment_toggles, set_deployment_fields. Ported from ocsites mcp_server.py:2678-2790.
//
// The two write tools are all-or-nothing, exactly as ocsites was: every key is validated before
// any key is applied, so a typo cannot half-apply a change the agent believes was rejected. Any
// key that looks like a password is refused with a named error rather than treated as unknown —
// there is no password property on Site or SiteEnvironment to write into, and saying so plainly
// stops a model from retrying with a different spelling.

import {
  SITE_DEPLOY_TOGGLES,
  SITE_IMPORT_TOGGLES,
  type Site,
  type SiteEnvironment
} from '../../../shared/site-types'
import {
  readRecord,
  readString,
  resolveMcpSite,
  SiteMcpToolError,
  type ToolArguments
} from './site-mcp-arguments'
import type { SiteMcpContext, SiteMcpTool } from './site-mcp-context'
import {
  buildFieldPatches,
  canonicalKey,
  PASSWORD_FIELD_KEYS,
  resolveToggleKey,
  SITE_MCP_FIELDS
} from './site-mcp-fields'
import { ENV_PROPERTY, objectSchema, SITE_PROPERTY } from './site-mcp-schemas'
import { buildDeploymentConfigView, buildDeploymentStatusView } from './site-mcp-views'

/** Explicit `env` wins; otherwise the branch decides, exactly as a run would. */
async function resolveTargetEnvironment(
  context: SiteMcpContext,
  site: Site,
  requested: string
): Promise<string> {
  if (requested.length > 0) {
    if (!Object.hasOwn(site.environments, requested)) {
      throw new SiteMcpToolError(`Environment '${requested}' not found for this site.`, {
        available_environments: Object.keys(site.environments)
      })
    }
    return requested
  }
  const summary = await context.summarize(site)
  const resolved = summary.resolvedEnvironment.environment
  if (!resolved) {
    throw new SiteMcpToolError('Site has no environments. Create one with create_environment.')
  }
  // A run refuses this branch without confirmation; a config write must not quietly edit a guess.
  if (summary.resolvedEnvironment.requiresConfirmation) {
    throw new SiteMcpToolError(
      `The checked-out branch does not identify an environment (it fell back to '${resolved}'). Pass env to say which one to change. Nothing was saved.`,
      { available_environments: Object.keys(site.environments) }
    )
  }
  return resolved
}

/** Every settable key, so a model sees the enums (local_stack's included) without asking first. */
function fieldProperties(): Record<string, Record<string, unknown>> {
  return Object.fromEntries(
    SITE_MCP_FIELDS.map((field) => [
      field.key,
      field.kind === 'number'
        ? { type: ['number', 'string', 'null'], description: field.description }
        : field.kind === 'boolean'
          ? { type: ['boolean', 'string'], description: `${field.description} (per environment)` }
          : {
              type: 'string',
              description: `${field.description}${field.target === 'environment' ? ' (per environment)' : ''}`,
              ...(field.choices ? { enum: [...field.choices] } : {})
            }
    ])
  )
}

function toggleProperties(): Record<string, Record<string, unknown>> {
  return Object.fromEntries(
    [...SITE_IMPORT_TOGGLES, ...SITE_DEPLOY_TOGGLES].map((toggle) => [
      canonicalKey(toggle.key),
      { type: 'boolean', description: toggle.label }
    ])
  )
}

async function applyEnvironmentPatch(
  context: SiteMcpContext,
  site: Site,
  environmentName: string,
  sitePatch: Partial<Site>,
  environmentPatch: Partial<SiteEnvironment>
): Promise<Record<string, unknown>> {
  const base = site.environments[environmentName]
  if (!base) {
    throw new SiteMcpToolError(`Environment '${environmentName}' not found for this site.`, {
      available_environments: Object.keys(site.environments)
    })
  }
  // A patch, not a rebuilt map: the site was read from disk, which trails the GUI's save.
  const updated = await context.updateSite(
    site.id,
    sitePatch,
    Object.keys(environmentPatch).length > 0
      ? { [environmentName]: { merge: environmentPatch } }
      : undefined
  )
  // Why not fall back to `site`: summarizing the pre-write record reported ok:true
  // with the OLD values, so a write that never landed read as success.
  if (!updated) {
    throw new SiteMcpToolError('The site could not be updated; nothing was saved.', {
      site_id: site.id,
      environment: environmentName
    })
  }
  const summary = await context.summarize(updated)
  return { ok: true, ...buildDeploymentConfigView(summary, environmentName) }
}

function toggleDescriptors(
  toggles: typeof SITE_IMPORT_TOGGLES | typeof SITE_DEPLOY_TOGGLES
): Record<string, string>[] {
  return toggles.map((toggle) => ({ key: canonicalKey(toggle.key), description: toggle.label }))
}

function collectToggleUpdates(raw: Record<string, unknown>): Partial<SiteEnvironment> {
  const patch: Partial<SiteEnvironment> = {}
  const unknown: string[] = []
  const invalid: string[] = []
  for (const [key, value] of Object.entries(raw)) {
    const toggle = resolveToggleKey(key)
    if (!toggle) {
      unknown.push(key)
      continue
    }
    // A model sends "true" as often as true. Anything else (1, "yes", null) used to mean off.
    if (value === true || value === 'true') {
      patch[toggle] = true
    } else if (value === false || value === 'false') {
      patch[toggle] = false
    } else {
      invalid.push(key)
    }
  }
  if (invalid.length > 0) {
    throw new SiteMcpToolError(
      `Toggle values must be true or false: ${invalid.sort().join(', ')}. Nothing was changed.`
    )
  }
  // Thrown after the loop, before the patch is returned: still all-or-nothing.
  if (unknown.length > 0) {
    throw new SiteMcpToolError(`Unknown toggle keys: ${unknown.sort().join(', ')}`, {
      valid_keys: [...SITE_IMPORT_TOGGLES, ...SITE_DEPLOY_TOGGLES].map((toggle) =>
        canonicalKey(toggle.key)
      )
    })
  }
  return patch
}

const WRITE_SCHEMA_SUFFIX = { ...SITE_PROPERTY, ...ENV_PROPERTY }

export const SITE_MCP_CONFIG_TOOLS: readonly SiteMcpTool[] = [
  {
    name: 'get_deployment_status',
    description:
      'Return whether a site has deployment config and how many import/deploy steps are currently selected.',
    inputSchema: objectSchema({ ...SITE_PROPERTY }),
    async run(context, args) {
      const site = resolveMcpSite(context, readString(args, 'site'))
      return buildDeploymentStatusView(await context.summarize(site))
    }
  },
  {
    name: 'get_deployment_config',
    description:
      'Return the full deployment config for a site: every non-secret field value, password set-status flags, and the state of every import/deploy toggle. Passwords are never returned.',
    inputSchema: objectSchema({ ...WRITE_SCHEMA_SUFFIX }),
    async run(context, args) {
      const site = resolveMcpSite(context, readString(args, 'site'))
      const requested = readString(args, 'env')
      const summary = await context.summarize(site)
      if (requested.length > 0 && !Object.hasOwn(site.environments, requested)) {
        throw new SiteMcpToolError(`Environment '${requested}' not found for this site.`, {
          available_environments: Object.keys(site.environments)
        })
      }
      return buildDeploymentConfigView(summary, requested.length > 0 ? requested : null)
    }
  },
  {
    name: 'list_deployment_toggles',
    description:
      'List every deployment toggle and field with a human-readable description. Call this before set_deployment_toggles or set_deployment_fields to discover valid keys.',
    inputSchema: objectSchema({}),
    run(_context, _args) {
      return Promise.resolve({
        ok: true,
        import_toggles: toggleDescriptors(SITE_IMPORT_TOGGLES),
        deploy_toggles: toggleDescriptors(SITE_DEPLOY_TOGGLES),
        fields: SITE_MCP_FIELDS.map((field) => ({
          key: field.key,
          description: field.description,
          scope: field.target === 'site' ? 'site' : 'environment',
          settable_via_mcp: true,
          ...(field.choices ? { choices: field.choices } : {})
        })),
        refused_fields: PASSWORD_FIELD_KEYS.map((key) => ({
          key,
          settable_via_mcp: false,
          reason: 'Passwords are stored in the OS keychain and can only be set inside Muster.'
        }))
      })
    }
  },
  {
    name: 'set_deployment_toggles',
    description:
      'Enable or disable import/deploy toggles for one environment of a site. Unknown keys fail the whole call without saving. Returns the deployment config after the update.',
    inputSchema: objectSchema(
      {
        toggles: {
          type: 'object',
          description:
            'Map of toggle key to boolean, e.g. {"export_database": true}. camelCase keys are accepted too.',
          properties: toggleProperties()
        },
        ...WRITE_SCHEMA_SUFFIX
      },
      ['toggles']
    ),
    async run(context, args) {
      const site = resolveMcpSite(context, readString(args, 'site'))
      const environmentName = await resolveTargetEnvironment(context, site, readString(args, 'env'))
      const patch = collectToggleUpdates(readRecord(args, 'toggles'))
      return applyEnvironmentPatch(context, site, environmentName, {}, patch)
    }
  },
  {
    name: 'set_deployment_fields',
    description:
      'Update deployment field values for a site (hostname, root_path, db_user, local_domain, deploy_command, …). Password fields are refused. Unknown keys fail the whole call without saving.',
    inputSchema: objectSchema(
      {
        fields: {
          type: 'object',
          description:
            'Map of field key to value, e.g. {"hostname": "example.com"}. camelCase keys are accepted too. Values out of range are refused, not clamped.',
          properties: fieldProperties()
        },
        ...WRITE_SCHEMA_SUFFIX
      },
      ['fields']
    ),
    async run(context: SiteMcpContext, args: ToolArguments) {
      const site = resolveMcpSite(context, readString(args, 'site'))
      const { sitePatch, environmentPatch } = buildFieldPatches(readRecord(args, 'fields'))
      if (Object.keys(environmentPatch).length === 0) {
        const updated = await context.updateSite(site.id, sitePatch)
        if (!updated) {
          throw new SiteMcpToolError('The site could not be updated; nothing was saved.', {
            site_id: site.id
          })
        }
        return { ok: true, ...buildDeploymentConfigView(await context.summarize(updated)) }
      }
      const environmentName = await resolveTargetEnvironment(context, site, readString(args, 'env'))
      return applyEnvironmentPatch(context, site, environmentName, sitePatch, environmentPatch)
    }
  }
]
