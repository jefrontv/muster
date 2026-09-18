// What get_wp_fields asks the walker for: values at paths, or the shape of the target.
//
// describe answers "what is on this target" before an agent can name a single path, so its
// field list is optional; a get without paths has nothing to read and stays an error.

import {
  readBoolean,
  readString,
  SiteMcpToolError,
  type ToolArguments
} from './mcp/site-mcp-arguments'
import { ACF_MAX_PATHS, hasAcfWildcard, parseAcfPath, readAcfGetPaths } from './wp-acf-payload'

export type AcfGetLocation = 'local' | 'remote' | 'both'

export type AcfGetRequest =
  | { mode: 'get'; fields: string[] }
  | { mode: 'describe'; fields: string[]; layoutFilter?: string }
  | { mode: 'checksum'; fields: string[] }

// Only a read can run on both hosts, so update_wp_fields keeps site-mcp-arguments' readLocation.
export function readAcfGetLocation(args: ToolArguments): AcfGetLocation {
  const value = readString(args, 'location')
  if (value !== 'local' && value !== 'remote' && value !== 'both') {
    throw new SiteMcpToolError("'location' must be 'local', 'remote', or 'both'.")
  }
  return value
}

// A describe or checksum path names a root or a container, so a wildcard has no rows to expand.
export function readAcfContainerPaths(args: ToolArguments, mode: string): string[] {
  const value = args.fields
  if (value === undefined || value === null) {
    return []
  }
  if (!Array.isArray(value)) {
    throw new SiteMcpToolError("'fields' must be an array of paths.")
  }
  if (value.length > ACF_MAX_PATHS) {
    throw new SiteMcpToolError(`'fields' may list at most ${ACF_MAX_PATHS} paths.`)
  }
  return value.map((entry, index) => {
    if (typeof entry !== 'string' || entry.length === 0) {
      throw new SiteMcpToolError(`'fields[${index}]' must be a non-empty path.`)
    }
    if (hasAcfWildcard(parseAcfPath(entry))) {
      throw new SiteMcpToolError(`'fields[${index}]' cannot use a wildcard with ${mode}.`)
    }
    return entry
  })
}

export function readAcfGetRequest(args: ToolArguments): AcfGetRequest {
  const layoutFilter = readString(args, 'layout_filter')
  const describe = readBoolean(args, 'describe')
  const checksum = readBoolean(args, 'checksum')
  if (describe && checksum) {
    throw new SiteMcpToolError("'describe' and 'checksum' are different modes; pass one.")
  }
  if (checksum) {
    if (layoutFilter.length > 0) {
      throw new SiteMcpToolError("'layout_filter' needs describe: true.")
    }
    return { mode: 'checksum', fields: readAcfContainerPaths(args, 'checksum') }
  }
  if (!describe) {
    if (layoutFilter.length > 0) {
      throw new SiteMcpToolError("'layout_filter' needs describe: true.")
    }
    return { mode: 'get', fields: readAcfGetPaths(args) }
  }
  const fields = readAcfContainerPaths(args, 'describe')
  return layoutFilter.length > 0
    ? { mode: 'describe', fields, layoutFilter }
    : { mode: 'describe', fields }
}
