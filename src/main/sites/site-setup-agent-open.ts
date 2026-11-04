// Turns an agent's open_site_setup arguments into a Set up dialog request.

import type { CloneSourceProviderId, CloneSourceRepo } from '../../shared/site-clone-source-types'
import type { SiteSetupAgentHints, SiteSetupAgentOpen } from '../../shared/site-setup-agent-types'
import { repoSlug } from '../../shared/site-local-domain'
import { SITE_LOCAL_STACKS, type SiteLocalStack } from '../../shared/site-types'
import { openSiteSetupForAgent } from './site-setup-agent-requests'

const MAX_FIELD_LENGTH = 2048
const OFFERED_STACKS: readonly SiteLocalStack[] = ['agent-local', 'ddev', 'localwp']

export type SiteSetupAgentOpenStore = {
  getSite: (siteId: string) => { id: string; displayName: string } | null
  findSiteByPath: (path: string) => { id: string } | null
}

function text(args: Record<string, unknown>, name: string): string {
  const value = args[name]
  if (value === undefined || value === null) {
    return ''
  }
  if (typeof value !== 'string' || value.length > MAX_FIELD_LENGTH) {
    throw new TypeError(`${name} must be a string of at most ${MAX_FIELD_LENGTH} characters`)
  }
  return value.trim()
}

/**
 * `owner/name` and the host from an SSH or HTTPS clone URL. The dialog shows the name and uses the
 * provider only for its icon, so an unknown host falls back to the URL's own path.
 */
export function repoFromCloneUrl(cloneUrl: string): CloneSourceRepo {
  // A repo on this machine (a bare mirror, a fixture): its folder name is the only name it has.
  if (cloneUrl.startsWith('/') || cloneUrl.startsWith('file://')) {
    const name =
      cloneUrl
        .replace(/\/+$/, '')
        .split('/')
        .at(-1)
        ?.replace(/\.git$/, '') ?? ''
    if (!name) {
      throw new TypeError('clone_url is not a git URL')
    }
    return {
      provider: 'bitbucket',
      fullName: name,
      cloneUrl,
      description: '',
      updatedAt: null,
      isPrivate: true
    }
  }
  const match = /^(?:[a-z+]+:\/\/)?(?:[^@/]+@)?([^/:]+)[:/](.+?)(?:\.git)?\/?$/i.exec(cloneUrl)
  if (!match) {
    throw new TypeError('clone_url is not a git URL')
  }
  const host = match[1].toLowerCase()
  const provider: CloneSourceProviderId = host.includes('github') ? 'github' : 'bitbucket'
  return {
    provider,
    fullName: match[2],
    cloneUrl,
    description: '',
    updatedAt: null,
    isPrivate: true
  }
}

function readHints(args: Record<string, unknown>): SiteSetupAgentHints {
  const hints: SiteSetupAgentHints = {}
  const stack = text(args, 'stack')
  if (stack) {
    if (
      !OFFERED_STACKS.includes(stack as SiteLocalStack) ||
      !SITE_LOCAL_STACKS.includes(stack as SiteLocalStack)
    ) {
      throw new TypeError(`stack must be one of ${OFFERED_STACKS.join(', ')}`)
    }
    hints.stack = stack as SiteLocalStack
  }
  const domain = text(args, 'domain')
  if (domain) {
    hints.domain = domain
  }
  if (typeof args.serve === 'boolean') {
    hints.serve = args.serve
  }
  if (typeof args.import === 'boolean') {
    hints.import = args.import
  }
  return hints
}

export function openAgentSiteSetup(
  store: SiteSetupAgentOpenStore,
  args: Record<string, unknown>
): { setup_id: string; label: string; status: 'opened' } {
  const cloneUrl = text(args, 'cloneUrl')
  const siteId = text(args, 'siteId')
  if (Boolean(cloneUrl) === Boolean(siteId)) {
    throw new TypeError('Pass exactly one of cloneUrl or siteId')
  }
  let input: SiteSetupAgentOpen
  const hints = readHints(args)
  const agent = text(args, 'agent') || null
  if (siteId) {
    const site = store.getSite(siteId)
    if (!site) {
      throw new TypeError(`No site with id ${siteId}`)
    }
    input = { source: { kind: 'site', siteId: site.id }, label: site.displayName, hints, agent }
  } else {
    const repo = repoFromCloneUrl(cloneUrl)
    input = { source: { kind: 'repo', repo }, label: repoSlug(repo.fullName), hints, agent }
  }
  const opened = openSiteSetupForAgent(input)
  if ('error' in opened) {
    throw new Error(opened.error)
  }
  return { setup_id: opened.setupId, label: input.label, status: 'opened' }
}
