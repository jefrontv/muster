// JSON Schema fragments shared by the tool descriptors.
//
// Every schema is a closed object (`additionalProperties: false`) with an explicit `required`
// array, because a model that can guess a parameter name will guess one — and a silently ignored
// `envrionment: "staging"` on a deploy is exactly the class of mistake this phase exists to stop.

import type { SiteMcpJsonSchema } from './site-mcp-context'

export function objectSchema(
  properties: Record<string, unknown>,
  required: string[] = []
): SiteMcpJsonSchema {
  return { type: 'object', properties, required, additionalProperties: false }
}

export const SITE_PROPERTY = {
  site: {
    type: 'string',
    description:
      "Site name, id, or local path. Omit to use the site containing the agent's working directory."
  }
} as const

export const ENV_PROPERTY = {
  env: {
    type: 'string',
    description:
      'Target this environment explicitly. Omitted means infer it from the checked-out git branch.'
  }
} as const

export const LOCATION_PROPERTY = {
  location: {
    type: 'string',
    enum: ['local', 'remote'],
    description:
      "Required. 'local' is this site's WordPress root (path + localWpRoot). 'remote' is an environment host. env=local is an environment name, not the checkout."
  }
} as const

export const TARGET_PROPERTY = {
  target: {
    type: 'object',
    description:
      "ACF $post_id. kind: option (id optional custom post_id), post, term, user, comment (id required). 'options' is accepted as option."
  }
} as const

export const COMPARE_LOCATION_PROPERTY = {
  location: {
    type: 'string',
    enum: ['local', 'remote', 'both'],
    description:
      "Required. 'local' is this site's WordPress root (path + localWpRoot). 'remote' is an environment host. 'both' reads each and returns one comparison. env=local is an environment name, not the checkout."
  }
} as const

export const TARGETS_PROPERTY = {
  targets: {
    type: 'array',
    description:
      'Up to 20 targets in one run, each {kind, id} like target. Not combinable with target. The response carries targets: [{target, ...envelope}] and nothing at the top level but ok, which is true only when every target succeeded, so read apply, results and revert per target. A target that fails keeps its own ok: false and error while the others still write.'
  }
} as const

export const RETURN_PROPERTY = {
  return: {
    type: 'string',
    enum: ['full', 'values'],
    description:
      "Default 'full'. 'values' strips what an agent can infer. A read's plain path becomes {path, value}, an error row keeps path, exists and error, and a pattern keeps path, exists, wildcard, count, skipped and truncated with field: {key, type} at the pattern level; a match under a mixed-layout clone chain keeps its own field, so read match.field ?? pattern.field. A write's results drop field and its ops drop row_layouts, nothing else. Muster also drops site_id, host, wp_root and command. ok, warnings, location, site, environment, counts and revert always stay."
  }
} as const

export const CONFIRM_PROPERTY = {
  confirm: {
    type: 'boolean',
    description:
      'Proceed even though the branch matches no environment. Overrides nothing else — a missing credential or an empty step list still refuses.'
  }
} as const

export const GROUP_PROPERTY = {
  group: {
    type: 'string',
    enum: ['import', 'deploy'],
    description: "'import' pulls the server down to local; 'deploy' pushes local up to the server."
  }
} as const

export const LIMIT_PROPERTY = {
  limit: { type: 'integer', description: 'Maximum rows to return.', minimum: 1, maximum: 200 }
} as const

export const RUN_ID_PROPERTY = {
  run_id: {
    type: 'string',
    description: 'Run id returned by run_import_functions/run_deploy_functions.'
  }
} as const

export const JOB_ID_PROPERTY = {
  job_id: { type: 'string', description: 'Job id (the run id) to inspect or cancel.' }
} as const
