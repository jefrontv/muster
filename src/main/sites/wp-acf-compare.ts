// Merges one local and one remote read of the same paths into a single answer.
//
// Pure: it takes the two envelopes the walker already produced and never touches a transport. The
// point is the diff, so each entry keeps both values side by side and the caller reads differs_count
// first. A side that failed carries its own error rather than poisoning the whole comparison.

export type AcfCompareEnvelope = Record<string, unknown>

export type AcfCompareOutcome = {
  ok: boolean
  location: 'both'
  site: unknown
  environment: unknown
  differs_count: number
  local: Record<string, unknown>
  remote: Record<string, unknown>
  results: Record<string, unknown>[]
}

// Key order out of PHP follows field order, not a sort, so two equal values can serialise apart.
function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value ?? null)
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonical).join(',')}]`
  }
  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
    a < b ? -1 : a > b ? 1 : 0
  )
  return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(',')}}`
}

function rowsByPath(envelope: AcfCompareEnvelope): Map<string, Record<string, unknown>> {
  const results = Array.isArray(envelope.results) ? envelope.results : []
  const map = new Map<string, Record<string, unknown>>()
  for (const entry of results) {
    if (entry !== null && typeof entry === 'object' && !Array.isArray(entry)) {
      const row = entry as Record<string, unknown>
      if (typeof row.path === 'string') {
        map.set(row.path, row)
      }
    }
  }
  return map
}

// checksum mode answers with a digest where get answers with a value; both compare the same way.
function sideValue(row: Record<string, unknown> | undefined): unknown {
  if (!row) {
    return null
  }
  return 'value' in row ? row.value : 'digest' in row ? row.digest : null
}

function sideError(row: Record<string, unknown> | undefined): string | undefined {
  return typeof row?.error === 'string' ? row.error : undefined
}

function indexKey(indexPath: unknown): string {
  return Array.isArray(indexPath) ? indexPath.join('.') : String(indexPath)
}

function matchesByIndex(
  row: Record<string, unknown> | undefined
): Map<string, Record<string, unknown>> {
  const matches = Array.isArray(row?.matches) ? row.matches : []
  const map = new Map<string, Record<string, unknown>>()
  for (const entry of matches) {
    if (entry !== null && typeof entry === 'object' && !Array.isArray(entry)) {
      const match = entry as Record<string, unknown>
      map.set(indexKey(match.index_path), match)
    }
  }
  return map
}

function comparePattern(
  path: string,
  local: Record<string, unknown> | undefined,
  remote: Record<string, unknown> | undefined
): Record<string, unknown> {
  const localMatches = matchesByIndex(local)
  const remoteMatches = matchesByIndex(remote)
  const matches: Record<string, unknown>[] = []
  const onlyLocal: unknown[] = []
  const onlyRemote: unknown[] = []
  for (const [key, match] of localMatches) {
    const peer = remoteMatches.get(key)
    if (!peer) {
      onlyLocal.push(match.index_path)
      continue
    }
    const differs = canonical(sideValue(match)) !== canonical(sideValue(peer))
    matches.push({
      index_path: match.index_path,
      local: sideValue(match),
      remote: sideValue(peer),
      differs
    })
  }
  for (const [key, match] of remoteMatches) {
    if (!localMatches.has(key)) {
      onlyRemote.push(match.index_path)
    }
  }
  const field = local?.field ?? remote?.field
  return {
    path,
    ...(field === undefined ? {} : { field }),
    count: { local: localMatches.size, remote: remoteMatches.size },
    matches,
    only_local: onlyLocal,
    only_remote: onlyRemote
  }
}

function comparePath(
  path: string,
  local: Record<string, unknown> | undefined,
  remote: Record<string, unknown> | undefined
): Record<string, unknown> {
  const localError = sideError(local)
  const remoteError = sideError(remote)
  const field = local?.field ?? remote?.field
  const exists = {
    local: local?.exists !== false && local !== undefined,
    remote: remote?.exists !== false && remote !== undefined
  }
  return {
    path,
    ...(field === undefined ? {} : { field }),
    local: exists.local ? sideValue(local) : null,
    remote: exists.remote ? sideValue(remote) : null,
    // A side that errored cannot be compared, so differs is null rather than a guess.
    differs:
      localError || remoteError
        ? null
        : canonical(exists.local ? sideValue(local) : null) !==
          canonical(exists.remote ? sideValue(remote) : null),
    ...(exists.local && exists.remote ? {} : { exists }),
    ...(localError || remoteError
      ? {
          error: {
            ...(localError ? { local: localError } : {}),
            ...(remoteError ? { remote: remoteError } : {})
          }
        }
      : {})
  }
}

function entryDiffers(entry: Record<string, unknown>): boolean {
  if (Array.isArray(entry.matches)) {
    const changed = entry.matches.some(
      (match) => (match as Record<string, unknown>).differs === true
    )
    const onlyLocal = Array.isArray(entry.only_local) ? entry.only_local.length : 0
    const onlyRemote = Array.isArray(entry.only_remote) ? entry.only_remote.length : 0
    return changed || onlyLocal > 0 || onlyRemote > 0
  }
  return entry.differs === true
}

// Everything but the rows: ok, home, acf_version, warnings, target_digest and any error.
function sideSummary(envelope: AcfCompareEnvelope): Record<string, unknown> {
  const {
    results: _results,
    location: _location,
    site: _site,
    site_id: _siteId,
    ...rest
  } = envelope
  return rest
}

export function compareAcfEnvelopes(
  local: AcfCompareEnvelope,
  remote: AcfCompareEnvelope
): AcfCompareOutcome {
  const localRows = rowsByPath(local)
  const remoteRows = rowsByPath(remote)
  const paths = [...localRows.keys()]
  for (const path of remoteRows.keys()) {
    if (!localRows.has(path)) {
      paths.push(path)
    }
  }
  const results = paths.map((path) => {
    const localRow = localRows.get(path)
    const remoteRow = remoteRows.get(path)
    const pattern = Array.isArray(localRow?.matches) || Array.isArray(remoteRow?.matches)
    return pattern
      ? comparePattern(path, localRow, remoteRow)
      : comparePath(path, localRow, remoteRow)
  })
  return {
    ok: local.ok !== false && remote.ok !== false,
    location: 'both',
    site: local.site ?? remote.site,
    environment: remote.environment ?? null,
    differs_count: results.filter(entryDiffers).length,
    local: sideSummary(local),
    remote: sideSummary(remote),
    results
  }
}
