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
      'Prompt user in Muster for an SSH or DB password (or pasted muster:// link); passwords go straight to keychain. Collect via collect_setup_approval. Never ask for secrets in chat.',
    inputSchema: objectSchema(
      {
        ...SITE_PROPERTY,
        env: { type: 'string', description: 'Target environment.' },
        kind: { type: 'string', enum: ['ssh', 'db'], description: 'Credential kind.' }
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
      'Set up a local stack (Agent Local, DDEV, LocalWP) for a site (refused if already served). Returns job_id to poll with get_setup_job.',
    inputSchema: objectSchema(
      {
        ...SITE_PROPERTY,
        stack: { type: 'string', enum: [...STACKS], description: 'Local stack.' },
        domain: { type: 'string', description: 'Local domain, e.g. acme.local.' },
        admin_email: { type: 'string', description: 'WP admin email (required for LocalWP).' }
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
      'Long-poll a setup/clone job_id for state, progress percent, and tail log (waits up to wait_seconds; poll again instead of sleeping).',
    inputSchema: objectSchema(
      {
        job_id: { type: 'string', description: 'The job_id returned by a setup tool.' },
        wait_seconds: {
          type: 'number',
          description: 'Wait up to this long for change (default 20, max 110).'
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
      'Import sites from legacy ocsites config (source="ocsites") or apply a passwordless muster:// bind_link via confirmation prompt (links carrying passwords are refused; use request_site_secret).',
    inputSchema: objectSchema({
      source: {
        type: 'string',
        enum: ['ocsites'],
        description: 'Import legacy ocsites config.'
      },
      bind_link: { type: 'string', description: 'Passwordless muster:// configure link.' }
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
