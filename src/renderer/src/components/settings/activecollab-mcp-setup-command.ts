// Builds the shell command line that drives `activecollab-mcp setup` inside a Muster PTY.
//
// Muster's PTY spawn always launches the user's shell and delivers the command into it —
// `shellOverride` in src/main/providers/local-pty-provider.ts is Windows-only, so there is no argv
// channel. That makes this shell syntax rather than an argument list, and two consequences follow:
//
//  1. The absolute binary path is mandatory. `~/.local/bin` is routinely absent from a GUI app's
//     inherited PATH even when the user's login shell has it — the same reason
//     detectActiveCollabMcp() in src/main/activecollab/mcp-install.ts probes that directory
//     directly. A bare `activecollab-mcp` therefore works in a developer's shell and fails for
//     real users.
//  2. The trailing `exit` is what makes completion observable. The PTY belongs to the shell, not to
//     setup, so without it the shell drops back to a prompt when setup returns and the card never
//     learns that new agents were registered.

import { isPowerShellProcess } from '../../../../shared/shell-process-detection'

export const ACTIVECOLLAB_MCP_SETUP_SUBCOMMAND = 'setup'

/**
 * The shell line to hand `pty:spawn`, or null when the detected path cannot be expressed safely.
 *
 * Null is a real outcome, not a defensive stub: cmd.exe can neither quote a `"` nor suppress `%`
 * expansion inside a quoted span, so such a path would run as something other than what was
 * detected. Refusing beats guessing.
 */
export function buildActiveCollabMcpSetupCommand(args: {
  binaryPath: string | null
  platform: NodeJS.Platform
  /** `settings.terminalWindowsShell`; ignored off Windows, where the PTY always launches $SHELL. */
  windowsShell?: string | null
}): string | null {
  const binaryPath = args.binaryPath?.trim() ?? ''
  // A line break would submit a truncated command and then run the remainder as a second one.
  if (binaryPath.length === 0 || /[\r\n]/.test(binaryPath)) {
    return null
  }

  if (args.platform === 'win32') {
    if (isPowerShellProcess(args.windowsShell)) {
      // PowerShell doubles an embedded `'`, and needs `&` because a quoted string alone is a value.
      const quoted = `'${binaryPath.replaceAll("'", "''")}'`
      return `& ${quoted} ${ACTIVECOLLAB_MCP_SETUP_SUBCOMMAND}; exit`
    }
    const shellName = (args.windowsShell ?? '').trim().split(/[\\/]/).pop() ?? ''
    // Git Bash and WSL are also configurable Windows shells, and both speak POSIX quoting.
    if (shellName.replace(/\.exe$/i, '').toLowerCase() === 'cmd') {
      if (/["%]/.test(binaryPath)) {
        return null
      }
      // `&` not `&&`: the shell must close even when setup exits non-zero.
      return `"${binaryPath}" ${ACTIVECOLLAB_MCP_SETUP_SUBCOMMAND} & exit`
    }
  }

  // Inside POSIX single quotes only `'` retains meaning, so close/escape/reopen is the whole rule.
  const quoted = `'${binaryPath.replaceAll("'", `'\\''`)}'`
  return `${quoted} ${ACTIVECOLLAB_MCP_SETUP_SUBCOMMAND}; exit`
}
