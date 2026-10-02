// Which stack manages a folder, asked of every stack rather than only LocalWP.
//
// Order matters and is not arbitrary. agent-local can serve a folder that still has LocalWP's
// `app/public` layout on disk — that is exactly what adopting a LocalWP site produces — so a
// layout check would answer "localwp" for a site agent-local really runs. Only the daemons
// themselves know, and agent-local is asked first because its answer is authoritative where the
// two overlap. DDEV comes next: a `.ddev/config.yaml` says DDEV owns the folder even when it also
// has LocalWP's `app/public` shape. A stack the site has chosen is asked before that order: a
// folder can be served by two stacks at once (an Agent Local site moved onto DDEV), and the one
// the user picked is the one to report.

import type { LocalWpStackDetection } from '../../shared/site-stack-types'
import type { SiteLocalStack } from '../../shared/site-types'
import { providerFor } from './local-stack-provider'
// Side-effect import: the agent-local provider registers itself with the registry on load.
import './agent-local-site-control'
import './ddev-site-control'
import { detectLocalWpStack } from './localwp-detection'
import { createLocalWpHost } from './localwp-host'

const PREFERABLE_STACKS: readonly SiteLocalStack[] = ['agent-local', 'ddev', 'localwp']

export async function detectSiteStack(
  sitePath: string,
  preferred?: SiteLocalStack
): Promise<LocalWpStackDetection> {
  if (preferred && PREFERABLE_STACKS.includes(preferred)) {
    const chosen = await (
      preferred === 'localwp'
        ? detectLocalWpStack(createLocalWpHost(), sitePath)
        : providerFor(preferred).detect(sitePath)
    ).catch(() => null)
    if (chosen?.stack === preferred) {
      return chosen
    }
  }
  const agentLocal = await providerFor('agent-local')
    .detect(sitePath)
    // A missing or wedged daemon must not stop LocalWP detection from answering.
    .catch(() => null)
  if (agentLocal?.stack === 'agent-local') {
    return agentLocal
  }
  const ddev = await providerFor('ddev')
    .detect(sitePath)
    .catch(() => null)
  if (ddev?.stack === 'ddev') {
    return ddev
  }
  return detectLocalWpStack(createLocalWpHost(), sitePath)
}
