// Waiting on a person inside one tool call, without outliving the client's request deadline.
//
// Clients cap a call at their own fixed deadline (OMP/PI 30s, the MCP TypeScript SDK 60s, Claude
// Code's per-server timeout), and progress notifications only MAY reset it. So the default hold fits
// under the tightest one for every client, a progress token buys no extra time, and each bridge
// request is a short slice so nothing in between (undici's 300s headers timeout) can cut it off.

import type { SiteMcpContext } from './site-mcp-context'

export const HOLD_DEFAULT_SECONDS = 25
export const HOLD_MAX_SECONDS = 1_800
export const HOLD_SLICE_MS = 10_000

/** Calls `attempt` in slices until `done` or `waitSeconds` runs out, with a progress line between. */
export async function holdInSlices<T>(args: {
  context: SiteMcpContext
  waitSeconds: number
  attempt: (waitMs: number) => Promise<T>
  done: (answer: T) => boolean
  describe: (answer: T) => string
}): Promise<T> {
  const deadline = Date.now() + args.waitSeconds * 1_000
  const slice = (): number => Math.min(HOLD_SLICE_MS, Math.max(0, deadline - Date.now()))
  let ticks = 0
  for (;;) {
    const waitMs = slice()
    const started = Date.now()
    const answer = await args.attempt(waitMs)
    // An early "not yet" means the other side does not hold (an older Muster); looping would spin.
    const heldShort = Date.now() - started < waitMs / 2
    if (args.done(answer) || heldShort || Date.now() >= deadline) {
      return answer
    }
    ticks += 1
    // Monotonic with no total: a person has no known end, and the spec only asks progress to rise.
    args.context.progress?.({ message: args.describe(answer), progress: ticks })
  }
}
