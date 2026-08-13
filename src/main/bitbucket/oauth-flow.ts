// 3-legged Bitbucket Cloud OAuth: loopback on the registered callback port,
// exchange the code, then return tokens. Refresh lives in oauth-tokens.ts.

import { randomBytes } from 'node:crypto'
import { createServer, type Server, type ServerResponse } from 'node:http'
import { shell } from 'electron'
import {
  BITBUCKET_OAUTH_AUTHORIZE_URL,
  BITBUCKET_OAUTH_CALLBACK_PORT,
  BITBUCKET_OAUTH_REDIRECT_URI,
  BITBUCKET_OAUTH_TOKEN_URL,
  getBitbucketOAuthConsumer,
  type BitbucketOAuthConsumer
} from './oauth-config'
import {
  BITBUCKET_OAUTH_CALLBACK_HEADERS,
  BITBUCKET_OAUTH_CALLBACK_SUCCESS_PAGE
} from './oauth-callback-page'

export type BitbucketOAuthTokens = {
  accessToken: string
  refreshToken: string
  expiresAt: number
}

const AUTH_TIMEOUT_MS = 5 * 60 * 1000

let activeCancel: (() => void) | null = null

export function cancelBitbucketOAuth(): void {
  activeCancel?.()
}

function closeServer(server: Server): void {
  try {
    server.closeAllConnections?.()
    server.close()
  } catch {
    // Already closed.
  }
}

function writePage(response: ServerResponse, status: number, body: string): void {
  response.writeHead(status, BITBUCKET_OAUTH_CALLBACK_HEADERS)
  response.end(body)
}

export async function exchangeBitbucketOAuthCode(
  consumer: BitbucketOAuthConsumer,
  code: string
): Promise<BitbucketOAuthTokens> {
  return postToken(consumer, {
    grant_type: 'authorization_code',
    code,
    redirect_uri: BITBUCKET_OAUTH_REDIRECT_URI
  })
}

export async function refreshBitbucketOAuthToken(
  consumer: BitbucketOAuthConsumer,
  refreshToken: string
): Promise<BitbucketOAuthTokens> {
  return postToken(consumer, {
    grant_type: 'refresh_token',
    refresh_token: refreshToken
  })
}

async function postToken(
  consumer: BitbucketOAuthConsumer,
  body: Record<string, string>
): Promise<BitbucketOAuthTokens> {
  const basic = Buffer.from(`${consumer.clientId}:${consumer.clientSecret}`).toString('base64')
  const response = await fetch(BITBUCKET_OAUTH_TOKEN_URL, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams(body).toString(),
    signal: AbortSignal.timeout(15_000)
  })
  const payload = (await response.json().catch(() => null)) as {
    access_token?: unknown
    refresh_token?: unknown
    expires_in?: unknown
    error_description?: unknown
    error?: unknown
  } | null
  if (!response.ok || typeof payload?.access_token !== 'string' || payload.access_token === '') {
    const detail =
      typeof payload?.error_description === 'string'
        ? payload.error_description
        : typeof payload?.error === 'string'
          ? payload.error
          : `HTTP ${response.status}`
    throw new Error(`Bitbucket token exchange failed: ${detail}`)
  }
  const expiresIn =
    typeof payload.expires_in === 'number' && Number.isFinite(payload.expires_in)
      ? payload.expires_in
      : 7200
  return {
    accessToken: payload.access_token,
    refreshToken:
      typeof payload.refresh_token === 'string' && payload.refresh_token !== ''
        ? payload.refresh_token
        : (body.refresh_token ?? ''),
    expiresAt: Date.now() + expiresIn * 1000
  }
}

export function beginBitbucketOAuthLogin(): Promise<BitbucketOAuthTokens> {
  const consumer = getBitbucketOAuthConsumer()
  if (!consumer) {
    return Promise.reject(
      new Error('Bitbucket OAuth is not configured. Add the consumer key and secret to .env.local.')
    )
  }
  const state = randomBytes(24).toString('base64url')

  return new Promise((resolve, reject) => {
    let settled = false

    function finish(error: Error | null, tokens?: BitbucketOAuthTokens): void {
      if (settled) {
        return
      }
      settled = true
      activeCancel = null
      closeServer(server)
      if (error) {
        reject(error)
        return
      }
      resolve(tokens!)
    }

    const server = createServer((request, response) => {
      try {
        const url = new URL(request.url ?? '/', 'http://127.0.0.1')
        if (url.pathname !== '/bitbucket/callback') {
          response.writeHead(404)
          response.end('Not found')
          return
        }
        if (url.searchParams.get('state') !== state) {
          writePage(response, 400, 'Invalid Muster Bitbucket sign-in response.')
          return
        }
        if (url.searchParams.has('error')) {
          writePage(response, 400, 'Bitbucket sign-in was cancelled.')
          finish(new Error('Bitbucket sign-in was cancelled.'))
          return
        }
        const code = url.searchParams.get('code')
        if (!code) {
          writePage(response, 400, 'Invalid Muster Bitbucket sign-in response.')
          return
        }
        writePage(response, 200, BITBUCKET_OAUTH_CALLBACK_SUCCESS_PAGE)
        void exchangeBitbucketOAuthCode(consumer, code).then(
          (tokens) => finish(null, tokens),
          (error: unknown) =>
            finish(error instanceof Error ? error : new Error('Bitbucket token exchange failed.'))
        )
      } catch (error) {
        finish(error instanceof Error ? error : new Error('Bitbucket OAuth callback failed.'))
      }
    })

    const timeout = setTimeout(() => {
      finish(new Error('Bitbucket sign-in timed out.'))
    }, AUTH_TIMEOUT_MS)
    server.once('close', () => clearTimeout(timeout))
    server.once('error', (error) => {
      if ((error as NodeJS.ErrnoException).code === 'EADDRINUSE') {
        finish(
          new Error(
            `Port ${BITBUCKET_OAUTH_CALLBACK_PORT} is already in use. Close the other process and try again.`
          )
        )
        return
      }
      finish(error)
    })

    activeCancel = () => finish(new Error('Bitbucket sign-in was cancelled.'))

    server.listen(BITBUCKET_OAUTH_CALLBACK_PORT, '127.0.0.1', () => {
      const authorize = new URL(BITBUCKET_OAUTH_AUTHORIZE_URL)
      authorize.searchParams.set('client_id', consumer.clientId)
      authorize.searchParams.set('response_type', 'code')
      authorize.searchParams.set('redirect_uri', BITBUCKET_OAUTH_REDIRECT_URI)
      authorize.searchParams.set('state', state)
      void shell.openExternal(authorize.toString()).catch((error) => {
        finish(
          error instanceof Error ? error : new Error('Could not open the Bitbucket sign-in page.')
        )
      })
    })
  })
}
