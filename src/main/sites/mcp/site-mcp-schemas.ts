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
