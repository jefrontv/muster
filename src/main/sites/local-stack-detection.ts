// Which stack manages a folder, asked of every stack rather than only LocalWP.
//
// Order matters and is not arbitrary. agent-local can serve a folder that still has LocalWP's
// `app/public` layout on disk — that is exactly what adopting a LocalWP site produces — so a
// layout check would answer "localwp" for a site agent-local really runs. Only the daemons
// themselves know, and agent-local is asked first because its answer is authoritative where the
// two overlap.

import type { LocalWpStackDetection } from '../../shared/site-stack-types'
import { providerFor } from './local-stack-provider'
// Side-effect import: the agent-local provider registers itself with the registry on load.
import './agent-local-site-control'
import { detectLocalWpStack } from './localwp-detection'
import { createLocalWpHost } from './localwp-host'

export async function detectSiteStack(sitePath: string): Promise<LocalWpStackDetection> {
  const agentLocal = await providerFor('agent-local')
    .detect(sitePath)
    // A missing or wedged daemon must not stop LocalWP detection from answering.
    .catch(() => null)
  if (agentLocal?.stack === 'agent-local') {
    return agentLocal
  }
  return detectLocalWpStack(createLocalWpHost(), sitePath)
}
