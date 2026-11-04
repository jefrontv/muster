// Staged writes: a setup tool asks the user first, and the write runs only once they approve.
//
// The staged work lives in this process, which is the agent's own MCP server and lives for its
// session. `collect_setup_approval` runs it on approval, so the agent never re-sends the arguments
// and cannot swap them after the user has seen the card.

import type {
  SiteSetupApprovalDecision,
  SiteSetupApprovalInput
} from '../../../shared/site-setup-approval-types'
import { readNumber, readRequiredString } from './site-mcp-arguments'
import { siteMcpClientName } from './site-mcp-client-identity'
import type { SiteMcpContext, SiteMcpTool } from './site-mcp-context'
import { HOLD_DEFAULT_SECONDS, HOLD_MAX_SECONDS, holdInSlices } from './site-mcp-held-wait'
import { objectSchema } from './site-mcp-schemas'

type StagedWrite = { action: string; perform: (approvalId: string) => Promise<unknown> }

const staged = new Map<string, StagedWrite>()

function approved(decision: SiteSetupApprovalDecision): boolean {
  return decision === 'approved' || decision === 'approved-site'
}

/**
 * Asks the user, and runs `perform` once they approve. A site already approved for this session
 * runs at once. Otherwise the result tells the agent to call `collect_setup_approval`.
 */
export async function stageSetupWrite(
  context: SiteMcpContext,
  input: Omit<SiteSetupApprovalInput, 'agent'>,
  perform: (approvalId: string) => Promise<unknown>
): Promise<Record<string, unknown>> {
  const opened = await context.requestSetupApproval({ ...input, agent: siteMcpClientName() })
  if (opened.decision && approved(opened.decision)) {
    return { status: 'approved', result: await perform(opened.requestId) }
  }
  staged.set(opened.requestId, { action: input.action, perform })
  return {
    approval_id: opened.requestId,
    status: 'pending',
    next_step: `Muster is showing the user an approval card. Tell them to approve it in Muster, then call collect_setup_approval with approval_id "${opened.requestId}". Nothing has been written yet.`
  }
}

export const SITE_MCP_APPROVAL_TOOLS: readonly SiteMcpTool[] = [
  {
    name: 'collect_setup_approval',
    description:
      'Collect the answer to an approval card opened by a project or site setup tool. Waits up to `wait_seconds` and returns `status: "pending"` while the user decides. Pending is normal: call it again straight away until it settles, and never sleep or ask in chat instead. On approval the staged change runs and its result is returned. `denied` or `expired` means nothing was written. `unknown` means the id was never issued here or has aged out: stop polling.',
    inputSchema: objectSchema({
      approval_id: {
        type: 'string',
        description: 'The approval_id a setup tool returned.'
      },
      wait_seconds: {
        type: 'number',
        description: `How long to wait before answering "pending". Default ${HOLD_DEFAULT_SECONDS}, max ${HOLD_MAX_SECONDS}. Only raise it if your client's request timeout is longer.`
      }
    }),
    requiresSiteSetup: true,
    // A person is the latency here; blocking the dispatch chain would stall every other sites tool.
    concurrent: true,
    async run(context, args) {
      const approvalId = readRequiredString(args, 'approval_id')
      const write = staged.get(approvalId)
      if (!write) {
        return {
          approval_id: approvalId,
          status: 'unknown',
          message: 'No staged change with that id in this session. Do not keep polling.'
        }
      }
      const waitSeconds = readNumber(args, 'wait_seconds', HOLD_DEFAULT_SECONDS, HOLD_MAX_SECONDS)
      const outcome = await holdInSlices({
        context,
        waitSeconds,
        attempt: (waitMs) => context.collectSetupApproval({ requestId: approvalId, waitMs }),
        done: (answer) => answer.status !== 'pending',
        describe: () => 'Waiting for the user to approve the change in Muster'
      })
      if (outcome.status === 'pending') {
        return {
          approval_id: approvalId,
          status: 'pending',
          waiting_for: 'the user to approve or deny in Muster',
          open_for_seconds: Math.round(outcome.openedMs / 1_000),
          next_step:
            'The card is open in Muster. Call collect_setup_approval again now with the same approval_id. Do not end your turn, ask in chat or try another way until it settles.'
        }
      }
      staged.delete(approvalId)
      if (outcome.status === 'unknown') {
        return { approval_id: approvalId, status: 'unknown', message: 'The card has aged out.' }
      }
      if (!approved(outcome.decision)) {
        return {
          approval_id: approvalId,
          status: outcome.decision,
          message: `The user did not approve ${write.action}. Nothing was written.`
        }
      }
      return {
        approval_id: approvalId,
        status: 'approved',
        result: await write.perform(approvalId)
      }
    }
  }
]

/** Test-only: forget staged writes. */
export function clearStagedSetupWritesForTests(): void {
  staged.clear()
}
