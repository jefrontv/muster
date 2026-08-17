// Context-window size per Claude model id, for the composer usage meter.
//
// The authoritative number is what the CLI itself reports (stream-json result
// modelUsage[].contextWindow) — this map is the fallback for surfaces that only
// have a transcript, where no window is recorded. Sizes are evidence-based:
// transcripts on this machine show fable at 681k and opus-5 at 911k used, so
// the old blanket 200k rendered nonsense like "307k/200k".

export const DEFAULT_CLAUDE_CONTEXT_WINDOW_TOKENS = 200_000

const ONE_MILLION_TOKENS = 1_000_000

// Substring matches against the transcript's model id (e.g. "claude-fable-5",
// "claude-opus-4-8", "claude-sonnet-4-5[1m]"). sonnet-5 stays at the default:
// observed usage never meaningfully exceeds 200k, and the meter's
// max(used, window) guard absorbs any drift without lying.
const ONE_MILLION_MODEL_MARKERS = ['[1m]', '-1m', 'fable', 'mythos', 'opus-5', 'opus-4-8']

export function claudeContextWindowForModel(model: string | null | undefined): number {
  const id = (model ?? '').toLowerCase()
  if (id && ONE_MILLION_MODEL_MARKERS.some((marker) => id.includes(marker))) {
    return ONE_MILLION_TOKENS
  }
  return DEFAULT_CLAUDE_CONTEXT_WINDOW_TOKENS
}
