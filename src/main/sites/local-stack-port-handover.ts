// Two local stacks on one machine both want :80 and :443, and only one can have them.
//
// LocalWP binds the privileged ports directly and cannot be asked to give them back, so the site it
// serves simply fails to come up if something else got there first. agent-local can stand aside on
// request (`POST /yield`) and reclaims the ports automatically once they are free again. That
// asymmetry is the whole design: the stack that CAN yield does, right before the stack that cannot
// is started.
//
// Every start therefore asks the other stacks to release the ports first. Only agent-local
// implements the hook today, so in practice this is "agent-local steps aside for LocalWP", and
// starting an agent-local site asks nobody (a stack is never told to yield to itself).

import type { Site } from '../../shared/site-types'
import {
  localStackProviders,
  providerFor,
  type LocalStackOutcome,
  type LocalStackSiteRef
} from './local-stack-provider'

/**
 * Long enough for a cold LocalWP site to bind its ports (nginx comes up well inside this), short
 * enough that a start which fails outright does not leave the machine without a web server for
 * minutes. agent-local reclaims the moment the ports go quiet, so this is an upper bound rather
 * than a duration anything waits out.
 */
export const PRIVILEGED_PORT_YIELD_SECONDS = 60

/**
 * Asks every stack other than `target` to stand off the privileged ports.
 *
 * Failures are swallowed on purpose. A stack that cannot yield — no daemon, an older build with no
 * `/yield` route, a refusal — leaves the ports exactly where they already were, which is the
 * situation the caller was in anyway. Turning that into a thrown error would convert "your other
 * stack is old" into "this site will not start".
 */
export async function releasePrivilegedPortsForOtherStacks(
  target: Site['localStack'],
  onStatus?: (message: string) => void
): Promise<void> {
  const others = localStackProviders().filter(
    (provider) => provider.id !== target && provider.releasePrivilegedPorts
  )
  await Promise.all(
    others.map(async (provider) => {
      try {
        const released = await provider.releasePrivilegedPorts?.(PRIVILEGED_PORT_YIELD_SECONDS)
        if (released) {
          onStatus?.(`Asked ${provider.id} to release ports 80 and 443.`)
        }
      } catch {
        // Deliberately silent: see the note above.
      }
    })
  )
}

/**
 * The one way to start a site's stack. Both callers — the import pipeline and the
 * `siteStacks:start` IPC — go through here so a site started from the UI and a site started by a
 * run get the same port handover.
 */
export async function startStackWithPortHandover(
  site: LocalStackSiteRef,
  onStatus?: (message: string) => void
): Promise<LocalStackOutcome> {
  await releasePrivilegedPortsForOtherStacks(site.localStack, onStatus)
  return providerFor(site.localStack).ensureRunning(site, onStatus)
}
