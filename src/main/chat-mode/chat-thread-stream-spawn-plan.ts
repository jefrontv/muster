// Shell, args, and environment for a chat-thread stream child. Kept apart from
// the registry so the process-lifecycle module stays about lifecycle.

import { homedir } from 'node:os'
import { loginShellEnvironmentDelta } from '../startup/login-shell-environment'

// Stale inherited hook coordinates would route this child's hook POSTs to a
// dead receiver; strip them before injecting the live server's env.
const INHERITED_HOOK_ENV_KEYS = [
  'ORCA_AGENT_HOOK_PORT',
  'ORCA_AGENT_HOOK_TOKEN',
  'ORCA_AGENT_HOOK_ENV',
  'ORCA_AGENT_HOOK_VERSION',
  'ORCA_AGENT_HOOK_ENDPOINT'
] as const

export type ChatThreadStreamSpawnPlan = {
  shellPath: string
  args: string[]
  options: { cwd: string; env: NodeJS.ProcessEnv }
}

export function buildChatThreadStreamSpawnPlan(args: {
  command: string
  cwd?: string
  env?: Record<string, string>
  hookEnv?: () => Record<string, string>
  /** What a login shell would contribute; null means spawn one instead. */
  loginShellEnv?: () => Record<string, string> | null
}): ChatThreadStreamSpawnPlan {
  const { command, cwd, env } = args
  const mergedEnv: NodeJS.ProcessEnv = { ...process.env }
  for (const key of INHERITED_HOOK_ENV_KEYS) {
    delete mergedEnv[key]
  }
  // Sourcing the user's profile costs 0.3-1.8s and produces the same result
  // every time, so a captured copy replaces the login shell once it is ready.
  // Null means not captured (yet, or at all) — fall back to paying for it.
  const loginEnv = (args.loginShellEnv ?? loginShellEnvironmentDelta)()
  Object.assign(mergedEnv, loginEnv ?? {}, env ?? {}, args.hookEnv?.() ?? {})

  return {
    // Same default-shell resolution the local PTY provider uses for POSIX spawns.
    shellPath: env?.SHELL || process.env.SHELL || '/bin/zsh',
    args: [loginEnv ? '-c' : '-lc', command],
    options: {
      // Standalone chats have no workspace dir; home beats inheriting the
      // Electron process cwd (repo dir in dev, filesystem root when packaged).
      cwd: cwd ?? homedir(),
      env: mergedEnv
    }
  }
}
