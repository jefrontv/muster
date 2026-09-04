// Everything the setup review needs to know before it can be shown, gathered in one place: the
// projects root, installed stacks, the link's clone URL, the plan when a site already exists, the
// certificate probe, and the default choices seeded from all of that.
//
// Only a site that exists has a plan: an existing site, or a link candidate that already carries a
// Site record. Everything else reviews from defaults and lets the runner reconcile after register.

import { useEffect, useRef, useState } from 'react'
import type { LocalWpCertStatus } from '../../../../shared/localwp-cert-types'
import type { CloneSourceRepo } from '../../../../shared/site-clone-source-types'
import { defaultLocalDomain, repoSlug } from '../../../../shared/site-local-domain'
import type { SiteSetupPlan } from '../../../../shared/site-setup-flow-types'
import type { SiteLocalStack } from '../../../../shared/site-types'
import { readLastLocalStackChoice } from './last-local-stack-choice'
import { defaultSetupChoices, type SiteSetupChoices } from './site-setup-choices'
import type { SiteSetupRequest } from './SiteSetupDialog'
import type { SiteSetupLinkTarget } from './SiteSetupLinkTargetRows'

/** The stack already serving the folder first, then what the user picked last time, then anything installed. */
function pickDefaultStack(
  available: SiteLocalStack[],
  detected: SiteLocalStack | null
): SiteLocalStack | null {
  if (detected && detected !== 'plain' && available.includes(detected)) {
    return detected
  }
  const remembered = readLastLocalStackChoice()
  if (remembered && available.includes(remembered)) {
    return remembered
  }
  return available[0] ?? null
}

export function useSiteSetupReviewData(request: SiteSetupRequest, repo: CloneSourceRepo | null) {
  const [destinationRoot, setDestinationRoot] = useState('')
  const [linkTarget, setLinkTarget] = useState<SiteSetupLinkTarget | null>(null)
  const [linkCloneUrl, setLinkCloneUrl] = useState('')
  const [plan, setPlan] = useState<SiteSetupPlan | null>(null)
  const [availableStacks, setAvailableStacks] = useState<SiteLocalStack[] | null>(null)
  const [cert, setCert] = useState<LocalWpCertStatus | null>(null)
  const [choices, setChoices] = useState<SiteSetupChoices | null>(null)

  const planSiteId =
    request.kind === 'site'
      ? request.siteId
      : request.kind === 'link' && linkTarget?.kind === 'existing'
        ? (request.pending.candidates.find((candidate) => candidate.path === linkTarget.path)
            ?.siteId ?? '')
        : ''

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const [root, stacks] = await Promise.all([
        window.api.siteRoots.primary(),
        window.api.siteStacks.available()
      ])
      if (cancelled) {
        return
      }
      if (root.ok) {
        setDestinationRoot(root.value)
      }
      setAvailableStacks(stacks.ok ? stacks.value : [])
    })()
    return () => {
      cancelled = true
    }
  }, [])

  // A bare ocsites slug has no workspace, so the connector is asked for the real clone URL.
  useEffect(() => {
    if (request.kind !== 'link') {
      return
    }
    const { suggestedCloneUrl, fields } = request.pending
    if (suggestedCloneUrl.length > 0) {
      setLinkCloneUrl(suggestedCloneUrl)
      return
    }
    if (fields.reponame.length === 0) {
      return
    }
    let cancelled = false
    void (async () => {
      const result = await window.api.siteSetup.cloneTargets({ reponame: fields.reponame })
      if (!cancelled && result.ok) {
        setLinkCloneUrl(result.value.targets[0]?.cloneUrl ?? '')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [request])

  // Exactly one existing checkout is the obvious target; none means clone. Only a candidate that
  // exists may be offered: a stale record's folder is gone.
  useEffect(() => {
    if (request.kind !== 'link') {
      return
    }
    const existing = request.pending.candidates.filter((candidate) => candidate.exists)
    if (existing.length === 1 && existing[0]) {
      setLinkTarget({ kind: 'existing', path: existing[0].path })
    } else if (existing.length === 0 && destinationRoot.length > 0) {
      setLinkTarget({ kind: 'clone', root: destinationRoot })
    }
  }, [request, destinationRoot])

  useEffect(() => {
    if (planSiteId.length === 0) {
      setPlan(null)
      return
    }
    let cancelled = false
    void (async () => {
      const reponame = request.kind === 'link' ? request.pending.fields.reponame : ''
      const result = await window.api.siteSetup.plan({ siteId: planSiteId, reponame, branch: null })
      if (!cancelled) {
        setPlan(result.ok ? result.value : null)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [planSiteId, request])

  // Seed once what the review depends on has answered; re-seed when the plan's target changes.
  const seedKey = `${planSiteId}|${repo?.fullName ?? ''}|${availableStacks === null ? '' : 'stacks'}`
  const seededRef = useRef('')
  useEffect(() => {
    if (availableStacks === null || seededRef.current === seedKey) {
      return
    }
    if (planSiteId.length > 0 && plan === null) {
      return
    }
    seededRef.current = seedKey
    const domain =
      plan?.stack.suggestedDomain ||
      (request.kind === 'link'
        ? request.pending.fields.localDomain ||
          defaultLocalDomain(repoSlug(request.pending.fields.reponame))
        : repo
          ? defaultLocalDomain(repoSlug(repo.fullName))
          : '')
    // A bare clone has no server configuration; only a link or an existing site names one.
    const environment =
      plan?.import.environment ||
      (request.kind === 'link' ? request.pending.fields.environment || 'main' : '')
    setChoices(
      defaultSetupChoices({
        plan,
        domain,
        stack: pickDefaultStack(availableStacks, plan?.stack.stack ?? null),
        certSupported: true,
        environment
      })
    )
  }, [seedKey, availableStacks, plan, planSiteId, repo, request])

  // Cheap local probe: lets the HTTPS row say "already trusted" and greys it where certs cannot work.
  const certDomain = choices?.serve.domain.trim() ?? ''
  const certStack = choices?.serve.stack ?? null
  useEffect(() => {
    if (certDomain.length === 0 || certStack === null) {
      setCert(null)
      return
    }
    let cancelled = false
    void (async () => {
      const result = await window.api.localwpCert?.status({ domain: certDomain, stack: certStack })
      if (!cancelled) {
        setCert(result?.ok ? result.value : null)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [certDomain, certStack])

  return {
    destinationRoot,
    setDestinationRoot,
    linkTarget,
    setLinkTarget,
    linkCloneUrl,
    plan,
    availableStacks,
    cert,
    choices,
    setChoices
  }
}
