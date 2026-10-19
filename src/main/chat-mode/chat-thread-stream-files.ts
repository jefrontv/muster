// Home of the per-thread launch files (MCP config carrying a bearer token, the
// workspace brief). The app points it at userData; a shared /tmp folder could be
// pre-created by another local user, who could then swap the files. Tests keep tmpdir.

import { mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

let filesRoot: string | null = null

export function setChatStreamFilesRoot(dir: string): void {
  filesRoot = dir
}

export function chatStreamFilesDir(folder: string): string {
  return join(filesRoot ?? tmpdir(), folder)
}

export function ensureChatStreamFilesDir(folder: string): string {
  const dir = chatStreamFilesDir(folder)
  mkdirSync(dir, { recursive: true, mode: 0o700 })
  return dir
}
