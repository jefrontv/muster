// Events an in-progress extension install or update sends to the window watching it.
//
// A tagged union rather than a status object, because the renderer appends output as it arrives and
// there is no sensible "current output" snapshot to poll for.

export type ExtensionCommandRunEvent =
  | { kind: 'started'; id: string; command: string }
  | { kind: 'output'; id: string; chunk: string }
  /**
   * `installed` is re-probed AFTER the command, because a package manager can exit 0 and leave
   * nothing usable behind — an npm git install whose package never builds leaves a dangling
   * symlink. Reporting "Done." off the exit code alone would be a lie the user then has to debug.
   */
  | {
      kind: 'finished'
      id: string
      code: number
      timedOut: boolean
      installed: boolean
      /** Labels of the agents the install registered the server with, for the dialog to name. */
      registeredHarnesses: string[]
    }

export type ExtensionRunPhase = 'idle' | 'running' | 'succeeded' | 'failed'

/** Lines a package manager uses to say what actually went wrong, most specific first. */
const CAUSE_PATTERNS = [/^\s*Caused by:\s*(.+)$/i, /^\s*error:\s*(.+)$/i, /^(.*\bfailed\b.*)$/i]

/**
 * Pulls the line worth putting in front of the user out of the captured output.
 *
 * "Exited with code 1" tells nobody anything. The real message is in the output, and making the
 * reader open a disclosure to find out what broke defeats the point of running it here.
 */
export function summarizeExtensionRunError(output: string): string | null {
  const lines = output
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
  for (const pattern of CAUSE_PATTERNS) {
    for (const line of lines) {
      const match = pattern.exec(line)
      if (match) {
        return match[1].trim().slice(0, 240)
      }
    }
  }
  return lines.at(-1)?.slice(0, 240) ?? null
}

export const EXTENSION_RUN_PRODUCED_NOTHING =
  'The command finished without errors, but the program still is not on this machine. It may have failed to build.'

export function describeExtensionRunFailure(
  code: number,
  timedOut: boolean,
  output = ''
): string {
  if (timedOut) {
    return 'The command ran past its time limit and was stopped.'
  }
  if (code === -1) {
    return 'The command was stopped.'
  }
  return summarizeExtensionRunError(output) ?? `The command exited with code ${code}.`
}
