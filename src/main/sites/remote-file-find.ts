// Find files on the server and, when they are small text, bring their contents back.
//
// Ported from ocsites `_find_file_impl` (mcp_server.py:1020-1211). The value is being able to read
// a live `.htaccess`, `wp-config.php` or plugin file without an interactive shell; the cost is that
// it will happily be pointed at a 4 GB media file, so every match is size-gated and sniffed for
// binary content before anything is decoded.
//
// Content travels as base64 over the exec channel on purpose: a raw `cat` of a file with CRLFs or
// an invalid UTF-8 sequence comes back mangled by the shell and the decoder.

import { Buffer } from 'node:buffer'
import type {
  RemoteFileMatch,
  RemoteFileSearch,
  RemoteFileSearchKind
} from '../../shared/site-tool-types'
import { quoteShellArgument, SiteRunStepError, type SiteSshSession } from './pipeline-contract'

export const FIND_FILE_STEP = 'remote-find'

/** Same class ocsites allowed: names and globs, never a shell metacharacter. */
const SAFE_FIND_PATTERN = /^[A-Za-z0-9._\-*?[\]/]+$/

const PROBE_TIMEOUT_MS = 15_000
const READ_TIMEOUT_MS = 30_000
const MAX_MATCH_CAP = 200
const MAX_DEPTH_CAP = 12
const BINARY_SNIFF_BYTES = 8192

export const FIND_FILE_DEFAULT_MAX_MATCHES = 20
export const FIND_FILE_DEFAULT_MAX_SIZE_BYTES = 256 * 1024
export const FIND_FILE_DEFAULT_MAX_DEPTH = 6

/** Extensions returned as decoded text when the size permits. Ported verbatim. */
const TEXT_EXTENSIONS: readonly string[] = [
  '.php',
  '.phtml',
  '.html',
  '.htm',
  '.xhtml',
  '.css',
  '.scss',
  '.sass',
  '.less',
  '.js',
  '.jsx',
  '.ts',
  '.tsx',
  '.mjs',
  '.cjs',
  '.vue',
  '.svelte',
  '.json',
  '.jsonc',
  '.xml',
  '.yml',
  '.yaml',
  '.toml',
  '.ini',
  '.conf',
  '.cfg',
  '.properties',
  '.txt',
  '.md',
  '.markdown',
  '.rst',
  '.sql',
  '.py',
  '.rb',
  '.pl',
  '.lua',
  '.sh',
  '.bash',
  '.zsh',
  '.fish',
  '.env',
  '.htaccess',
  '.gitignore',
  '.gitattributes',
  '.editorconfig',
  '.csv',
  '.tsv',
  '.log',
  '.svg'
]

/** Extension-less names that are conventionally text. */
const TEXT_FILENAMES: Record<string, true> = {
  README: true,
  LICENSE: true,
  COPYING: true,
  CHANGELOG: true,
  AUTHORS: true,
  CONTRIBUTORS: true,
  Makefile: true,
  Dockerfile: true,
  Procfile: true,
  Vagrantfile: true
}

export type RemoteFileSearchRequest = {
  pattern: string
  /** Remote directory to search. Defaults to the resolved webroot. */
  searchRoot: string
  kind: RemoteFileSearchKind
  maxMatches?: number
  maxSizeBytes?: number
  maxDepth?: number
  environment: string
}

export async function findRemoteFiles(
  session: SiteSshSession,
  request: RemoteFileSearchRequest
): Promise<RemoteFileSearch> {
  const pattern = request.pattern.trim()
  if (pattern.length === 0 || !SAFE_FIND_PATTERN.test(pattern)) {
    throw new SiteRunStepError(
      FIND_FILE_STEP,
      'A pattern is required and may contain only A-Z 0-9 . _ - * ? [ ] /'
    )
  }
  const searchRoot = request.searchRoot.replace(/\/+$/, '') || '.'
  if (!SAFE_FIND_PATTERN.test(searchRoot)) {
    throw new SiteRunStepError(
      FIND_FILE_STEP,
      `Search path contains disallowed characters: ${searchRoot}`
    )
  }
  const maxMatches = clamp(request.maxMatches ?? FIND_FILE_DEFAULT_MAX_MATCHES, 1, MAX_MATCH_CAP)
  const maxSizeBytes = Math.max(request.maxSizeBytes ?? FIND_FILE_DEFAULT_MAX_SIZE_BYTES, 0)

  const found = pattern.startsWith('/')
    ? await probeAbsolutePath(session, pattern, request.kind)
    : await runFind(session, searchRoot, pattern, request.kind, maxMatches, request.maxDepth)

  const matches: RemoteFileMatch[] = []
  for (const remotePath of found.slice(0, maxMatches)) {
    matches.push(await describeMatch(session, remotePath, maxSizeBytes))
  }
  return {
    environment: request.environment,
    searchRoot,
    pattern,
    kindFilter: request.kind,
    matches,
    moreAvailable: found.length > maxMatches
  }
}

async function probeAbsolutePath(
  session: SiteSshSession,
  target: string,
  kind: RemoteFileSearchKind
): Promise<string[]> {
  const flag = kind === 'file' ? '-f' : kind === 'dir' ? '-d' : '-e'
  const result = await session.exec(`test ${flag} ${quoteShellArgument(target)}`, {
    timeoutMs: PROBE_TIMEOUT_MS
  })
  return result.code === 0 ? [target] : []
}

