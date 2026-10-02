// The `effortLevel` from the user's Claude settings, so the chat composer can name
// the effort the CLI runs with when Muster passed no --effort. Chat threads launch
// locally, so the local config dir is the right one; project-level settings and env
// precedence are not modelled, which is why the UI says where the value came from.

import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

const EFFORT_LEVELS = new Set(['low', 'medium', 'high', 'xhigh', 'max'])

export function claudeUserSettingsPath(env: NodeJS.ProcessEnv = process.env): string {
  const configDir = env.CLAUDE_CONFIG_DIR?.trim() || join(homedir(), '.claude')
  return join(configDir, 'settings.json')
}

/** Null when the file is missing, unreadable, or holds no recognised level. */
export async function readClaudeSettingsEffortLevel(
  settingsPath: string = claudeUserSettingsPath()
): Promise<string | null> {
  try {
    const parsed: unknown = JSON.parse(await readFile(settingsPath, 'utf8'))
    const level =
      typeof parsed === 'object' && parsed !== null
        ? (parsed as Record<string, unknown>).effortLevel
        : undefined
    return typeof level === 'string' && EFFORT_LEVELS.has(level) ? level : null
  } catch {
    return null
  }
}
