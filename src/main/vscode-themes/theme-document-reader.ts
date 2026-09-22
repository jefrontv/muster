// One theme file read into a single document, with its `include` chain followed.
//
// The chain is the reason this is not a `readFile` plus a `JSON.parse`. VS Code's current default
// theme is four files: `2026-dark.json` includes `dark_modern.json` includes `dark_plus.json`
// includes `dark_vs.json`, and the workbench colours and the syntax rules sit at different levels
// of it. Stopping at the first file yields a theme with a background and no highlighting.
//
// Bounded in three ways, because this reads files chosen by whatever extensions the user installed:
// a byte cap per file, a depth cap on the chain, and a containment check so an `include` cannot
// walk out of the directory it started in. `themeIncludePath` already refuses `..` and absolute
// paths; the resolved-path check here is the belt to that braces, since a symlink inside the
// directory could still point outside it.

import { readFile, realpath } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

import { parseJsonc } from '../../shared/jsonc-parse'
import {
  mergeVscodeThemeDocuments,
  themeIncludePath,
  type VscodeThemeDocument
} from '../../shared/vscode-theme-merge'

/** A megabyte. The largest real theme file on the machine this was written against was 32 KB. */
export const MAX_THEME_FILE_BYTES = 1_000_000

/** Four files is the real depth of VS Code's own default; ten leaves room without unbounding it. */
const MAX_INCLUDE_DEPTH = 10

export type ThemeDocumentReadEnv = {
  /** Null for a file that cannot be read or is over the cap. */
  readTextFile: (path: string) => Promise<string | null>
  /** Symlinks resolved, or the input when it cannot be resolved. */
  realPath: (path: string) => Promise<string>
}

export function createDefaultThemeDocumentReadEnv(): ThemeDocumentReadEnv {
  return {
    readTextFile: async (path) => {
      try {
        const contents = await readFile(path, 'utf8')
        // Checked after reading rather than by stat: a stat plus a read is two chances for the file
        // to change underneath, and a megabyte of string is cheap to discard.
        return contents.length > MAX_THEME_FILE_BYTES ? null : contents
      } catch {
        return null
      }
    },
    realPath: async (path) => {
      try {
        return await realpath(path)
      } catch {
        return path
      }
    }
  }
}

export type ThemeDocumentResult = {
  document: VscodeThemeDocument
  /** Every file that contributed, outermost first. Useful when reporting what was read. */
  files: string[]
}

/** True when `candidate` is inside `root`, with the separator checked so a sibling cannot pass. */
function isContained(root: string, candidate: string): boolean {
  const normalizedRoot = root.endsWith('/') ? root : `${root}/`
  return candidate === root || candidate.startsWith(normalizedRoot)
}

/**
 * The theme at `filePath`, merged with everything it includes.
 *
 * Null when the outermost file cannot be read or parsed. A broken file PART WAY down the chain is
 * not fatal: what has been merged so far is still a usable theme, and refusing the whole import
 * because a base file went missing would take a working theme off the list for a reason the user
 * cannot act on.
 */
export async function readThemeDocument(
  filePath: string,
  containingDir: string,
  env: ThemeDocumentReadEnv = createDefaultThemeDocumentReadEnv()
): Promise<ThemeDocumentResult | null> {
  const rootReal = await env.realPath(containingDir)
  const files: string[] = []
  const seen = new Set<string>()

  let current: string | null = filePath
  // Collected outermost first, then merged from the inside out so the derived file wins.
  const documents: VscodeThemeDocument[] = []

  for (let depth = 0; depth < MAX_INCLUDE_DEPTH && current !== null; depth += 1) {
    const real = await env.realPath(current)
    // A chain that revisits a file is a cycle, and one that leaves the directory is not ours to
    // follow. Both stop the walk and keep what has already been merged.
    if (seen.has(real) || !isContained(rootReal, real)) {
      break
    }
    seen.add(real)

    const text = await env.readTextFile(current)
    if (text === null) {
      break
    }
    const parsed = parseJsonc<VscodeThemeDocument>(text)
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      break
    }
    files.push(current)
    documents.push(parsed)

    const include = themeIncludePath(parsed)
    current = include === null ? null : resolve(dirname(current), include)
  }

  if (documents.length === 0) {
    return null
  }

  // Innermost first: each step layers the more derived document over what is beneath it.
  let merged = documents.at(-1) as VscodeThemeDocument
  for (let index = documents.length - 2; index >= 0; index -= 1) {
    merged = mergeVscodeThemeDocuments(merged, documents[index])
  }
  return { document: merged, files }
}
