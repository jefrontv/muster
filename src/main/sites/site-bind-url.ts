// The `muster://configure?…` bind-link contract, ported from ocsites' url_handler / configure-url
// parsing (cli.py:2843-2879) and its MCP generate_bind_url / parse_bind_url pair
// (mcp_server.py:2395-2450). Every parameter alias is accepted so dashboard links written for
// ocsites keep working, but only the `muster://` scheme is — `ocsites://` belongs to the separate
// installed ocsites app and is deliberately left to it.
//
// Security: a link carries a plaintext SSH password. The password is returned on its own, separate
// from the field record that crosses IPC, and no error message here ever echoes a parameter value —
// only its key — so a malformed link cannot leak a credential into a log or a toast.

import type { SiteBindFields } from '../../shared/site-bind-types'

export const SITE_BIND_URL_SCHEME = 'muster'
export const SITE_BIND_URL_ACTION = 'configure'

/** Only `muster`: `ocsites://` is owned by the separately installed ocsites app. */
const ACCEPTED_SCHEMES: Record<string, true> = { [SITE_BIND_URL_SCHEME]: true }

const MAX_URL_LENGTH = 8_192
const MAX_FIELD_LENGTH = 256
const MAX_PATH_FIELD_LENGTH = 4_096
const MAX_NOTES_LENGTH = 4_096
const MAX_PASSWORD_LENGTH = 1_024

// Alias order matters: the first entry is the canonical key generateSiteBindUrl emits, so a
// generated link round-trips through parseSiteBindUrl unchanged.
const FIELD_ALIASES = {
  reponame: ['reponame', 'repo'],
  hostname: ['hostname', 'host'],
  username: ['username', 'user'],
  rootPath: ['root_path', 'root-path', 'root'],
  liveDomain: ['live-domain', 'live_domain', 'live-url', 'live_url', 'live'],
  // `env` leads so generated links say what they mean. `branch` still parses — links already in
  // circulation use it, and it now also selects the git branch (see deriveCheckoutBranch).
  environment: ['env', 'environment', 'branch'],
  checkoutBranch: ['checkout', 'git_branch', 'git-branch'],
  deployCommand: ['deploy_command', 'deploy-command', 'build_command', 'build-command'],
  themeDistPath: [
    'theme_dist_path',
    'theme-dist-path',
    'deploy_path',
    'deploy-path',
    'dist_path',
    'dist-path'
  ],
  notes: ['notes', 'note']
} as const

type BindUrlFieldKey = keyof typeof FIELD_ALIASES

const PASSWORD_ALIASES = ['password', 'pass', 'ssh_password'] as const

const FIELD_LIMITS: Record<BindUrlFieldKey, number> = {
  reponame: MAX_FIELD_LENGTH,
  hostname: MAX_FIELD_LENGTH,
  username: MAX_FIELD_LENGTH,
  rootPath: MAX_PATH_FIELD_LENGTH,
  liveDomain: MAX_FIELD_LENGTH,
  environment: MAX_FIELD_LENGTH,
  checkoutBranch: MAX_FIELD_LENGTH,
  deployCommand: MAX_PATH_FIELD_LENGTH,
  themeDistPath: MAX_PATH_FIELD_LENGTH,
  notes: MAX_NOTES_LENGTH
}

/** Without a host and a user there is no environment to bind, so these two are mandatory. */
const REQUIRED_FIELDS: readonly BindUrlFieldKey[] = ['hostname', 'username']

export type SiteBindUrlParse =
  | { ok: true; fields: SiteBindFields; password: string }
  | { ok: false; error: string }

export function isSiteBindUrl(value: string): boolean {
  const colon = value.indexOf(':')
  return colon > 0 && ACCEPTED_SCHEMES[value.slice(0, colon).toLowerCase()] === true
}

/** Pulls the bind link out of a `second-instance` argv, where it arrives as a bare argument. */
export function extractSiteBindUrl(argv: readonly string[]): string | null {
  return argv.findLast((entry) => isSiteBindUrl(entry)) ?? null
}

/**
 * Hand-split rather than `new URL`: for a non-special scheme the WHATWG parser puts the action in
 * `host` or `pathname` depending on whether the link used `//`, and both forms are in the wild.
 */