async function runFind(
  session: SiteSshSession,
  searchRoot: string,
  pattern: string,
  kind: RemoteFileSearchKind,
  maxMatches: number,
  maxDepth: number | undefined
): Promise<string[]> {
  const depth = clamp(maxDepth ?? FIND_FILE_DEFAULT_MAX_DEPTH, 1, MAX_DEPTH_CAP)
  const typeExpression =
    kind === 'file' ? '-type f' : kind === 'dir' ? '-type d' : String.raw`\( -type f -o -type d \)`
  // head reads one more than asked so `moreAvailable` can be reported honestly.
  const result = await session.exec(
    `find ${quoteShellArgument(searchRoot)} -maxdepth ${depth} ${typeExpression} ` +
      `-name ${quoteShellArgument(pattern)} 2>/dev/null | head -n ${Math.min(maxMatches + 1, MAX_MATCH_CAP)}`,
    { timeoutMs: READ_TIMEOUT_MS }
  )
  const paths = result.stdout
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
  if (paths.length === 0 && result.code !== 0) {
    throw new SiteRunStepError(
      FIND_FILE_STEP,
      result.stderr.trim() || `find failed under ${searchRoot} (exit ${result.code}).`
    )
  }
  return paths
}

async function describeMatch(
  session: SiteSshSession,
  remotePath: string,
  maxSizeBytes: number
): Promise<RemoteFileMatch> {
  const quoted = quoteShellArgument(remotePath)
  const isDirectory = await session.exec(`test -d ${quoted}`, { timeoutMs: PROBE_TIMEOUT_MS })
  if (isDirectory.code === 0) {
    return {
      path: remotePath,
      kind: 'directory',
      sizeBytes: null,
      content: null,
      encoding: null,
      detail: null
    }
  }
  // GNU stat, BSD stat, then wc -c: shared hosts run all three shapes.
  const sized = await session.exec(
    `stat -c %s ${quoted} 2>/dev/null || stat -f %z ${quoted} 2>/dev/null || wc -c < ${quoted}`,
    { timeoutMs: PROBE_TIMEOUT_MS }
  )
  const sizeBytes = Number.parseInt(sized.stdout.trim().split('\n').at(-1)?.trim() ?? '', 10)
  if (!Number.isFinite(sizeBytes)) {
    return {
      path: remotePath,
      kind: 'unreadable',
      sizeBytes: null,
      content: null,
      encoding: null,
      detail: 'Could not determine the file size.'
    }
  }
  if (sizeBytes > maxSizeBytes) {
    return {
      path: remotePath,
      kind: 'too-large',
      sizeBytes,
      content: null,
      encoding: null,
      detail: `${sizeBytes} bytes exceeds the ${maxSizeBytes}-byte content cap.`
    }
  }
  if (!isLikelyTextFilename(remotePath) && (await sniffIsBinary(session, quoted))) {
    return {
      path: remotePath,
      kind: 'binary',
      sizeBytes,
      content: null,
      encoding: null,
      detail: null
    }
  }
  return readTextMatch(session, remotePath, quoted, sizeBytes)
}

async function readTextMatch(
  session: SiteSshSession,
  remotePath: string,
  quoted: string,
  sizeBytes: number
): Promise<RemoteFileMatch> {
  const encoded = await session.exec(`base64 < ${quoted}`, { timeoutMs: READ_TIMEOUT_MS })
  if (encoded.code !== 0) {
    return {
      path: remotePath,
      kind: 'unreadable',
      sizeBytes,
      content: null,
      encoding: null,
      detail: encoded.stderr.trim() || `read failed (exit ${encoded.code}).`
    }
  }
  const raw = Buffer.from(encoded.stdout.replaceAll('\n', ''), 'base64')
  if (raw.subarray(0, BINARY_SNIFF_BYTES).includes(0)) {
    return {
      path: remotePath,
      kind: 'binary',
      sizeBytes,
      content: null,
      encoding: null,
      detail: null
    }
  }
  // A round trip through utf8 replaces invalid sequences with U+FFFD, so a mismatch means the file
  // is not UTF-8 and latin-1 at least gives every byte a printable character.
  const asUtf8 = raw.toString('utf8')
  const utf8Clean = Buffer.compare(Buffer.from(asUtf8, 'utf8'), raw) === 0
  return {
    path: remotePath,
    kind: 'file',
    sizeBytes,
    content: utf8Clean ? asUtf8 : raw.toString('latin1'),
    encoding: utf8Clean ? 'utf-8' : 'latin-1',
    detail: null
  }
}

/** Sniffs the head for a NUL byte, which is what separates text from a binary blob in practice. */
async function sniffIsBinary(session: SiteSshSession, quoted: string): Promise<boolean> {
  const head = await session.exec(`head -c ${BINARY_SNIFF_BYTES} ${quoted} | base64`, {
    timeoutMs: READ_TIMEOUT_MS
  })
  if (head.code !== 0) {
    return true
  }
  return Buffer.from(head.stdout.replaceAll('\n', ''), 'base64').includes(0)
}

export function isLikelyTextFilename(remotePath: string): boolean {
  const name = remotePath.split('/').at(-1) ?? ''
  return (
    TEXT_EXTENSIONS.some((extension) => name.toLowerCase().endsWith(extension)) ||
    Object.hasOwn(TEXT_FILENAMES, name)
  )
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(Math.max(Math.trunc(value), low), high)
}
