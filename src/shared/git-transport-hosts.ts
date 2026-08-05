// Git hosting endpoints that accept SSH for git transport only — no interactive shell. Targets
// pointing at them (usually swept in from ~/.ssh/config) can never host workspaces or
// automations, so surfaces that probe SSH targets for real shells should skip them.

const GIT_TRANSPORT_HOSTNAMES = new Set([
  'github.com',
  'ssh.github.com',
  'gitlab.com',
  'altssh.gitlab.com',
  'bitbucket.org',
  'altssh.bitbucket.org',
  'ssh.dev.azure.com',
  'vs-ssh.visualstudio.com',
  'codeberg.org',
  'git.sr.ht'
])

/** True when the hostname is a known shell-less git transport endpoint. */
export function isGitTransportHostname(hostname: string | null | undefined): boolean {
  const normalized = hostname?.trim().toLowerCase()
  return normalized ? GIT_TRANSPORT_HOSTNAMES.has(normalized) : false
}

/** True when any of the target's host identifiers resolves to a git transport endpoint. */
export function isGitTransportSshTarget(target: {
  host?: string | null
  configHost?: string | null
}): boolean {
  return isGitTransportHostname(target.host) || isGitTransportHostname(target.configHost)
}
