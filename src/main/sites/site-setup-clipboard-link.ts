// A muster:// configure link on the clipboard, offered on an SSH password card. Read in main only:
// the renderer gets the non-secret summary, and the password goes from here to the keychain.

import type { Site } from '../../shared/site-types'
import type { SiteSetupClipboardLink } from '../../shared/site-setup-approval-types'
import type { SiteBindFields } from '../../shared/site-bind-types'
import { isSiteBindUrl, parseSiteBindUrl } from './site-bind-url'

/** Longer than any real link; anything bigger is not one and is not worth parsing. */
const MAX_CLIPBOARD_LINK_LENGTH = 8_192

export type ClipboardLink = { fields: SiteBindFields; password: string }

export type ClipboardLinkStore = {
  getSite: (siteId: string) => Site | null
  updateSite: (siteId: string, updates: Partial<Omit<Site, 'id'>>) => Site | null
  flushOrThrow: () => void
}

/** Null for anything that is not a parseable link carrying a password. */
export function readClipboardLink(text: string): ClipboardLink | null {
  const trimmed = text.trim()
  if (
    trimmed.length === 0 ||
    trimmed.length > MAX_CLIPBOARD_LINK_LENGTH ||
    !isSiteBindUrl(trimmed)
  ) {
    return null
  }
  const parsed = parseSiteBindUrl(trimmed)
  return parsed.ok && parsed.password.length > 0
    ? { fields: parsed.fields, password: parsed.password }
    : null
}

export function summarizeClipboardLink(text: string): SiteSetupClipboardLink | null {
  const link = readClipboardLink(text)
  return link ? summarizeLink(link, 'clipboard') : null
}

export function summarizeLink(
  link: ClipboardLink,
  source: SiteSetupClipboardLink['source']
): SiteSetupClipboardLink {
  const { fields } = link
  return {
    source,
    reponame: fields.reponame,
    hostname: fields.hostname,
    username: fields.username,
    rootPath: fields.rootPath,
    liveDomain: fields.liveDomain,
    environment: fields.environment
  }
}

/**
 * Fills one environment from the link. Blank link fields keep what is there, so a short link never
 * clears a value the user already set.
 */
export function applyClipboardLinkFields(
  store: ClipboardLinkStore,
  siteId: string,
  environment: string,
  fields: SiteBindFields
): void {
  const site = store.getSite(siteId)
  const existing = site?.environments[environment]
  if (!site || !existing) {
    throw new Error(`The ${environment} environment no longer exists on this site.`)
  }
  const keep = (value: string, current: string): string => value || current
  store.updateSite(siteId, {
    environments: {
      ...site.environments,
      [environment]: {
        ...existing,
        hostname: keep(fields.hostname, existing.hostname),
        username: keep(fields.username, existing.username),
        rootPath: keep(fields.rootPath, existing.rootPath),
        liveDomain: keep(fields.liveDomain, existing.liveDomain),
        liveDomainProtocol: fields.liveDomain
          ? fields.liveDomainProtocol
          : existing.liveDomainProtocol,
        deployCommand: keep(fields.deployCommand, existing.deployCommand),
        themeDistPath: keep(fields.themeDistPath, existing.themeDistPath)
      }
    }
  })
  // The agent reads the result from disk right after the card settles.
  store.flushOrThrow()
}
