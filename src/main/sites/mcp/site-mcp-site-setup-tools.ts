// The whole "set up this site" in Muster's own Set up dialog: the agent opens it prefilled, the user
// checks it and presses one button, and the agent waits on the run instead of sleeping.

import type { SiteSetupAgentReport } from '../../../shared/site-setup-agent-types'
import { readNumber, readString, resolveMcpSite, SiteMcpToolError } from './site-mcp-arguments'
import { siteMcpClientName } from './site-mcp-client-identity'
import type { SiteMcpContext, SiteMcpTool } from './site-mcp-context'
import { objectSchema, SITE_PROPERTY } from './site-mcp-schemas'

const WAIT_DEFAULT_SECONDS = 25
const WAIT_MAX_SECONDS = 600
/** One bridge request at a time, short enough to send the client a progress line between them. */
const SLICE_MS = 10_000
const STEP_NAMES: Record<string, string> = {
  clone: 'Cloning',
  register: 'Saving the site',
  serve: 'Setting up the local site',
  https: 'Setting up HTTPS',
  import: 'Importing'
}

type Answer =
  | { known: false }
  | { known: true; label: string; version: number; report: SiteSetupAgentReport }

/** The last version this session saw per setup, so each wait answers with what is new. */
const seenVersions = new Map<string, number>()

function describe(label: string, report: SiteSetupAgentReport): string {
  switch (report.state) {
    case 'opening':
    case 'reviewing':
      return `The Set up ${label} dialog is open in Muster, waiting for the user to press Set up site.`
    case 'running': {
      const step = STEP_NAMES[report.step] ?? 'Working'
      return report.percent === null ? `${step}…` : `${step} · ${report.percent}%`
    }
    case 'attention':
      return `${STEP_NAMES[report.step] ?? 'A step'} failed: ${report.detail || 'no reason given'}. The dialog is open so the user can retry.`
    case 'done':
      return `${label} is set up.`
    case 'cancelled':
      return 'The user closed setup without starting it.'
    case 'failed':
      return `Setup stopped: ${report.detail || 'the user closed it before it finished'}.`
  }
}

function nextStep(report: SiteSetupAgentReport): string {
  switch (report.state) {
    case 'opening':
    case 'reviewing':
    case 'running':
    case 'attention':
      return 'Call wait_for_site_setup again with the same setup_id. Do not sleep or poll another way.'
    case 'done':
      return 'Tell the user what is set up in one or two lines. If a step was skipped or failed, say which and what fixes it (get_setup_plan lists what is still missing).'
    case 'cancelled':
    case 'failed':
      return 'Do not reopen setup unless the user asks.'
  }
}

async function waitOnce(
  context: SiteMcpContext,
  setupId: string,
  afterVersion: number,
  waitMs: number
): Promise<Answer> {
  return (await context.readSetup('agent-setup', { setupId, afterVersion, waitMs })) as Answer
}

export const SITE_MCP_SITE_SETUP_TOOLS: readonly SiteMcpTool[] = [
  {
    name: 'open_site_setup',
    description:
      'Open prefilled Set up site dialog in Muster (clones/registers/serves/HTTPS/imports in one user-triggered run; no separate approval card). Pass clone_url or existing site, then poll wait_for_site_setup with setup_id. Prefer over create_project + register_site.',
    inputSchema: objectSchema({
      clone_url: { type: 'string', description: 'Git URL to clone for a new site.' },
      ...SITE_PROPERTY,
      stack: {
        type: 'string',
        enum: ['agent-local', 'ddev', 'localwp'],
        description: 'Suggested stack (defaults to Muster preference).'
      },
      domain: { type: 'string', description: 'Suggested local domain (e.g. aidc.test).' },
      serve: {
        type: 'boolean',
        description: 'Suggest serving locally.'
      },
      import: {
        type: 'boolean',
        description: 'Suggest running initial import.'
      }
    }),
    requiresSiteSetup: true,
    async run(context, args) {
      const cloneUrl = readString(args, 'clone_url')
      const siteSelector = readString(args, 'site')
      if (Boolean(cloneUrl) === Boolean(siteSelector)) {
        throw new SiteMcpToolError('Pass exactly one of `clone_url` or `site`.')
      }
      const siteId = siteSelector ? resolveMcpSite(context, siteSelector).id : ''
      const opened = (await context.writeSetup('open-agent-setup', 'agent-setup', {
        cloneUrl,
        siteId,
        stack: readString(args, 'stack'),
        domain: readString(args, 'domain'),
        ...(typeof args.serve === 'boolean' ? { serve: args.serve } : {}),
        ...(typeof args.import === 'boolean' ? { import: args.import } : {}),
        agent: siteMcpClientName() ?? ''
      })) as { setup_id: string; label: string }
      seenVersions.set(opened.setup_id, 0)
      return {
        ok: true,
        setup_id: opened.setup_id,
        status: 'opened',
        tell_user: `Setup for ${opened.label} is open in Muster. Check it and press Set up site. If you have the site's muster:// link, click it now to add the server login.`,
        next_step: 'Call wait_for_site_setup with this setup_id.'
      }
    }
  },
  {
    name: 'wait_for_site_setup',
    description:
      'Long-poll setup_id from open_site_setup until state changes or wait_seconds elapses (emits progress). Poll again until done, cancelled, or failed — never sleep.',
    inputSchema: objectSchema(
      {
        setup_id: { type: 'string', description: 'The setup_id open_site_setup returned.' },
        wait_seconds: {
          type: 'number',
          description: `Wait limit in seconds (default ${WAIT_DEFAULT_SECONDS}, max ${WAIT_MAX_SECONDS}).`
        }
      },
      ['setup_id']
    ),
    requiresSiteSetup: true,
    async run(context, args) {
      const setupId = readString(args, 'setup_id')
      const waitSeconds = readNumber(
        args,
        'wait_seconds',
        // A progress token buys no time: most clients keep a fixed deadline regardless.
        WAIT_DEFAULT_SECONDS,
        WAIT_MAX_SECONDS
      )
      const afterVersion = seenVersions.get(setupId) ?? 0
      const deadline = Date.now() + waitSeconds * 1_000
      let ticks = 0
      let answer = await waitOnce(
        context,
        setupId,
        afterVersion,
        Math.min(SLICE_MS, waitSeconds * 1_000)
      )
      while (
        answer.known &&
        answer.version <= afterVersion &&
        Date.now() < deadline &&
        !['done', 'cancelled', 'failed'].includes(answer.report.state)
      ) {
        ticks += 1
        context.progress?.({ message: describe(answer.label, answer.report), progress: ticks })
        answer = await waitOnce(
          context,
          setupId,
          afterVersion,
          Math.min(SLICE_MS, Math.max(0, deadline - Date.now()))
        )
      }
      if (!answer.known) {
        return {
          ok: false,
          setup_id: setupId,
          state: 'unknown',
          message:
            'No setup with that id. It was never opened or finished over an hour ago. Stop waiting.'
        }
      }
      seenVersions.set(setupId, answer.version)
      const { report } = answer
      return {
        ok: report.state !== 'failed',
        setup_id: setupId,
        state: report.state,
        ...(report.step ? { step: report.step } : {}),
        ...(report.percent !== null ? { percent: report.percent } : {}),
        message: describe(answer.label, report),
        ...(report.result
          ? {
              site_id: report.result.siteId,
              path: report.result.path,
              steps: report.result.steps
            }
          : {}),
        next_step: nextStep(report)
      }
    }
  }
]