function splitBindUrl(url: string): { scheme: string; action: string; query: string } | null {
  const colon = url.indexOf(':')
  if (colon <= 0) {
    return null
  }
  let rest = url.slice(colon + 1)
  if (rest.startsWith('//')) {
    rest = rest.slice(2)
  }
  const question = rest.indexOf('?')
  const action = (question === -1 ? rest : rest.slice(0, question)).replace(/^\/+|\/+$/g, '')
  return {
    scheme: url.slice(0, colon).toLowerCase(),
    action: action.toLowerCase(),
    query: question === -1 ? '' : rest.slice(question + 1)
  }
}

/** Lowercased key → first non-empty value, matching ocsites' case-insensitive alias lookup. */
function collectQueryValues(query: string): Map<string, string> {
  const values = new Map<string, string>()
  for (const [key, value] of new URLSearchParams(query)) {
    const normalizedKey = key.trim().toLowerCase()
    const trimmed = value.trim()
    if (trimmed.length > 0 && !values.has(normalizedKey)) {
      values.set(normalizedKey, trimmed)
    }
  }
  return values
}

function pickAlias(values: Map<string, string>, aliases: readonly string[]): string {
  for (const alias of aliases) {
    const found = values.get(alias)
    if (found !== undefined) {
      return found
    }
  }
  return ''
}

/**
 * Scanned by code point rather than by regex: a control character in any field would break out of a
 * remote shell line or split a log entry, and a literal control-character class is lint-banned.
 */
function containsControlCharacter(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index)
    if (code < 0x20 || code === 0x7f) {
      return true
    }
  }
  return false
}

const HOSTNAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9.-]*$/
const USERNAME_PATTERN = /^[A-Za-z0-9._@+-]+$/

