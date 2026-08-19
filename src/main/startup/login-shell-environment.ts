// What a login shell adds to the environment, captured once per app run.
//
// Why: every chat session spawns through `zsh -lc`, and sourcing the user's
// profile costs 0.3–1.8s on a normal machine — paid again on every launch, for
// an environment that does not change while the app is open. Capturing the
// login shell's contribution once lets the spawn use a plain `-c` shell and
// skip that entirely.
//
// The delta is measured against a non-login shell rather than against
// process.env, so it contains exactly what `-l` contributes and nothing from
// Electron's own environment.

import { spawn } from 'node:child_process'

const SPAWN_TIMEOUT_MS = 5_000

/**
 * Vars that differ between two shells for reasons unrelated to the profile.
 * Copying these forward would pin a stale working directory or nesting depth
 * onto every future child.
 */
const VOLATILE_KEYS = new Set([
  '_',
  'SHLVL',
  'PWD',
  'OLDPWD',
  'ZSH_EXECUTION_STRING',
  'RANDOM',
  'SECONDS',
  'EPOCHREALTIME',
  'EPOCHSECONDS',
  'LINENO',
  'COLUMNS',
  'LINES'
])

let delta: Record<string, string> | null = null
let priming: Promise<void> | null = null

/** @internal - tests need a clean capture between cases. */
export function _resetLoginShellEnvironmentForTests(): void {
  delta = null
  priming = null
}

function pickShell(): string | null {
  if (process.platform === 'win32') {
    return null
  }
  return process.env.SHELL || (process.platform === 'darwin' ? '/bin/zsh' : '/bin/bash')
}

/** `env -0` so values containing newlines survive the round trip intact. */
function readEnv(shell: string, args: string[]): Promise<Record<string, string> | null> {
  return new Promise((resolve) => {
    let stdout = ''
    let settled = false
    const finish = (value: Record<string, string> | null): void => {
      if (settled) {
        return
      }
      settled = true
      clearTimeout(timer)
      resolve(value)
    }
    const timer = setTimeout(() => {
      try {
        child.kill('SIGKILL')
      } catch {
        // Already gone.
      }
      finish(null)
    }, SPAWN_TIMEOUT_MS)

    let child: ReturnType<typeof spawn>
    try {
      child = spawn(shell, [...args, 'env -0'], {
        env: process.env,
        // Profile banners and p10k instant-prompt noise go to stderr; ignore it.
        stdio: ['ignore', 'pipe', 'ignore']
      })
    } catch {
      finish(null)
      return
    }
    child.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8')
    })
    child.on('error', () => finish(null))
    child.on('close', () => finish(parseEnvZero(stdout)))
  })
}

export function parseEnvZero(stdout: string): Record<string, string> | null {
  const parsed: Record<string, string> = {}
  for (const record of stdout.split('\0')) {
    const separator = record.indexOf('=')
    if (separator > 0) {
      parsed[record.slice(0, separator)] = record.slice(separator + 1)
    }
  }
  return Object.keys(parsed).length > 0 ? parsed : null
}

/** Entries the login shell sets or changes, ignoring volatile bookkeeping. */
export function diffShellEnvironments(
  login: Record<string, string>,
  plain: Record<string, string>
): Record<string, string> {
  const result: Record<string, string> = {}
  for (const [key, value] of Object.entries(login)) {
    if (!VOLATILE_KEYS.has(key) && plain[key] !== value) {
      result[key] = value
    }
  }
  return result
}

/**
 * Start the capture. Safe to call more than once; the first call wins.
 *
 * Deliberately fire-and-forget: callers fall back to a real login shell until
 * this lands, so a slow profile delays the optimisation rather than the app.
 */
export function primeLoginShellEnvironment(): Promise<void> {
  if (priming) {
    return priming
  }
  const shell = pickShell()
  if (!shell) {
    delta = {}
    priming = Promise.resolve()
    return priming
  }
  priming = (async () => {
    // -i as well as -l: .zshrc/.bashrc are interactive-only, and that is where
    // version managers usually put their PATH edits.
    const [login, plain] = await Promise.all([
      readEnv(shell, ['-ilc']),
      readEnv(shell, ['-c'])
    ])
    if (login && plain) {
      delta = diffShellEnvironments(login, plain)
    }
  })()
  return priming
}

/**
 * The captured contribution, or null while it is still unknown.
 *
 * Null means "spawn a login shell yourself" — correct, just slower — so a
 * failed or in-flight capture can never change what a child sees.
 */
export function loginShellEnvironmentDelta(): Record<string, string> | null {
  return delta
}
