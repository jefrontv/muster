// CI status for the commits listed in the Commits panel, keyed by full commit hash.
//
// Provider-neutral on purpose: Bitbucket Pipelines, GitHub check rollups and GitLab pipelines all
// collapse to the same handful of states, and the row only ever draws one icon per commit.

/** Paused means waiting on a person (a manual step), so it is drawn as idle and never polled. */
export type CommitPipelineStatus =
  | 'running'
  | 'pending'
  | 'paused'
  | 'success'
  | 'failure'
  | 'stopped'
  | 'skipped'

export type CommitPipelineRun = {
  status: CommitPipelineStatus
  /** The provider's run number when it has one ("#412"); null for a GitHub check rollup. */
  runNumber: number | null
  durationSeconds: number | null
  /** Only known for an in-flight Bitbucket run; naming it costs an extra call per poll. */
  currentStep: string | null
  /** Epoch ms. Lets the renderer stop polling a run that has been "running" for days. */
  startedAt: number | null
  /** The page a person wants, not the API resource. */
  url: string | null
}

/**
 * Every reason is a quiet "hide the column": a GitHub repo with no CI, a signed-out user and a
 * token missing the pipeline scope are ordinary states, not errors worth a row of grey icons.
 */
export type CommitPipelinesUnavailable =
  | 'no-provider'
  | 'not-authenticated'
  | 'forbidden'
  | 'not-found'
  | 'unsupported-host'

export type CommitPipelinesResult =
  | { available: true; runsBySha: Record<string, CommitPipelineRun> }
  | { available: false; reason: CommitPipelinesUnavailable }

export type CommitPipelinesArgs = {
  worktreePath: string
  connectionId?: string
  /** Full hashes of the commits on screen; nothing outside this list is looked up. */
  shas: string[]
}

/** Matches the Commits panel's history limit, so one request covers every listed commit. */
export const COMMIT_PIPELINES_MAX_SHAS = 50

export function isCommitPipelineInFlight(status: CommitPipelineStatus): boolean {
  return status === 'running' || status === 'pending'
}

/**
 * First mappable run per requested commit, matched by full hash. `runs` must be newest first, as
 * the pipelines list endpoints return them, so "first" is "latest".
 */
export function latestRunPerCommit(
  runs: readonly { sha: string | null; run: CommitPipelineRun | null }[],
  shas: readonly string[]
): Record<string, CommitPipelineRun> {
  const wanted = new Map(shas.map((sha) => [sha.toLowerCase(), sha]))
  const runsBySha: Record<string, CommitPipelineRun> = {}
  for (const { sha: runSha, run } of runs) {
    const sha = runSha ? wanted.get(runSha.toLowerCase()) : undefined
    if (sha && run && !runsBySha[sha]) {
      runsBySha[sha] = run
    }
  }
  return runsBySha
}
