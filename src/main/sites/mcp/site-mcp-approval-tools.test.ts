import { afterEach, describe, expect, it } from 'vitest'
import { clearStagedSetupWritesForTests, stageSetupWrite } from './site-mcp-approval-tools'
import { createFakeContext } from './site-mcp-fake-context'
import { dispatchSiteMcpTool, findSiteMcpTool, listSiteMcpToolDescriptors } from './site-mcp-tools'

const GATED = [
  'collect_setup_approval',
  'create_environment',
  'delete_environment',
  'duplicate_environment',
  'rename_environment',
  'set_deployment_fields',
  'set_deployment_toggles'
]

function parse(result: { content: { text: string }[] }): Record<string, unknown> {
  return JSON.parse(result.content[0].text) as Record<string, unknown>
}

async function collect(
  context: ReturnType<typeof createFakeContext>,
  approvalId: unknown
): Promise<Record<string, unknown>> {
  const tool = findSiteMcpTool('collect_setup_approval')!
  return parse(
    await dispatchSiteMcpTool(context, tool, { approval_id: approvalId, wait_seconds: 0 })
  )
}

const write = {
  action: 'configure_site',
  title: 'Configure acme',
  summary: 'Set the SSH host',
  details: [],
  siteId: 'site-1',
  siteName: 'acme'
}

afterEach(() => clearStagedSetupWritesForTests())

describe('site setup gate', () => {
  it('hides the write tools while the setting is off and lists them when on', () => {
    const off = listSiteMcpToolDescriptors(
      createFakeContext(undefined, { siteSetupEnabled: false })
    )
    const on = listSiteMcpToolDescriptors(createFakeContext(undefined, { siteSetupEnabled: true }))
    const offNames = new Set(off.map((tool) => tool.name))
    const onNames = new Set(on.map((tool) => tool.name))
    for (const name of GATED) {
      expect(offNames.has(name)).toBe(false)
      expect(onNames.has(name)).toBe(true)
    }
    expect(offNames.has('list_sites')).toBe(true)
  })

  it('refuses a hidden tool called by name and runs nothing', async () => {
    const context = createFakeContext(undefined, { siteSetupEnabled: false })
    const tool = findSiteMcpTool('set_deployment_fields')!
    const result = await dispatchSiteMcpTool(context, tool, { site: 'acme', fields: {} })
    expect(result.isError).toBe(true)
    expect(parse(result).error).toMatch(/Let agents create and set up projects/)
  })
})

describe('staged setup writes', () => {
  it('stays pending until the user answers, then runs the write once on approval', async () => {
    let runs = 0
    const pendingContext = createFakeContext()
    const staged = await stageSetupWrite(pendingContext, write, async () => {
      runs += 1
      return { ok: true }
    })
    expect(staged.status).toBe('pending')
    expect(pendingContext.approvalRequests[0]).toMatchObject({ action: 'configure_site' })
    expect((await collect(pendingContext, staged.approval_id)).status).toBe('pending')
    expect(runs).toBe(0)

    const approvedContext = createFakeContext(undefined, { approvalDecision: 'approved' })
    expect(await collect(approvedContext, staged.approval_id)).toMatchObject({
      status: 'approved',
      result: { ok: true }
    })
    expect(runs).toBe(1)
    expect((await collect(approvedContext, staged.approval_id)).status).toBe('unknown')
  })

  it('drops the write when the user denies it', async () => {
    let runs = 0
    const context = createFakeContext(undefined, { approvalDecision: 'denied' })
    const staged = await stageSetupWrite(context, write, async () => {
      runs += 1
    })
    expect((await collect(context, staged.approval_id)).status).toBe('denied')
    expect(runs).toBe(0)
  })

  it('runs at once for a site already approved this session', async () => {
    const context = createFakeContext(undefined, { approvedSiteIds: ['site-1'] })
    const result = await stageSetupWrite(context, write, async () => 'done')
    expect(result).toEqual({ status: 'approved', result: 'done' })
  })
})
