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
import { domainForStack } from './site-setup-stack-domain'
import {
  defaultSetupChoices,
  resolveSetupEnvironment,
  type SiteSetupChoices
} from './site-setup-choices'
import type { SiteSetupRequest } from './SiteSetupDialog'
import type { SiteSetupLinkTarget } from './SiteSetupLinkTargetRows'
import { useAvailableSiteStacks } from '@/lib/use-available-site-stacks'

export type LinkCloneProblem = {
  kind: 'no-connector' | 'lookup-failed' | 'not-found'
  error: string
}

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
  // Why there is no clone URL, so the hint can name the fix instead of blaming the folder.
  const [linkCloneProblem, setLinkCloneProblem] = useState<LinkCloneProblem | null>(null)
  const [plan, setPlan] = useState<SiteSetupPlan | null>(null)
  // Re-probed while the review is open: a stack installed mid-review has to appear without the
  // user closing and reopening the dialog.
  const availableStacks = useAvailableSiteStacks()
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
      const root = await window.api.siteRoots.primary()
      if (cancelled) {
        return
      }
      if (root.ok) {
        setDestinationRoot(root.value)
      }
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
      setLinkCloneProblem(null)
      return
    }
    if (fields.reponame.length === 0) {
      setLinkCloneProblem({ kind: 'not-found', error: '' })
      return
    }
    let cancelled = false
    void (async () => {
      const result = await window.api.siteSetup.cloneTargets({ reponame: fields.reponame })
      if (cancelled) {
        return
      }
      const url = result.ok ? (result.value.targets[0]?.cloneUrl ?? '') : ''
      setLinkCloneUrl(url)
      setLinkCloneProblem(
        url.length > 0
          ? null
          : !result.ok
            ? { kind: 'lookup-failed', error: result.error }
            : !result.value.connectorConfigured
              ? { kind: 'no-connector', error: '' }
              : result.value.error.length > 0
                ? { kind: 'lookup-failed', error: result.value.error }
                : { kind: 'not-found', error: '' }
      )
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
    const environment = resolveSetupEnvironment({
      linkEnvironment: request.kind === 'link' ? request.pending.fields.environment : '',
      planEnvironment: plan?.import.environment ?? '',
      isLink: request.kind === 'link'
    })
    setChoices(
      defaultSetupChoices({
        plan,
        domain,
        stack: pickDefaultStack(availableStacks, plan?.stack.stack ?? null),
        certSupported: true,
        environment,
        importFromSource: request.kind === 'link'
      })
    )
  }, [seedKey, availableStacks, plan, planSiteId, repo, request])

  // A stack installed while the review is open (the Serve row's own Install button, or Terminal)
  // has to become the choice, not wait for the dialog to be reopened.
  const firstStack = availableStacks?.[0] ?? null
  useEffect(() => {
    if (firstStack === null || availableStacks === null) {
      return
    }
    setChoices((current) => {
      if (!current || current.serve.stack !== null) {
        return current
      }
      const stack = pickDefaultStack(availableStacks, plan?.stack.stack ?? null)
      return {
        ...current,
        serve: {
          enabled: stack !== null,
          stack,
          domain: domainForStack(current.serve.domain, stack)
        },
        https: stack !== null
      }
    })
  }, [firstStack, availableStacks, plan])

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

  // Nothing decided the stack for the user, and there is a real choice: ask in the row, not behind
  // a pencil they have no reason to press.
  const detectedStack = plan?.stack.stack ?? null
  const promptStackChoice =
    (availableStacks?.length ?? 0) > 1 &&
    !(detectedStack && detectedStack !== 'plain' && availableStacks?.includes(detectedStack)) &&
    !readLastLocalStackChoice()

  return {
    promptStackChoice,
    destinationRoot,
    setDestinationRoot,
    linkTarget,
    setLinkTarget,
    linkCloneUrl,
    linkCloneProblem,
    plan,
    availableStacks,
    cert,
    choices,
    setChoices
  }
}
