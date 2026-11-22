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
    description: 'Site name, id, or path (defaults to cwd).'
  }
} as const

export const ENV_PROPERTY = {
  env: {
    type: 'string',
    description: 'Target environment (defaults to branch match).'
  }
} as const

export const LOCATION_PROPERTY = {
  location: {
    type: 'string',
    enum: ['local', 'remote'],
    description: "Required: 'local' (checkout WP root) or 'remote' (environment host)."
  }
} as const

export const TARGET_PROPERTY = {
  target: {
    type: 'object',
    description:
      "ACF $post_id: {kind: 'option'|'post'|'term'|'user'|'comment', id?}. id required except option."
  }
} as const

export const COMPARE_LOCATION_PROPERTY = {
  location: {
    type: 'string',
    enum: ['local', 'remote', 'both'],
    description: "Required: 'local', 'remote', or 'both' (reads both and compares)."
  }
} as const

export const TARGETS_PROPERTY = {
  targets: {
    type: 'array',
    description:
      'Up to 20 {kind, id} targets (exclusive with target). Returns targets: [{target, ...envelope}]; top-level ok is true only if all succeed.'
  }
} as const

export const RETURN_PROPERTY = {
  return: {
    type: 'string',
    enum: ['full', 'values'],
    description:
      "Default 'full'. 'values' drops host bookkeeping and per-path field metadata (keeps path/value, pattern field/skipped/truncated, counts, and revert)."
  }
} as const

export const CONFIRM_PROPERTY = {
  confirm: {
    type: 'boolean',
    description:
      'Accept fallback environment when branch matches none (never overrides missing credentials or empty step lists).'
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
