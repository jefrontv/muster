// Reads and writes the two config formats the ActiveCollab MCP install touches, without a TOML
// dependency and without ever re-authoring a file wholesale.
//
// Everything goes through a small fs port instead of calling node:fs directly. These paths are the
// user's real ~/.claude.json, ~/.codex/config.toml and ~/.cursor/mcp.json, so the tests must be
// able to aim every read and write somewhere else; the default port is the only place node:fs
// appears.
//
// Both writers SPLICE — one key (JSON) or one table (TOML) is replaced and everything else is
// written back as found. A config that cannot be parsed is refused, never replaced: it is the
// user's file and it may hold every other MCP server they depend on.

import {
  accessSync,
  constants as fsConstants,
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync
} from 'node:fs'
import { dirname } from 'node:path'
import { writeSecureFile } from '../../shared/secure-file'
import {
  createTomlLineScanState,
  getTomlTableHeader,
  isTomlStructuralLine,
  updateTomlLineScanState
} from '../codex/config-toml-line-scan'
import { isPlainJsonObject } from '../sites/mcp/site-mcp-jsonrpc'

export type JsonObject = Record<string, unknown>

export type ActiveCollabMcpFs = {
  exists: (target: string) => boolean
  isExecutableFile: (target: string) => boolean
  /** null means "not there"; an unreadable path is indistinguishable from absent by design. */
  readText: (target: string) => string | null
  writeText: (target: string, contents: string) => void
  /** Credentials: mode 0600 under a 0700 directory, published by rename. */
  writeSecretText: (target: string, contents: string) => void
}

export function createNodeActiveCollabMcpFs(): ActiveCollabMcpFs {
  return {
    exists: (target) => existsSync(target),
    isExecutableFile: (target) => {
      try {
        // Why: a pipx shim is a symlink, so stat (which follows it) is the honest check here.
        if (!statSync(target).isFile()) {
          return false
        }
        accessSync(target, fsConstants.X_OK)
        return true
      } catch {
        return false
      }
    },
    readText: (target) => {
      try {
        return readFileSync(target, 'utf8')
      } catch {
        return null
      }
    },
    writeText: (target, contents) => {
      mkdirSync(dirname(target), { recursive: true })
      writeFileSync(target, contents, 'utf8')
    },
    // Why: writeSecureFile writes a fresh 0600 temp file under a 0700 dir and publishes it by
    // rename, so the mode holds even when the target already existed world-readable.
    writeSecretText: (target, contents) => {
      writeSecureFile(target, contents)
    }
  }
}

/** Returns null when the file is absent. Throws when it exists but is not a JSON object. */
export function readJsonConfig(fs: ActiveCollabMcpFs, target: string): JsonObject | null {
  const raw = fs.readText(target)
  if (raw === null) {
    return null
  }
  const trimmed = raw.trim()
  if (trimmed.length === 0) {
    return {}
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(trimmed)
  } catch {
    throw new Error(`${target} is not valid JSON. Muster left it unchanged.`)
  }
  if (!isPlainJsonObject(parsed)) {
    throw new Error(`${target} is not a JSON object. Muster left it unchanged.`)
  }
  return parsed
}

/**
 * Shared so the reader and the writer agree on what an unusable `mcpServers` is: the reader must
 * report the same refusal the writer would raise, or the UI shows "not configured" for a file that
 * cannot in fact be configured.
 */
function readServersObject(target: string, value: unknown): JsonObject | undefined {
  if (value === undefined) {
    return undefined
  }
  if (!isPlainJsonObject(value)) {
    throw new Error(`${target} has a non-object "mcpServers". Muster left it unchanged.`)
  }
  return value
}

export function readJsonMcpServer(
  fs: ActiveCollabMcpFs,
  target: string,
  key: string
): JsonObject | null {
  const servers = readServersObject(target, readJsonConfig(fs, target)?.mcpServers)
  if (servers === undefined) {
    return null
  }
  const entry = servers[key]
  return isPlainJsonObject(entry) ? entry : null
}