/** Accepts `acme.com`, `https://acme.com`, and `https://www.acme.com/path` alike. */
function splitLiveDomain(raw: string): { domain: string; protocol: 'http' | 'https' } {
  const lower = raw.toLowerCase()
  const protocol = lower.startsWith('http://') ? 'http' : 'https'
  let domain = lower.replace(/^https?:\/\//, '').replace(/^www\./, '')
  domain = domain.split('/')[0]?.split('?')[0] ?? ''
  return { domain: domain.replace(/\/+$/, ''), protocol }
}

/**
 * ocsites' `default_local_domain` (deploy/utils.py:72): only the first label survives, so a
 * domain-shaped name such as `acme.com.au` yields `acme.local` rather than `acme.com.au.local`.
 */
export function defaultLocalDomain(name: string): string {
  let base = name.trim().toLowerCase()
  if (base.endsWith('.local')) {
    base = base.slice(0, -'.local'.length)
  }
  const [first] = base.split('.')
  return `${first || 'site'}.local`
}

/** Repo name wins over the live domain, exactly as ocsites' `_local_domain_from_bind` did. */
export function deriveBindLocalDomain(reponame: string, liveDomain: string): string {
  const slug = bitbucketRepoSlug(reponame)
  if (slug.length > 0) {
    return defaultLocalDomain(slug)
  }
  const { domain } = splitLiveDomain(liveDomain)
  return domain.length > 0 ? defaultLocalDomain(domain) : ''
}

/** Last path segment of `workspace/slug`, minus any `.git` suffix. */
export function bitbucketRepoSlug(reponame: string): string {
  const last =
    reponame
      .trim()
      .split('/')
      .findLast((part) => part.length > 0) ?? ''
  return last.toLowerCase().replace(/\.git$/, '')
}

/** Only workspace-qualified names can produce a clone URL; a bare slug has no workspace. */
export function bitbucketCloneUrlForReponame(reponame: string): string {
  const parts = reponame
    .trim()
    .replace(/\.git$/, '')
    .split('/')
    .filter((part) => part.length > 0)
  if (parts.length < 2) {
    return ''
  }
  return `git@bitbucket.org:${parts.slice(-2).join('/')}.git`
}

function validateField(key: BindUrlFieldKey, value: string): string {
  if (value.length > FIELD_LIMITS[key]) {
    return `${key} exceeds ${FIELD_LIMITS[key]} characters.`
  }
  if (containsControlCharacter(value)) {
    return `${key} contains control characters.`
  }
  if (key === 'hostname' && value.length > 0 && !HOSTNAME_PATTERN.test(value)) {
    return 'hostname is not a valid host name.'
  }
  if (key === 'username' && value.length > 0 && !USERNAME_PATTERN.test(value)) {
    return 'username contains characters that are not allowed.'
  }
  return ''
}

export function parseSiteBindUrl(url: unknown): SiteBindUrlParse {
  if (typeof url !== 'string' || url.trim().length === 0) {
    return { ok: false, error: 'No bind link was supplied.' }
  }
  const trimmed = url.trim()
  if (trimmed.length > MAX_URL_LENGTH) {
    return { ok: false, error: `The bind link exceeds ${MAX_URL_LENGTH} characters.` }
  }
  const split = splitBindUrl(trimmed)
  if (!split || ACCEPTED_SCHEMES[split.scheme] !== true) {
    return { ok: false, error: 'The link does not use the muster:// scheme.' }
  }
  if (split.action.length > 0 && split.action !== SITE_BIND_URL_ACTION) {
    return { ok: false, error: `Unsupported bind action: ${SITE_BIND_URL_ACTION} is expected.` }
  }

  const values = collectQueryValues(split.query)
  if (values.size === 0) {
    return { ok: false, error: 'The link carries no configuration parameters.' }
  }

  const raw = {} as Record<BindUrlFieldKey, string>
  for (const key of Object.keys(FIELD_ALIASES) as BindUrlFieldKey[]) {
    const value = pickAlias(values, FIELD_ALIASES[key])
    const problem = validateField(key, value)
    if (problem.length > 0) {
      return { ok: false, error: problem }
    }
    raw[key] = value
  }

  const missing = REQUIRED_FIELDS.filter((key) => raw[key].length === 0)
  if (missing.length > 0) {
    return { ok: false, error: `The link is missing required parameters: ${missing.join(', ')}.` }
  }

  const password = pickAlias(values, PASSWORD_ALIASES)
  if (password.length > MAX_PASSWORD_LENGTH) {
    return { ok: false, error: `password exceeds ${MAX_PASSWORD_LENGTH} characters.` }
  }
  if (containsControlCharacter(password)) {
    return { ok: false, error: 'password contains control characters.' }
  }

  const live = splitLiveDomain(raw.liveDomain)
  const fields: SiteBindFields = {
    reponame: raw.reponame,
    hostname: raw.hostname,
    username: raw.username,
    // ocsites defaulted an absent root to public_html (cli.py:2864); keep that.
    rootPath: raw.rootPath.length > 0 ? raw.rootPath : 'public_html',
    liveDomain: live.domain,
    liveDomainProtocol: live.protocol,
    localDomain: deriveBindLocalDomain(raw.reponame, raw.liveDomain),
    environment: raw.environment,
    // A link that names an environment names the branch too, unless it says otherwise. `branch=`
    // is the alias people actually write, and reading it as environment-only cloned the default.
    checkoutBranch: raw.checkoutBranch.length > 0 ? raw.checkoutBranch : raw.environment,
    deployCommand: raw.deployCommand,
    themeDistPath: raw.themeDistPath,
    notes: raw.notes
  }
  return { ok: true, fields, password }
}

/**
 * Builds a link a dashboard can hand out. `localDomain` is deliberately not emitted — it is derived
 * on parse, so including it would let a link disagree with itself.
 */
export function generateSiteBindUrl(
  fields: Partial<SiteBindFields> & { password?: string }
): string {
  const query = new URLSearchParams()
  for (const key of Object.keys(FIELD_ALIASES) as BindUrlFieldKey[]) {
    const value = fields[key]
    if (typeof value !== 'string' || value.length === 0) {
      continue
    }
    const emitted =
      key === 'liveDomain' ? `${fields.liveDomainProtocol ?? 'https'}://${value}` : value
    query.set(FIELD_ALIASES[key][0], emitted)
  }
  if (fields.password) {
    query.set(PASSWORD_ALIASES[0], fields.password)
  }
  return `${SITE_BIND_URL_SCHEME}://${SITE_BIND_URL_ACTION}?${query.toString()}`
}
