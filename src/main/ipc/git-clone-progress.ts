// Turns git clone's stderr into one overall percentage. git reports each phase 0-100 on its own,
// some prefixed "remote:", so a raw phase percent restarts at 0 and skips the server-side work.

type ClonePhase = { start: number; weight: number }

// Shares of the whole clone. Receiving dominates on a real repo; the server-side phases are small
// but can take minutes on a big one, so they still move the bar.
const PHASES: Record<string, ClonePhase> = {
  'counting objects': { start: 0, weight: 5 },
  'compressing objects': { start: 5, weight: 10 },
  'receiving objects': { start: 15, weight: 60 },
  'resolving deltas': { start: 75, weight: 15 },
  'updating files': { start: 90, weight: 10 }
}

const PROGRESS_LINE = /^(?:remote:\s*)?([A-Za-z][A-Za-z ]*?):\s+(\d{1,3})%/

export type CloneProgress = { phase: string; percent: number }

export function parseCloneProgressLine(line: string): { phase: string; percent: number } | null {
  const match = line.trim().match(PROGRESS_LINE)
  if (!match) {
    return null
  }
  return { phase: match[1].trim(), percent: Math.min(100, Number.parseInt(match[2], 10)) }
}

/** Overall percent for one phase line; null for a phase git prints that we don't weight. */
export function overallClonePercent(phase: string, phasePercent: number): number | null {
  const weights = PHASES[phase.toLowerCase()]
  return weights ? Math.round(weights.start + (weights.weight * phasePercent) / 100) : null
}

export function createCloneProgressTracker(): {
  /** Feeds a stderr chunk; returns complete lines and the progress updates they carry. */
  push: (chunk: string) => { lines: string[]; updates: CloneProgress[] }
} {
  let partial = ''
  let best = 0
  return {
    push(chunk) {
      // git rewrites progress in place with \r, and a chunk can end mid-line.
      const pieces = (partial + chunk).split(/[\r\n]/)
      partial = pieces.pop() ?? ''
      const lines: string[] = []
      const updates: CloneProgress[] = []
      for (const piece of pieces) {
        const line = piece.trim()
        if (!line) {
          continue
        }
        lines.push(line)
        const parsed = parseCloneProgressLine(line)
        const overall = parsed ? overallClonePercent(parsed.phase, parsed.percent) : null
        if (parsed && overall !== null) {
          // Never backwards: a late duplicate or a skipped phase must not pull the bar down.
          best = Math.max(best, overall)
          updates.push({ phase: parsed.phase, percent: best })
        }
      }
      return { lines, updates }
    }
  }
}
