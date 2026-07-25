// Registering a new site with the running Local app via its private GraphQL API.
// Ported from ocsites create_localwp.add_site.
//
// The admin password is only ever put in the request body — it is never logged and never returned.

import { isLocalWpSupported, LOCALWP_UNSUPPORTED_PLATFORM, type LocalWpHost } from './localwp-host'
import {
  readLocalWpConnectionInfo,
  resolveGraphqlEndpointCandidates,
  resolveLocalWpServiceVersion
} from './localwp-detection'

const ADD_SITE_MUTATION = `
mutation ($AddSiteInput: AddSiteInput!) {
    addSite(input: $AddSiteInput) {
        error
        id
        logs
        status
    }
}
`

const REQUEST_TIMEOUT_MS = 60_000

export type AddLocalWpSiteRequest = {
  domain: string
  name: string
  sitePath: string
  adminEmail: string
  adminPassword: string
}

export type AddLocalWpSiteResult = { ok: boolean; siteId: string; message: string }

/** POSTs a GraphQL body and returns the parsed JSON. Rejects on any transport-level failure. */
export type LocalWpGraphqlPost = (url: string, authToken: string, body: string) => Promise<unknown>

export type AddLocalWpSiteOptions = {
  host: LocalWpHost
  onStatus?: (message: string) => void
  post?: LocalWpGraphqlPost
  signal?: AbortSignal
}

const postGraphql: LocalWpGraphqlPost = async (url, authToken, body) => {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
    body,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  })
  if (!response.ok) {
    throw new Error(`LocalWP API error ${response.status}: ${response.statusText}`)
  }
  return response.json()
}

export async function addLocalWpSite(
  request: AddLocalWpSiteRequest,
  options: AddLocalWpSiteOptions
): Promise<AddLocalWpSiteResult> {
  const { host } = options
  if (!isLocalWpSupported(host)) {
    return { ok: false, siteId: '', message: LOCALWP_UNSUPPORTED_PLATFORM }
  }
  const connection = await readLocalWpConnectionInfo(host)
  if (!connection) {
    return {
      ok: false,
      siteId: '',
      message:
        'LocalWP GraphQL connection info not found. Make sure the Local app is running before creating a site.'
    }
  }
  const endpoints = await resolveGraphqlEndpointCandidates(host, connection)
  if (endpoints.length === 0) {
    return {
      ok: false,
      siteId: '',
      message: `Could not reach the LocalWP API on any port (tried ${connection.port ?? 'none advertised'}, live listen ports, 4000). Quit and relaunch the Local app, then retry.`
    }
  }
  options.onStatus?.(`Creating LocalWP site: ${request.domain}…`)
  const body = JSON.stringify({
    query: ADD_SITE_MUTATION,
    variables: {
      AddSiteInput: {
        domain: request.domain,
        environment: 'custom',
        name: request.name,
        path: request.sitePath,
        skipWPInstall: true,
        webServer: (await resolveLocalWpServiceVersion(host, 'apache')) ?? 'apache',
        wpAdminEmail: request.adminEmail,
        wpAdminPassword: request.adminPassword,
        wpAdminUsername: 'admin'
      }
    }
  })
  const post = options.post ?? postGraphql
  let payload: unknown
  let lastError = ''
  for (const endpoint of endpoints) {
    if (endpoint.port !== connection.port) {
      options.onStatus?.(
        `LocalWP API on the advertised port was unreachable — trying port ${endpoint.port}…`
      )
    }
    try {
      payload = await post(endpoint.url, connection.authToken, body)
      break
    } catch (error) {
      if (
        error instanceof Error &&
        error.name === 'AbortError' &&
        options.signal?.aborted === true
      ) {
        throw error
      }
      lastError = error instanceof Error ? error.message : String(error)
    }
  }
  if (payload === undefined) {
    return { ok: false, siteId: '', message: lastError || 'Could not reach the LocalWP API' }
  }
  return interpretAddSiteResponse(payload, options.onStatus)
}

function interpretAddSiteResponse(
  payload: unknown,
  onStatus?: (message: string) => void
): AddLocalWpSiteResult {
  if (typeof payload !== 'object' || payload === null) {
    return { ok: false, siteId: '', message: 'LocalWP API returned an unexpected response.' }
  }
  const body = payload as Record<string, unknown>
  if (Array.isArray(body.errors) && body.errors.length > 0) {
    const messages = body.errors
      .map((entry) =>
        typeof entry === 'object' &&
        entry !== null &&
        typeof (entry as Record<string, unknown>).message === 'string'
          ? String((entry as Record<string, unknown>).message)
          : JSON.stringify(entry)
      )
      .join('; ')
    return { ok: false, siteId: '', message: `LocalWP GraphQL error: ${messages}` }
  }
  const data =
    typeof body.data === 'object' && body.data !== null
      ? (body.data as Record<string, unknown>)
      : {}
  const addSite =
    typeof data.addSite === 'object' && data.addSite !== null
      ? (data.addSite as Record<string, unknown>)
      : {}
  if (typeof addSite.error === 'string' && addSite.error.length > 0) {
    return { ok: false, siteId: '', message: `LocalWP addSite error: ${addSite.error}` }
  }
  const siteId = typeof addSite.id === 'string' ? addSite.id : ''
  if (siteId) {
    onStatus?.(`Site created (id: ${siteId})`)
  }
  return { ok: true, siteId, message: 'LocalWP site created' }
}
