// What the Local card's buttons do: start, stop, restart, set up, rename and trust, each disabling
// the card at once and showing a spinner only when the call is slow enough to need one.

import { useCallback, useState } from 'react'
import type { SiteLocalStack } from '../../../../shared/site-types'
import { translate } from '@/i18n/i18n'
import { rememberLocalStackChoice } from './last-local-stack-choice'
import { siteLocalStackLabel } from './site-local-stack-labels'
import type { SiteStackTransition } from './use-site-stack-status'

/** Long enough that a local start shows nothing, short enough that an SSH one still reassures. */
const SPINNER_DELAY_MS = 200

export type SiteStackPending = 'start' | 'stop' | 'restart' | 'setup' | 'rename' | 'trust' | ''

type Outcome = { ok: boolean; message: string }

export function useSiteStackActions(args: {
  siteId: string
  stack: SiteLocalStack
  servedDomain: string
  refresh: () => Promise<void>
  setTransition: (transition: SiteStackTransition) => void
}): {
  pending: SiteStackPending
  spinning: boolean
  status: string
  failure: string
  clearMessages: () => void
  startOrStop: (next: 'start' | 'stop') => Promise<void>
  restart: () => Promise<void>
  setUp: (domain: string) => Promise<boolean>
  rename: (domain: string) => Promise<boolean>
  trust: () => Promise<void>
} {
  const { siteId, stack, servedDomain, refresh, setTransition } = args
  const [pending, setPending] = useState<SiteStackPending>('')
  const [spinning, setSpinning] = useState(false)
  const [status, setStatus] = useState('')
  const [failure, setFailure] = useState('')

  const run = useCallback(
    async (
      label: Exclude<SiteStackPending, ''>,
      action: () => Promise<Outcome>
    ): Promise<boolean> => {
      // Disabled now so a double click cannot double-submit; the spinner waits for slow calls only.
      setPending(label)
      setStatus('')
      setFailure('')
      const spinner = setTimeout(() => setSpinning(true), SPINNER_DELAY_MS)
      try {
        const outcome = await action()
        if (outcome.ok) {
          setStatus(outcome.message)
        } else {
          setFailure(outcome.message)
        }
        return outcome.ok
      } finally {
        clearTimeout(spinner)
        setSpinning(false)
        setPending('')
      }
    },
    []
  )

  const control = async (action: 'start' | 'stop'): Promise<Outcome> => {
    setTransition(action === 'start' ? 'starting' : 'stopping')
    const answer =
      action === 'start'
        ? await window.api.siteStacks.start(siteId)
        : await window.api.siteStacks.stop(siteId)
    if (!answer.ok || !answer.value.ok) {
      setTransition(null)
    }
    return answer.ok
      ? { ok: answer.value.ok, message: answer.value.message }
      : { ok: false, message: answer.error }
  }

  const startOrStop = async (next: 'start' | 'stop'): Promise<void> => {
    await run(next, async () => {
      const outcome = await control(next)
      // The stack is the only source of truth for whether it worked; the pill settles on its answer.
      await refresh()
      return outcome
    })
  }

  const restart = async (): Promise<void> => {
    await run('restart', async () => {
      const stopped = await control('stop')
      const outcome = stopped.ok ? await control('start') : stopped
      await refresh()
      return outcome
    })
  }

  const setUp = (domain: string): Promise<boolean> =>
    run('setup', async () => {
      const request = {
        siteId,
        domain,
        // Only LocalWP seeds a wp-admin account; the other stacks adopt the install as-is.
        adminEmail: 'hello@efront.com.au',
        adminPassword: 'admin',
        stack
      }
      const planned = await window.api.siteStacks.previewMigration(request)
      if (!planned.ok) {
        return { ok: false, message: planned.error }
      }
      if (!planned.value.ok) {
        return { ok: false, message: planned.value.blockedReason }
      }
      // Setup ends in a start; polls mid-setup see a half-made project (stopped, Docker busy).
      setTransition('starting')
      const answer = await window.api.siteStacks.runMigration(request)
      await refresh()
      if (answer.ok && answer.value.ok) {
        // Same memory the setup wizard keeps, so the next setup opens on this stack.
        rememberLocalStackChoice(stack)
        return { ok: true, message: answer.value.message }
      }
      setTransition(null)
      // A leftover slug from a deleted checkout may already be serving this folder.
      const after = await window.api.siteStacks.detect(siteId)
      if (after.ok && after.value.stack === stack) {
        return {
          ok: true,
          message: translate(
            'auto.components.sites.SiteLocalStackCard.alreadyServing',
            '{{stack}} is already serving this folder.'
          ).replace('{{stack}}', siteLocalStackLabel(stack))
        }
      }
      return { ok: false, message: answer.ok ? answer.value.message : answer.error }
    })

  const rename = (domain: string): Promise<boolean> =>
    run('rename', async () => {
      const answer = await window.api.siteStacks.setDomain({ siteId, domain })
      await refresh()
      return answer.ok
        ? { ok: answer.value.ok, message: answer.value.message }
        : { ok: false, message: answer.error }
    })

  const trust = async (): Promise<void> => {
    await run('trust', async () => {
      const answer = await window.api.localwpCert.trust({ domain: servedDomain, stack })
      return answer.ok ? answer.value : { ok: false, message: answer.error }
    })
  }

  const clearMessages = useCallback(() => {
    setStatus('')
    setFailure('')
  }, [])

  return {
    pending,
    spinning,
    status,
    failure,
    clearMessages,
    startOrStop,
    restart,
    setUp,
    rename,
    trust
  }
}
