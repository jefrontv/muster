// Pages tool arguments: alias names agents guess, and missing-argument errors that list what a tool takes.
import { SiteMcpToolError } from './site-mcp-arguments'

type PagesToolArgSpec = {
  accepted: string[]
  required: string[]
  /** alias -> canonical argument name */
  aliases: Record<string, string>
}

const SPECS = new Map<string, PagesToolArgSpec>()

export function registerPagesToolArgs(name: string, spec: PagesToolArgSpec): void {
  SPECS.set(name, spec)
}

// An empty string is left to the op: edit_page takes new_text: '' to delete a passage.
function isMissing(value: unknown): boolean {
  return value === undefined || value === null
}

/** Args with aliases renamed to their canonical names; throws when a required one is missing. */
export function pagesToolArgs(
  name: string,
  args: Record<string, unknown>
): Record<string, unknown> {
  const spec = SPECS.get(name)
  if (!spec) {
    return args
  }
  const out = { ...args }
  for (const [alias, canonical] of Object.entries(spec.aliases)) {
    if (alias in out) {
      if (isMissing(out[canonical])) {
        out[canonical] = out[alias]
      }
      delete out[alias]
    }
  }
  const missing = spec.required.find((key) => isMissing(out[key]))
  if (missing) {
    throw new SiteMcpToolError(`${name} needs "${missing}" (accepts: ${spec.accepted.join(', ')})`)
  }
  return out
}
