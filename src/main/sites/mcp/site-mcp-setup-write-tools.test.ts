import { afterEach, describe, expect, it } from 'vitest'
import { clearStagedSetupWritesForTests } from './site-mcp-approval-tools'
import { createFakeContext, environment, siteRecord } from './site-mcp-fake-context'
import { dispatchSiteMcpTool, findSiteMcpTool } from './site-mcp-tools'

type Context = ReturnType<typeof createFakeContext>

async function call(
  context: Context,
  name: string,
  args: Record<string, unknown>
): Promise<{ isError: boolean; payload: Record<string, unknown> }> {
  const result = await dispatchSiteMcpTool(context, findSiteMcpTool(name)!, args)
  return {
    isError: result.isError === true,
    payload: JSON.parse(result.content[0].text) as Record<string, unknown>
  }
}

afterEach(() => clearStagedSetupWritesForTests())

describe('project write tools', () => {
  it('stages a clone and runs it with the approval id once approved', async () => {
    const context = createFakeContext(undefined, { approvalDecision: 'approved' })
    const staged = await call(context, 'create_project', {
      clone_url: 'git@bitbucket.org:efront/acme.git'
    })
    expect(staged.payload.status).toBe('pending')
    expect(context.setupWrites).toEqual([])
    expect(context.approvalRequests[0]).toMatchObject({ action: 'create_project', siteId: null })

    const collected = await call(context, 'collect_setup_approval', {
      approval_id: staged.payload.approval_id
    })
    expect(collected.payload.status).toBe('approved')
    expect(context.setupWrites).toEqual([
      {
        op: 'create-project',
        approvalId: staged.payload.approval_id,
        args: {
          cloneUrl: 'git@bitbucket.org:efront/acme.git',
          parentDir: '',
          path: '',
          kind: ''
        }
      }
    ])
  })

  it('refuses both a clone URL and a path, before showing a card', async () => {
    const context = createFakeContext()
    const result = await call(context, 'create_project', {
      clone_url: 'git@x:y.git',
      path: '/Sites/y'
    })
    expect(result.isError).toBe(true)
    expect(context.approvalRequests).toEqual([])
  })

  it("takes the favicon from the linked site's live domain", async () => {
    const context = createFakeContext([siteRecord()], {
      setupReadAnswers: {
        projects: [
          {
            id: 'r1',
            name: 'acme',
            path: '/Sites/acme',
            kind: 'git',
            host: 'local',
            site: { id: 'site-1', name: 'Acme' }
          }
        ]
      }
    })
    await call(context, 'update_project', { project: 'acme', use_site_favicon: true })
    expect(context.approvalRequests[0]).toMatchObject({
      siteId: 'project:r1',
      details: [{ label: 'Icon', value: 'Favicon from acme.com' }]
    })
  })

  it('never lets a project approval cover a removal', async () => {
    const context = createFakeContext(undefined, { approvedSiteIds: ['project:repo-1'] })
    const result = await call(context, 'remove_project', { project: 'acme' })
    expect(result.payload.status).toBe('pending')
    expect(context.approvalRequests[0].siteId).toBeNull()
  })
})

describe('site write tools', () => {
  it('rejects an unknown field before the card, so nothing half-applies', async () => {
    const context = createFakeContext()
    const result = await call(context, 'configure_site', {
      site: 'Acme',
      environments: [{ name: 'staging', fields: { hostnme: 'x' } }]
    })
    expect(result.isError).toBe(true)
    expect(context.approvalRequests).toEqual([])
  })

  it('refuses a password in the batch', async () => {
    const context = createFakeContext()
    const result = await call(context, 'configure_site', {
      site: 'Acme',
      environments: [{ name: 'main', fields: { password: 'hunter2' } }]
    })
    expect(result.isError).toBe(true)
  })

  it('creates a missing environment and fills it in, once approved for the site', async () => {
    const context = createFakeContext([siteRecord({ environments: { main: environment() } })], {
      approvedSiteIds: ['site-1']
    })
    const result = await call(context, 'configure_site', {
      site: 'Acme',
      environments: [
        { name: 'staging', copy_from: 'main', fields: { hostname: 'staging.acme.com' } },
        { name: 'main', toggles: { export_database: true } }
      ]
    })
    expect(result.payload).toMatchObject({ status: 'approved', result: { ok: true } })
    const site = context.store.getSite('site-1')!
    expect(site.environments.staging.hostname).toBe('staging.acme.com')
    expect(site.environments.main.exportDatabase).toBe(true)
  })

  it('registers the current project path', async () => {
    const context = createFakeContext(undefined, { approvalDecision: 'approved' })
    const staged = await call(context, 'register_site', { project: 'acme', name: 'Acme' })
    await call(context, 'collect_setup_approval', { approval_id: staged.payload.approval_id })
    expect(context.setupWrites[0]).toMatchObject({
      op: 'register-site',
      args: { path: '/Sites/acme', name: 'Acme', repoId: 'repo-1' }
    })
  })
})

