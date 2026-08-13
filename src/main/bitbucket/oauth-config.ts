// Bitbucket Cloud OAuth consumer for the desktop Connect flow.
// Client id/secret come from the process env, with a one-shot read of the
// gitignored repo-root `.env.local` so `pnpm run dev` picks them up.

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

export const BITBUCKET_OAUTH_AUTHORIZE_URL = 'https://bitbucket.org/site/oauth2/authorize'
export const BITBUCKET_OAUTH_TOKEN_URL = 'https://bitbucket.org/site/oauth2/access_token'
export const BITBUCKET_OAUTH_CALLBACK_PORT = 18765
export const BITBUCKET_OAUTH_REDIRECT_URI = `http://127.0.0.1:${BITBUCKET_OAUTH_CALLBACK_PORT}/bitbucket/callback`

const CLIENT_ID_ENV = 'ORCA_BITBUCKET_OAUTH_CLIENT_ID'
const CLIENT_SECRET_ENV = 'ORCA_BITBUCKET_OAUTH_CLIENT_SECRET'

export type BitbucketOAuthConsumer = {
  clientId: string
  clientSecret: string
}

let localEnvApplied = false

export function parseDotEnvLocal(text: string): Record<string, string> {
  const parsed: Record<string, string> = {}
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (line === '' || line.startsWith('#')) {
      continue
    }
    const eq = line.indexOf('=')
    if (eq <= 0) {
      continue
    }
    const key = line.slice(0, eq).trim()
    let value = line.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    parsed[key] = value
  }
  return parsed
}

function applyRepoLocalEnv(): void {
  if (localEnvApplied || process.env.VITEST) {
    return
  }
  localEnvApplied = true
  const path = join(process.cwd(), '.env.local')
  if (!existsSync(path)) {
    return
  }
  let text = ''
  try {
    text = readFileSync(path, 'utf8')
  } catch {
    return
  }
  const parsed = parseDotEnvLocal(text)
  for (const [key, value] of Object.entries(parsed)) {
    if (process.env[key] !== undefined && process.env[key] !== '') {
      continue
    }
    process.env[key] = value
  }
}

export function getBitbucketOAuthConsumer(
  env: NodeJS.ProcessEnv = process.env
): BitbucketOAuthConsumer | null {
  applyRepoLocalEnv()
  const clientId = env[CLIENT_ID_ENV]?.trim() ?? ''
  const clientSecret = env[CLIENT_SECRET_ENV]?.trim() ?? ''
  if (clientId === '' || clientSecret === '') {
    return null
  }
  return { clientId, clientSecret }
}

export function isBitbucketOAuthAvailable(env: NodeJS.ProcessEnv = process.env): boolean {
  return getBitbucketOAuthConsumer(env) !== null
}

/** Test-only: re-read `.env.local` on the next config lookup. */
export function _resetBitbucketOAuthLocalEnvForTests(): void {
  localEnvApplied = false
}
