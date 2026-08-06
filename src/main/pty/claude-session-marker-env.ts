// Claude Code stamps every process it spawns so nested `claude` runs know they are children
// (and disable transcript persistence, among other things). A Muster instance launched from
// inside a Claude session — a dev launching from an agent terminal, `open` forwarding the caller's
// environment — inherits those stamps, and the daemon then hands them to every user terminal:
// the user's own `claude` sessions report "inherited CLAUDE_CODE_CHILD_SESSION marker" and stop
// saving transcripts. The markers describe MUSTER'S launch context, never the user's terminal,
// so they are always stripped from the inherited base env. A caller-provided env still wins.

const CLAUDE_SESSION_MARKER_KEYS = [
  'CLAUDECODE',
  'CLAUDE_CODE_CHILD_SESSION',
  'CLAUDE_CODE_SESSION_ID',
  'CLAUDE_CODE_ENTRYPOINT'
] as const

/** Return a copy of an inherited environment without Claude Code's session markers. */
export function stripInheritedClaudeSessionMarkers(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const next = { ...env }
  for (const key of CLAUDE_SESSION_MARKER_KEYS) {
    delete next[key]
  }
  return next
}