describe('local setup tools', () => {
  it('asks for a password in Muster and never takes one as an argument', async () => {
    const context = createFakeContext(undefined, { approvedSiteIds: ['site-1'] })
    const staged = await call(context, 'request_site_secret', {
      site: 'Acme',
      env: 'main',
      kind: 'ssh'
    })
    expect(staged.payload.status).toBe('pending')
    expect(context.approvalRequests[0]).toMatchObject({
      action: 'request_site_secret',
      secret: { environment: 'main', kind: 'ssh' }
    })
    const smuggled = await call(context, 'request_site_secret', {
      env: 'main',
      kind: 'ssh',
      password: 'hunter2'
    })
    expect(smuggled.isError).toBe(true)
  })

  it('reports the environment as saved once the password card is approved', async () => {
    const context = createFakeContext(undefined, { approvalDecision: 'approved' })
    const staged = await call(context, 'request_site_secret', { env: 'main', kind: 'ssh' })
    const collected = await call(context, 'collect_setup_approval', {
      approval_id: staged.payload.approval_id
    })
    expect(collected.payload.result).toMatchObject({
      stored: true,
      saved_fields: { hostname: 'acme.example.com', username: 'deploy' }
    })
    expect(JSON.stringify(collected.payload)).not.toMatch(/password"/i)
  })

  it('refuses a password for an environment the site does not have', async () => {
    const result = await call(createFakeContext(), 'request_site_secret', { env: 'qa', kind: 'db' })
    expect(result.isError).toBe(true)
  })

  it('needs an admin email for LocalWP, and returns a job once approved', async () => {
    const context = createFakeContext(undefined, { approvalDecision: 'approved' })
    expect(
      (await call(context, 'set_up_local_site', { stack: 'localwp', domain: 'a.local' })).isError
    ).toBe(true)
    const staged = await call(context, 'set_up_local_site', {
      stack: 'ddev',
      domain: 'acme.ddev.site'
    })
    const collected = await call(context, 'collect_setup_approval', {
      approval_id: staged.payload.approval_id
    })
    expect(collected.payload).toMatchObject({
      status: 'approved',
      result: { next_step: expect.any(String) }
    })
    expect(context.setupWrites[0]).toMatchObject({
      op: 'set-up-local-site',
      args: { stack: 'ddev' }
    })
  })

  it('hands a bind link to Muster without a second card', async () => {
    const context = createFakeContext()
    const result = await call(context, 'import_site_config', {
      bind_link: 'muster://configure?x=1'
    })
    expect(result.payload.status).toBe('shown')
    expect(context.approvalRequests).toEqual([])
    expect(context.setupWrites[0]).toMatchObject({ op: 'stage-bind-link' })
  })

  it('refuses a bind link that carries a password and points at the password card', async () => {
    const context = createFakeContext()
    const result = await call(context, 'import_site_config', {
      bind_link: 'muster://configure?hostname=h.example.com&username=u&password=secret%21'
    })
    expect(result.isError).toBe(true)
    expect(JSON.stringify(result.payload)).toContain('request_site_secret')
    expect(context.setupWrites).toEqual([])
  })

  it('lists the ocsites sites on the card before importing', async () => {
    const context = createFakeContext()
    await call(context, 'import_site_config', { source: 'ocsites' })
    expect(context.approvalRequests[0].details[0]).toEqual({
      label: 'Acme',
      value: '/Sites/acme (already in Muster, updated)'
    })
  })
})
