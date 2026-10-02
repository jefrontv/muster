// The Serve row's domain error: a DDEV naming rule, or another local site that already holds it.
// The clash check waits for a pause in typing and drops answers a newer keystroke superseded.

import { useEffect, useRef, useState } from 'react'
import type { SiteLocalStack } from '../../../../shared/site-types'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import type { SiteSetupSource } from './site-setup-choices'
import { ddevNameError, ddevNameFromValue } from './site-setup-domain-rules'
import { joinDisplayPath } from './site-display-path'

const CHECK_DELAY_MS = 400

/** `repos.clone` names the folder after the URL's last segment, so the check does the same. */
function cloneFolder(root: string, cloneUrl: string): string {
  const name =
    cloneUrl
      .replace(/\.git$/, '')
      .split(/[/:]/)
      .findLast(Boolean) ?? ''
  return name ? joinDisplayPath(root, name) : ''
}

/** The folder the site will live in, so its own registrations never count as a clash. */
export function serveSitePath(
  source: SiteSetupSource | null,
  sitePathById: (siteId: string) => string
): string {
  if (!source) {
    return ''
  }
  if (source.kind === 'site') {
    return sitePathById(source.siteId)
  }
  if (source.kind === 'repo') {
    return cloneFolder(source.destinationRoot, source.repo.cloneUrl)
  }
  return source.target.kind === 'existing'
    ? source.target.path
    : cloneFolder(source.target.root, source.target.cloneUrl)
}

export function useServeDomainCheck({
  source,
  stack,
  domain,
  enabled
}: {
  source: SiteSetupSource | null
  stack: SiteLocalStack | null
  domain: string
  enabled: boolean
}): string {
  const sites = useAppStore((s) => s.sites)
  const sitePath = serveSitePath(
    source,
    (siteId) => sites.find((entry) => entry.site.id === siteId)?.site.path ?? ''
  )
  const ruleError = enabled && stack === 'ddev' ? ddevNameError(ddevNameFromValue(domain)) : ''
  const [clash, setClash] = useState('')
  const requestRef = useRef(0)

  useEffect(() => {
    const request = ++requestRef.current
    setClash('')
    if (!enabled || !stack || ruleError || !sitePath || domain.trim().length === 0) {
      return
    }
    const timer = setTimeout(() => {
      void window.api.siteStacks.checkDomain?.({ sitePath, stack, domain }).then((answer) => {
        if (request !== requestRef.current || !answer?.ok || !answer.value) {
          return
        }
        setClash(
          translate(
            'auto.components.sites.useServeDomainCheck.clash',
            '{{domain}} is already used by {{name}} ({{path}}). Choose another.'
          )
            .replace('{{domain}}', domain.trim())
            .replace('{{name}}', answer.value.name || answer.value.stack)
            .replace('{{path}}', answer.value.path)
        )
      })
    }, CHECK_DELAY_MS)
    return () => clearTimeout(timer)
  }, [enabled, stack, ruleError, sitePath, domain])

  return ruleError || clash
}
