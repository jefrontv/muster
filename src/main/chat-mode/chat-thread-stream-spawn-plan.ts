// Executable, args, and environment for a chat-thread stream child. Kept apart
// from the registry so the process-lifecycle module stays about lifecycle.

import { homedir } from 'node:os'
import {
  chatCommandArgv,
  chatEnvValue,
  resolveChatExecutable,
  windowsShimCommandLine
} from './chat-thread-stream-argv'
import { loginShellEnvironmentDelta } from '../startup/login-shell-environment'
import { applyClaudeEnvPatch } from '../claude-accounts/environment'
import type { ClaudeRuntimeAuthPreparation } from '../claude-accounts/runtime-auth-service'

// Stale inherited hook coordinates would route this child's hook POSTs to a
// dead receiver; strip them before injecting the live server's env.
const INHERITED_HOOK_ENV_KEYS = [
  'ORCA_AGENT_HOOK_PORT',
  'ORCA_AGENT_HOOK_TOKEN',
  'ORCA_AGENT_HOOK_ENV',
  'ORCA_AGENT_HOOK_VERSION',
  'ORCA_AGENT_HOOK_ENDPOINT'
] as const

export type ChatThreadStreamSpawnPlan =
  | {
      ok: true
      file: string
      args: string[]
      options: { cwd: string; env: NodeJS.ProcessEnv; windowsVerbatimArguments?: boolean }
    }
  | { ok: false; error: string }

const posixQuote = (value: string): string =>
  /^[\w@%+=:,./-]+$/.test(value) ? value : `'${value.replace(/'/g, `'\\''`)}'`

export function buildChatThreadStreamSpawnPlan(args: {
  /** POSIX-quoted; spawned directly when it needs no shell. */
  command: string
  /** Appended after the command's own args. */
  extraArgs?: readonly string[]
  cwd?: string
  env?: Record<string, string>
  hookEnv?: () => Record<string, string>
  /** What a login shell would contribute; null means spawn one instead. */
  loginShellEnv?: () => Record<string, string> | null
  claudeAuth?: ClaudeRuntimeAuthPreparation
  platform?: NodeJS.Platform
  resolveExecutable?: (name: string, env: NodeJS.ProcessEnv) => string | null
}): ChatThreadStreamSpawnPlan {
  const { command, cwd, env } = args
  const extraArgs = args.extraArgs ?? []
  const platform = args.platform ?? process.platform
  const windows = platform === 'win32'
  const mergedEnv: NodeJS.ProcessEnv = { ...process.env }
  for (const key of INHERITED_HOOK_ENV_KEYS) {
    delete mergedEnv[key]
  }
  // Sourcing the user's profile costs 0.3-1.8s and produces the same result
  // every time, so a captured copy replaces the login shell once it is ready.
  // Null means not captured (yet, or at all) — fall back to paying for it.
  const loginEnv = (args.loginShellEnv ?? loginShellEnvironmentDelta)()
  Object.assign(mergedEnv, loginEnv ?? {}, env ?? {}, args.hookEnv?.() ?? {})
  if (args.claudeAuth) {
    // Last, so a profile-exported ANTHROPIC_API_KEY cannot override the managed account.
    applyClaudeEnvPatch(mergedEnv as Record<string, string>, args.claudeAuth.envPatch, {
      stripAuthEnv: args.claudeAuth.stripAuthEnv
    })
  }

  const options = {
    // Standalone chats have no workspace dir; home beats inheriting the
    // Electron process cwd (repo dir in dev, filesystem root when packaged).
    cwd: cwd ?? homedir(),
    env: mergedEnv
  }

  const argv = chatCommandArgv(command)
  // Without the profile's PATH a direct spawn can find a different claude than the terminal does.
  const file =
    argv && (windows || loginEnv)
      ? (
          args.resolveExecutable ??
          ((name, searchEnv) =>
            resolveChatExecutable(name, searchEnv, { platform, cwd: options.cwd }))
        )(argv[0]!, mergedEnv)
      : null
  if (argv && file) {
    const rest = [...argv.slice(1), ...extraArgs]
    if (windows && /\.(cmd|bat)$/i.test(file)) {
      return {
        ok: true,
        file: chatEnvValue(mergedEnv, 'COMSPEC') ?? 'cmd.exe',
        args: ['/d', '/s', '/c', windowsShimCommandLine(file, rest)],
        options: { ...options, windowsVerbatimArguments: true }
      }
    }
    return { ok: true, file, args: rest, options }
  }
  if (windows) {
    return {
      ok: false,
      error: argv
        ? 'Claude Code was not found on PATH. Install it, then start the chat again.'
        : 'The Claude command override uses shell syntax, which chats on Windows cannot run.'
    }
  }
  return {
    ok: true,
    // Same default-shell resolution the local PTY provider uses for POSIX spawns.
    file: env?.SHELL || process.env.SHELL || '/bin/zsh',
    args: [loginEnv ? '-c' : '-lc', [command, ...extraArgs.map(posixQuote)].join(' ')],
    options
  }
}
