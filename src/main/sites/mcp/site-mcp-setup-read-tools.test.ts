import { describe, expect, it } from 'vitest'
import { createFakeContext } from './site-mcp-fake-context'
import { dispatchSiteMcpTool, findSiteMcpTool, listSiteMcpToolDescriptors } from './site-mcp-tools'

const READ_TOOLS = [
  'list_projects',
  'list_clone_sources',
  'discover_site_folders',
  'get_setup_plan',
  'detect_local_stack'
]

async function call(
  context: ReturnType<typeof createFakeContext>,
  name: string,
  args: Record<string, unknown> = {}
): Promise<{ isError: boolean; payload: Record<string, unknown> }> {
  const result = await dispatchSiteMcpTool(context, findSiteMcpTool(name)!, args)
  return {
    isError: result.isError === true,
    payload: JSON.parse(result.content[0].text) as Record<string, unknown>
  }
}

describe('setup read tools', () => {
  it('stay listed with the setup setting off, since they change nothing', () => {
    const names = listSiteMcpToolDescriptors(
      createFakeContext(undefined, { siteSetupEnabled: false })
    ).map((tool) => tool.name)
    for (const name of READ_TOOLS) {
      expect(names).toContain(name)
    }
  })

  it('filters projects by name or path', async () => {
    const context = createFakeContext(undefined, {
      setupReadAnswers: {
        projects: [
          { id: 'r1', name: 'acme', path: '/Sites/acme', kind: 'git', host: 'local', site: null },
          {
            id: 'r2',
            name: 'notes',
            path: '/Docs/notes',
            kind: 'folder',
            host: 'local',
            site: null
          }
        ]
      }
    })
    const { payload } = await call(context, 'list_projects', { query: 'docs' })
    expect(payload).toMatchObject({ count: 1, total: 1, projects: [{ id: 'r2', kind: 'folder' }] })
  })

  it("lists providers without a provider, and a provider's repos with one", async () => {
    const context = createFakeContext(undefined, {
      setupReadAnswers: {
        'clone-sources': {
          provider: 'bitbucket',
          repos: [
            {
              provider: 'bitbucket',
              fullName: 'efront/acme',
              cloneUrl: 'git@bitbucket.org:efront/acme.git',
              description: '',
              updatedAt: 0,
              isPrivate: true
            },
            {
              provider: 'bitbucket',
              fullName: 'efront/other',
              cloneUrl: 'git@bitbucket.org:efront/other.git',
              description: '',
              updatedAt: null,
              isPrivate: true
            }
          ],
          error: '',
          truncated: false,
          searchesRemotely: false
        }
      }
    })
    const { payload } = await call(context, 'list_clone_sources', {
      provider: 'bitbucket',
      query: 'acme'
    })
    expect(payload).toMatchObject({
      ok: true,
      count: 1,
      repos: [{ full_name: 'efront/acme', clone_url: 'git@bitbucket.org:efront/acme.git' }]
    })
    expect(context.setupReads.at(-1)).toEqual({
      op: 'clone-sources',
      args: { provider: 'bitbucket', query: 'acme' }
    })
  })

  it('searches every connected host when given only a name', async () => {
    const context = createFakeContext()
    const repo = (provider: string, fullName: string, updatedAt: number) => ({
      provider,
      fullName,
      cloneUrl: `git@${provider}.org:${fullName}.git`,
      description: '',
      updatedAt,
      isPrivate: true
    })
    context.readSetup = async (_op, args) => {
      if (!args.provider) {
        return {
          providers: [
            { id: 'bitbucket', label: 'Bitbucket', configured: true, reason: '' },
            { id: 'github', label: 'GitHub', configured: true, reason: '' }
          ]
        }
      }
      return {
        provider: args.provider,
        repos:
          args.provider === 'bitbucket'
            ? [repo('bitbucket', 'efront_au/aidc', 1), repo('bitbucket', 'efront_au/other', 3)]
            : [repo('github', 'efront/aidc-api', 2)],
        error: '',
        truncated: false,
        searchesRemotely: false
      }
    }
    const { payload } = await call(context, 'list_clone_sources', { query: 'AIDC' })
    expect(payload).toMatchObject({
      ok: true,
      searched: ['bitbucket', 'github'],
      count: 2,
      repos: [{ full_name: 'efront/aidc-api' }, { full_name: 'efront_au/aidc' }]
    })
  })

  it('asks for the plan of the resolved site, with its branch', async () => {
    const context = createFakeContext()
    const { payload } = await call(context, 'get_setup_plan', { site: 'Acme' })
    expect(payload).toMatchObject({ ok: true, site_id: 'site-1', next_stage: null })
    expect(context.setupReads.at(-1)).toEqual({
      op: 'setup-plan',
      args: { siteId: 'site-1', branch: 'main', environment: '' }
    })
  })

  it('detects the stack for a site path or a bare folder, not both', async () => {
    const context = createFakeContext()
    await call(context, 'detect_local_stack', { path: '/Sites/new' })
    expect(context.setupReads.at(-1)?.args).toEqual({ path: '/Sites/new', preferred: '' })
    const both = await call(context, 'detect_local_stack', { site: 'Acme', path: '/Sites/new' })
    expect(both.isError).toBe(true)
  })
})
