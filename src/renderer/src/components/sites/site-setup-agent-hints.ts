// An agent's suggestions for the review, laid over the dialog's own defaults. Only what the agent
// named changes, and a stack that is not installed is ignored rather than shown as broken.

import type { SiteSetupAgentHints } from '../../../../shared/site-setup-agent-types'
import type { SiteLocalStack } from '../../../../shared/site-types'
import type { SiteSetupChoices } from './site-setup-choices'
import { domainForStack } from './site-setup-stack-domain'

export function applyAgentHints(
  choices: SiteSetupChoices,
  hints: SiteSetupAgentHints,
  availableStacks: readonly SiteLocalStack[],
  agentLocalSuffix: string | null
): SiteSetupChoices {
  let next = choices
  if (hints.stack && availableStacks.includes(hints.stack)) {
    next = {
      ...next,
      serve: {
        ...next.serve,
        stack: hints.stack,
        domain: domainForStack(next.serve.domain, hints.stack, next.serve.stack, agentLocalSuffix)
      }
    }
  }
  if (hints.domain) {
    next = { ...next, serve: { ...next.serve, domain: hints.domain } }
  }
  if (hints.serve === false) {
    next = { ...next, serve: { ...next.serve, enabled: false }, https: false }
  } else if (hints.serve === true && next.serve.stack !== null) {
    next = { ...next, serve: { ...next.serve, enabled: true } }
  }
  if (hints.import !== undefined) {
    next = { ...next, import: { ...next.import, enabled: hints.import } }
  }
  return next
}
