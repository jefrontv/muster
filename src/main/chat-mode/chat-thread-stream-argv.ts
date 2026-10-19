// Direct spawn for a chat launch command: the binary resolved on PATH plus its
// args, with no shell in between, which is also what makes Windows work (R21).
// A command that needs a shell (`cd x && claude`, `$HOME/bin/claude`) gets null.

import { statSync } from 'node:fs'
import { posix, win32 } from 'node:path'
import { tokenizeCustomCommandTemplate } from '../../shared/commit-message-prompt'

// Unquoted, each of these asks the shell to chain, redirect, expand or glob.
const SHELL_SYNTAX = /[;&|<>$`(){}*?~!#\n]/
const ENV_ASSIGNMENT = /^[A-Za-z_]\w*=/
const DEFAULT_PATHEXT = '.COM;.EXE;.BAT;.CMD'

function hasShellSyntax(command: string): boolean {
  let quote: "'" | '"' | null = null
  for (let index = 0; index < command.length; index += 1) {
    const char = command[index]!
    if (quote === "'") {
      quote = char === "'" ? null : quote
    } else if (char === '\\') {
      index += 1
    } else if (quote === '"') {
      if (char === '$' || char === '`') {
        return true
      }
      quote = char === '"' ? null : quote
    } else if (char === "'" || char === '"') {
      quote = char
    } else if (SHELL_SYNTAX.test(char)) {
      return true
    }
  }
  return false
}

/** POSIX-quoted command to argv, or null when only a shell can run it. */
export function chatCommandArgv(command: string): string[] | null {
  if (hasShellSyntax(command)) {
    return null
  }
  const parsed = tokenizeCustomCommandTemplate(command)
  if (!parsed.ok || parsed.tokens.length === 0 || ENV_ASSIGNMENT.test(parsed.tokens[0]!)) {
    return null
  }
  return parsed.tokens
}

function isFile(path: string): boolean {
  try {
    return statSync(path).isFile()
  } catch {
    return false
  }
}

/** Windows env keys are case-insensitive (`Path`, `ComSpec`). */
export function chatEnvValue(env: NodeJS.ProcessEnv, key: string): string | undefined {
  const match = Object.keys(env).find((name) => name.toUpperCase() === key)
  return match ? env[match] : undefined
}

export function resolveChatExecutable(
  name: string,
  env: NodeJS.ProcessEnv,
  deps: { platform?: NodeJS.Platform; cwd?: string; isFile?: (path: string) => boolean } = {}
): string | null {
  const platform = deps.platform ?? process.platform
  const exists = deps.isFile ?? isFile
  const windows = platform === 'win32'
  const path = windows ? win32 : posix
  const extensions = windows
    ? (chatEnvValue(env, 'PATHEXT') ?? DEFAULT_PATHEXT).split(';').filter(Boolean)
    : []
  // On Windows an extensionless `claude` next to claude.cmd is npm's sh shim, which cannot be spawned.
  const named = extensions.some((ext) => name.toUpperCase().endsWith(ext.toUpperCase()))
  const suffixes = windows ? (named ? [''] : extensions) : ['']
  const hasDir = name.includes('/') || (windows && name.includes('\\'))
  const dirs = hasDir
    ? ['']
    : (chatEnvValue(env, 'PATH') ?? '').split(path.delimiter).filter((dir) => dir !== '')
  for (const dir of dirs) {
    for (const suffix of suffixes) {
      const candidate = dir
        ? path.join(dir, name + suffix)
        : path.resolve(deps.cwd ?? '', name + suffix)
      if (exists(candidate)) {
        return candidate
      }
    }
  }
  return null
}

/** cmd.exe line for a .cmd/.bat shim. `%` still expands inside quotes; chat args carry none. */
export function windowsShimCommandLine(file: string, args: readonly string[]): string {
  const quoted = [file, ...args].map((arg) => `"${arg.replace(/"/g, '""')}"`).join(' ')
  // /s strips the outer quotes and keeps the rest verbatim.
  return `"${quoted}"`
}
