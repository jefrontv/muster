// The chat hero's greeting name: the user's git identity first name (the one
// name most Muster users have configured), falling back to the OS account name.

import { execFile } from 'node:child_process'
import { userInfo } from 'node:os'

let cached: Promise<string | null> | null = null

function firstName(fullName: string): string | null {
  const first = fullName.trim().split(/\s+/)[0] ?? ''
  if (first === '') {
    return null
  }
  return first.charAt(0).toUpperCase() + first.slice(1)
}

async function readGitUserName(): Promise<string | null> {
  return new Promise((resolve) => {
    execFile(
      'git',
      ['config', '--global', 'user.name'],
      { timeout: 3_000, windowsHide: true },
      (error, stdout) => {
        resolve(error ? null : stdout.trim() || null)
      }
    )
  })
}

export function getChatGreetingName(): Promise<string | null> {
  cached ??= (async () => {
    const gitName = await readGitUserName()
    if (gitName) {
      return firstName(gitName)
    }
    try {
      return firstName(userInfo().username)
    } catch {
      return null
    }
  })()
  return cached
}
