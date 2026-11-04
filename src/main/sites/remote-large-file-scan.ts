// The pre-copy size check: what the import is about to zip that is far bigger than a site needs.
//
// It walks exactly the trees and prune lists the zip step uses (importArchiveTrees), so it costs a
// metadata pass over files the zip would read in full anyway, and never enters uploads. Sizes are
// summed on the server and only the flagged lines come back.

import {
  importPathCovers,
  LARGE_IMPORT_FILE_BYTES,
  LARGE_IMPORT_FOLDER_BYTES,
  type SiteImportFileRule,
  type SiteImportLargeEntry
} from '../../shared/site-import-file-rules'
import { quoteShellArgument, type RemoteLayout, type SiteSshSession } from './pipeline-contract'
import { findPrunedFiles, type ImportArchiveTree, importArchiveTrees } from './remote-file-archive'

/** Long enough for a large plugin tree on a slow host; past it the import goes ahead unchecked. */
const SCAN_TIMEOUT_MS = 120_000
/** A runaway listing must not flood the dialog. */
const MAX_ENTRIES = 60

/**
 * `du -k` per file (portable to BSD and GNU, unlike `find -printf`), then awk keeps big files and
 * totals each top-level folder. Output lines: `F<TAB>kb<TAB>path` and `D<TAB>kb<TAB>folder`.
 */
export function buildLargeEntryScanCommand(
  tree: ImportArchiveTree,
  limits = { fileBytes: LARGE_IMPORT_FILE_BYTES, folderBytes: LARGE_IMPORT_FOLDER_BYTES }
): string {
  const fileKb = Math.floor(limits.fileBytes / 1024)
  const folderKb = Math.floor(limits.folderBytes / 1024)
  const awk = [
    '{ kb = $1; p = $0; sub(/^[0-9]+[ \\t]+/, "", p); sub(/^\\.\\//, "", p);',
    '  if (kb >= F) print "F\\t" kb "\\t" p;',
    '  n = index(p, "/"); if (n > 0) total[substr(p, 1, n - 1)] += kb }',
    'END { for (d in total) if (total[d] >= D) print "D\\t" total[d] "\\t" d }'
  ].join(' ')
  return [
    `cd ${quoteShellArgument(tree.workDir)} &&`,
    `${findPrunedFiles(tree.pruneDirs, tree.excludeGlobs)} -exec du -k {} + 2>/dev/null |`,
    `awk -v F=${fileKb} -v D=${folderKb} ${quoteShellArgument(awk)}`
  ].join(' ')
}

export function parseLargeEntryScan(stdout: string, prefix: string): SiteImportLargeEntry[] {
  const entries: SiteImportLargeEntry[] = []
  for (const line of stdout.split('\n')) {
    const [kind, kb, ...rest] = line.split('\t')
    const relative = rest.join('\t')
    const size = Number(kb)
    if ((kind !== 'F' && kind !== 'D') || !relative || !Number.isFinite(size)) {
      continue
    }
    entries.push({
      path: `${prefix}${relative}`,
      kind: kind === 'F' ? 'file' : 'folder',
      bytes: size * 1024
    })
  }
  return entries
}

/** Folders first and biggest first, files under a listed folder kept so either can be chosen. */
function orderEntries(entries: SiteImportLargeEntry[]): SiteImportLargeEntry[] {
  const folders = entries
    .filter((entry) => entry.kind === 'folder')
    .sort((a, b) => b.bytes - a.bytes)
  const files = entries.filter((entry) => entry.kind === 'file').sort((a, b) => b.bytes - a.bytes)
  const ordered: SiteImportLargeEntry[] = []
  for (const folder of folders) {
    ordered.push(folder, ...files.filter((file) => importPathCovers(folder.path, file.path)))
  }
  ordered.push(...files.filter((file) => !folders.some((f) => importPathCovers(f.path, file.path))))
  return ordered.slice(0, MAX_ENTRIES)
}

/**
 * Large items the import would copy that no rule already decides. Skipped paths are pruned, so
 * nothing inside them is walked; kept paths are walked but not asked about again.
 */
export async function scanLargeImportEntries(
  session: SiteSshSession,
  layout: RemoteLayout,
  rules: readonly SiteImportFileRule[]
): Promise<SiteImportLargeEntry[]> {
  const skips = rules.filter((rule) => rule.action === 'skip').map((rule) => rule.path)
  const keeps = rules.filter((rule) => rule.action === 'keep').map((rule) => rule.path)
  const trees = importArchiveTrees(layout, skips)
  const found: SiteImportLargeEntry[] = []
  for (const tree of [trees.base, trees.content]) {
    const result = await session.exec(buildLargeEntryScanCommand(tree), {
      timeoutMs: SCAN_TIMEOUT_MS
    })
    if (result.code !== 0 && result.stdout.trim() === '') {
      throw new Error(result.stderr.trim() || `size check exited ${result.code}`)
    }
    found.push(...parseLargeEntryScan(result.stdout, tree.prefix))
  }
  return orderEntries(
    found.filter((entry) => !keeps.some((keep) => importPathCovers(keep, entry.path)))
  )
}