/** Adds, replaces (entry) or drops (null) exactly one server key. Every other key survives. */
export function spliceJsonMcpServer(
  fs: ActiveCollabMcpFs,
  target: string,
  key: string,
  entry: JsonObject | null
): void {
  const document = readJsonConfig(fs, target) ?? {}
  const existing = readServersObject(target, document.mcpServers)
  const servers: JsonObject = existing === undefined ? {} : { ...existing }
  if (entry === null) {
    if (!(key in servers)) {
      return
    }
    delete servers[key]
  } else {
    servers[key] = entry
  }
  // Why: spreading first keeps mcpServers at its original position (and every sibling key intact);
  // both files this touches are already 2-space JSON, so the round-trip is formatting-neutral.
  fs.writeText(target, `${JSON.stringify({ ...document, mcpServers: servers }, null, 2)}\n`)
}

type TomlTableRange = { start: number; end: number }

/**
 * The half-open line range of `[header]`, ending at the next structural table header.
 *
 * A subtable such as `[mcp_servers.activecollab.env]` counts as the NEXT table and is therefore
 * left alone — we never author one, so if a user hand-added it their edit survives our rewrite.
 */
function findTomlTable(lines: readonly string[], header: string): TomlTableRange | null {
  let scanState = createTomlLineScanState()
  let start = -1
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? ''
    const found = isTomlStructuralLine(scanState) ? getTomlTableHeader(line) : null
    scanState = updateTomlLineScanState(scanState, line)
    if (found === null) {
      continue
    }
    if (start !== -1) {
      return { start, end: index }
    }
    if (found.trim() === header) {
      start = index
    }
  }
  return start === -1 ? null : { start, end: lines.length }
}

/** The value text of a `key = value` line, or null. Tolerates missing spaces around the `=`. */
export function tomlLineValue(block: string, key: string): string | null {
  for (const raw of block.split('\n')) {
    const line = raw.trim()
    if (!line.startsWith(key)) {
      continue
    }
    const rest = line.slice(key.length).trim()
    if (rest.startsWith('=')) {
      return rest.slice(1).trim()
    }
  }
  return null
}

export function readTomlTable(
  fs: ActiveCollabMcpFs,
  target: string,
  header: string
): string | null {
  const raw = fs.readText(target)
  if (raw === null) {
    return null
  }
  const lines = raw.split(/\r?\n/)
  const range = findTomlTable(lines, header)
  return range === null ? null : lines.slice(range.start, range.end).join('\n').trimEnd()
}

function countTrailingBlanks(lines: readonly string[]): number {
  let count = 0
  while (count < lines.length && (lines[lines.length - 1 - count] ?? '').trim().length === 0) {
    count += 1
  }
  return count
}

/** Replaces (body) or removes (null) one table in place. Unrelated tables keep their bytes. */
export function spliceTomlTable(
  fs: ActiveCollabMcpFs,
  target: string,
  header: string,
  body: readonly string[] | null
): void {
  const raw = fs.readText(target)
  const eol = raw !== null && raw.includes('\r\n') ? '\r\n' : '\n'
  const lines = raw === null ? [] : raw.split(/\r?\n/)
  const range = findTomlTable(lines, header)

  if (body === null) {
    if (range === null) {
      return
    }
    lines.splice(range.start, range.end - range.start)
  } else if (range === null) {
    // Why: collapse the file's trailing blanks to exactly one separator so repeated appends can
    // never accumulate whitespace, then restore the closing newline.
    while (lines.length > 0 && (lines.at(-1) ?? '').trim().length === 0) {
      lines.pop()
    }
    if (lines.length > 0) {
      lines.push('')
    }
    lines.push(header, ...body, '')
  } else {
    const blanks = countTrailingBlanks(lines.slice(range.start, range.end))
    const padding = Array.from<string>({ length: blanks }).fill('')
    lines.splice(range.start, range.end - range.start, header, ...body, ...padding)
  }
  fs.writeText(target, lines.join(eol))
}
