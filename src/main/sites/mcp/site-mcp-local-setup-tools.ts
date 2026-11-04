// Passwords, local stacks and config imports for agents. A password is typed by the user into
// Muster and goes to the keychain; the agent only learns that it is stored.

import { parseSiteBindUrl } from '../site-bind-url'
import { readNumber, readString, resolveMcpSite, SiteMcpToolError } from './site-mcp-arguments'
import { stageSetupWrite } from './site-mcp-approval-tools'
import type { SiteMcpTool } from './site-mcp-context'
import { cardDetails } from './site-mcp-project-write-tools'
import { objectSchema, SITE_PROPERTY } from './site-mcp-schemas'

const STACKS = ['agent-local', 'ddev', 'localwp'] as const
const MAX_PREVIEW_ROWS = 20
const JOB_LOG_TAIL = 20

type JobView = {
  id: string
  label: string
  state: string
  log: string[]
  result: unknown
  error: string
  progress?: { phase: string; percent: number | null } | null
}

type OcsitesPreview = {
  found: boolean
  configDirectory: string
  sites: { name: string; path: string; environments: string[]; alreadyInMuster: boolean }[]
}

export const SITE_MCP_LOCAL_SETUP_TOOLS: readonly SiteMcpTool[] = [
  {
    name: 'request_site_secret',
    description:
      "Ask the user for an SSH or database password for one environment. They type it into Muster, or (SSH) use a muster:// configure link: they click it while the card is open, or copy it. The link also fills that environment's host, user, root path and live domain. The password goes straight to the keychain; you never see it. Collect with collect_setup_approval: `approved` means it is stored, and the result shows the environment's fields as saved. Use instead of ever asking for a password or a muster:// link in chat.",
    inputSchema: objectSchema(
      {
        ...SITE_PROPERTY,
        env: { type: 'string', description: 'Environment the password belongs to.' },
        kind: { type: 'string', enum: ['ssh', 'db'], description: 'SSH login or database.' }
      },
      ['env', 'kind']
    ),
    requiresSiteSetup: true,
    async run(context, args) {
      const site = resolveMcpSite(context, readString(args, 'site'))
      const environment = readString(args, 'env')
      const kind = readString(args, 'kind')
      if (kind !== 'ssh' && kind !== 'db') {
        throw new SiteMcpToolError('kind must be "ssh" or "db".')
      }
      if (!(environment in site.environments)) {
        throw new SiteMcpToolError(`${site.displayName} has no ${environment} environment.`, {
          environments: Object.keys(site.environments)
        })
      }
      const host = site.environments[environment].hostname
      return stageSetupWrite(
        context,
        {
          action: 'request_site_secret',
          title: `${kind === 'ssh' ? 'SSH' : 'Database'} password for ${site.displayName}`,
          summary: `Type the ${kind === 'ssh' ? 'SSH' : 'database'} password for the ${environment} environment.`,
          details: cardDetails([
            ['Environment', environment],
            ['Host', host]
          ]),
          siteId: site.id,
          siteName: site.displayName,
          secret: { environment, kind }
        },
        async () => {
          // A clipboard link may have filled the environment too; report what is saved now.
          const saved = resolveMcpSite(context, site.id).environments[environment]
          return {
            ok: true,
            stored: true,
            environment,
            kind,
            ...(saved
              ? {
                  saved_fields: {
                    hostname: saved.hostname,
                    username: saved.username,
                    root_path: saved.rootPath,
                    live_domain: saved.liveDomain
                  }
                }
              : {})
          }
        }
      )
    }
  },
  {
    name: 'set_up_local_site',
    description:
      "Set a site up on a local stack (Agent Local, DDEV or LocalWP) so it runs on this machine. Refused when a stack already serves it (see detect_local_stack). Takes minutes: once approved it returns a `job_id` to poll with get_setup_job. For LocalWP, Muster sets a random WordPress admin password; use Local's one-click admin.",
    inputSchema: objectSchema(
      {
        ...SITE_PROPERTY,
        stack: { type: 'string', enum: [...STACKS], description: 'Local stack to use.' },
        domain: { type: 'string', description: 'Local domain, e.g. acme.local.' },
        admin_email: { type: 'string', description: 'WordPress admin email. Required for LocalWP.' }
      },
      ['stack', 'domain']
    ),
    requiresSiteSetup: true,
    async run(context, args) {
      const site = resolveMcpSite(context, readString(args, 'site'))
      const stack = readString(args, 'stack')
      const domain = readString(args, 'domain')
      const adminEmail = readString(args, 'admin_email')
      if (!(STACKS as readonly string[]).includes(stack)) {
        throw new SiteMcpToolError(`stack must be one of ${STACKS.join(', ')}.`)
      }
      if (!domain) {
        throw new SiteMcpToolError('`domain` is required.')
      }
      if (stack === 'localwp' && !adminEmail) {
        throw new SiteMcpToolError('`admin_email` is required for LocalWP.')
      }
      return stageSetupWrite(
        context,
        {
          action: 'set_up_local_site',
          title: `Set up ${site.displayName} locally`,
          summary: `Create a ${stack} site for this checkout. Existing local sites are never overwritten.`,
          details: cardDetails([
            ['Folder', site.path],
            ['Stack', stack],
            ['Domain', domain],
            ['Admin email', adminEmail]
          ]),
          // Always its own card: it installs WordPress and creates a database.
          siteId: null,
          siteName: null
        },
        async (approvalId) => ({
          ...((await context.writeSetup('set-up-local-site', approvalId, {
            siteId: site.id,
            stack,
            domain,
            adminEmail
          })) as Record<string, unknown>),
          next_step: 'Poll get_setup_job with this job_id until it succeeds or fails.'
        })
      )
    }
  },
  {
    name: 'get_setup_job',
    description:
      'Progress of a long setup job (a clone from create_project, or set_up_local_site): `running`, `succeeded` or `failed`, the current step and percent when known, and the last log lines. Waits up to `wait_seconds` for a change, so call it again rather than sleeping. Needs Muster open.',
    inputSchema: objectSchema(
      {
        job_id: { type: 'string', description: 'The job_id a setup tool returned.' },
        wait_seconds: {
          type: 'number',
          description:
            'Wait up to this long for the step or percent to change before answering. Default 20, max 110. Use this instead of sleeping.'
        }
      },
      ['job_id']
    ),
    async run(context, args) {
      const job = (await context.readSetup('setup-job', {
        jobId: readString(args, 'job_id'),
        waitMs: readNumber(args, 'wait_seconds', 20, 110) * 1_000
      })) as JobView
      return {
        ok: job.state !== 'failed',
        job_id: job.id,
        label: job.label,
        state: job.state,
        ...(job.progress ? { step: job.progress.phase, percent: job.progress.percent } : {}),
        ...(job.error ? { error: job.error } : {}),
        log: job.log.slice(-JOB_LOG_TAIL),
        ...(job.state === 'running' ? {} : { result: job.result })
      }
    }
  },
  {
    name: 'import_site_config',
    description:
      'Bring in existing site configuration. `source: "ocsites"` imports every site from the legacy ocsites config (the card lists them first; stored passwords move to the keychain). `bind_link` hands a muster:// link without a password to Muster, which asks the user to confirm it. A link with a password is refused: ask the user to copy it and call request_site_secret instead.',
    inputSchema: objectSchema({
      source: {
        type: 'string',
        enum: ['ocsites'],
        description: 'Import the legacy ocsites config.'
      },
      bind_link: { type: 'string', description: 'A muster:// configure link.' }
    }),
    requiresSiteSetup: true,
    async run(context, args) {
      const bindLink = readString(args, 'bind_link')
      const source = readString(args, 'source')
      if (Boolean(bindLink) === Boolean(source)) {
        throw new SiteMcpToolError('Pass exactly one of `source` or `bind_link`.')
      }
      if (bindLink) {
        const parsed = parseSiteBindUrl(bindLink)
        if (parsed.ok && parsed.password.length > 0) {
          throw new SiteMcpToolError(
            'That link carries a password, which must not pass through an agent. Ask the user to copy the link, then call request_site_secret with kind "ssh": the card in Muster reads the link from their clipboard and fills the environment.'
          )
        }
        // Muster's own bind prompt is the approval for a link, so there is no second card.
        const staged = (await context.writeSetup('stage-bind-link', 'bind-prompt', {
          url: bindLink
        })) as { ok: boolean; error: string }
        if (!staged.ok) {
          throw new SiteMcpToolError(staged.error || 'Muster could not read that link.')
        }
        return {
          ok: true,
          status: 'shown',
          next_step: 'Muster is asking the user to confirm the link.'
        }
      }
      const preview = (await context.readSetup('ocsites-preview', {})) as OcsitesPreview
      if (!preview.found || preview.sites.length === 0) {
        throw new SiteMcpToolError(`No ocsites config found in ${preview.configDirectory}.`)
      }
      const shown = preview.sites.slice(0, MAX_PREVIEW_ROWS)
      return stageSetupWrite(
        context,
        {
          action: 'import_site_config',
          title: `Import ${preview.sites.length} sites from ocsites`,
          summary: 'Add these sites to Muster and move their stored passwords to the keychain.',
          details: cardDetails([
            ...shown.map((site): [string, string] => [
              site.name,
              `${site.path}${site.alreadyInMuster ? ' (already in Muster, updated)' : ''}`
            ]),
            [
              'More',
              preview.sites.length > shown.length
                ? `${preview.sites.length - shown.length} more`
                : ''
            ]
          ]),
          siteId: null,
          siteName: null
        },
        (approvalId) => context.writeSetup('import-ocsites', approvalId, {})
      )
    }
  }
]
