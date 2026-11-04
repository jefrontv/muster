import { describe, expect, it } from 'vitest'
import type { SiteSetupAgentReport } from '../../../shared/site-setup-agent-types'
import { createFakeContext } from './site-mcp-fake-context'
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

function answer(version: number, report: Partial<SiteSetupAgentReport>) {
  return {
    known: true,
    label: 'aidc',
    version,
    report: { state: 'reviewing', step: '', percent: null, detail: '', result: null, ...report }
  }
}

describe('open_site_setup', () => {
  it('opens the dialog for a clone without an approval card', async () => {
    const context = createFakeContext()
    context.writeSetup = async (op, approvalId, args) => {
      context.setupWrites.push({ op, approvalId, args })
      return { setup_id: 'setup-1', label: 'aidc', status: 'opened' }
    }
    const { payload } = await call(context, 'open_site_setup', {
      clone_url: 'git@bitbucket.org:efront_au/aidc.git',
      stack: 'agent-local',
      serve: true
    })
    expect(payload).toMatchObject({ ok: true, setup_id: 'setup-1', status: 'opened' })
    expect(String(payload.tell_user)).toContain('Set up site')
    expect(context.approvalRequests).toEqual([])
    expect(context.setupWrites[0]).toMatchObject({
      op: 'open-agent-setup',
      args: { cloneUrl: 'git@bitbucket.org:efront_au/aidc.git', stack: 'agent-local', serve: true }
    })
  })

  it('needs exactly one of a clone URL or a site', async () => {
    const context = createFakeContext()
    expect((await call(context, 'open_site_setup', {})).isError).toBe(true)
    expect(
      (await call(context, 'open_site_setup', { clone_url: 'git@x:a/b.git', site: 'Acme' })).isError
    ).toBe(true)
  })

  it('is hidden with the setup setting off', async () => {
    const context = createFakeContext(undefined, { siteSetupEnabled: false })
    expect((await call(context, 'open_site_setup', { site: 'Acme' })).isError).toBe(true)
  })
})

describe('wait_for_site_setup', () => {
  it('reports progress while a step runs and answers when the step changes', async () => {
    const context = createFakeContext()
    const answers = [
      answer(1, { state: 'running', step: 'clone', percent: 20 }),
      answer(1, { state: 'running', step: 'clone', percent: 70 }),
      answer(2, { state: 'running', step: 'register' })
    ]
    const asked: number[] = []
    context.readSetup = async (_op, args) => {
      asked.push(args.afterVersion as number)
      return answers.shift()
    }
    const progress: string[] = []
    context.progress = (update) => progress.push(update.message)
    // The first call sees version 1 as new; the second waits past it.
    expect(
      (await call(context, 'wait_for_site_setup', { setup_id: 'setup-x' })).payload
    ).toMatchObject({
      state: 'running',
      step: 'clone',
      percent: 20
    })
    const { payload } = await call(context, 'wait_for_site_setup', { setup_id: 'setup-x' })
    expect(payload).toMatchObject({ state: 'running', step: 'register' })
    expect(progress).toEqual(['Cloning · 70%'])
    expect(asked).toEqual([0, 1, 1])
  })

  it('returns the site and every step when it is done', async () => {
    const context = createFakeContext()
    context.readSetup = async () =>
      answer(4, {
        state: 'done',
        result: {
          siteId: 's1',
          path: '/Sites/aidc',
          steps: [{ id: 'import', state: 'skipped', detail: 'No server login' }]
        }
      })
    const { payload } = await call(context, 'wait_for_site_setup', { setup_id: 'setup-done' })
    expect(payload).toMatchObject({
      ok: true,
      state: 'done',
      site_id: 's1',
      path: '/Sites/aidc',
      steps: [{ id: 'import', state: 'skipped' }]
    })
  })

  it('tells the agent to stop on an unknown id or a closed dialog', async () => {
    const context = createFakeContext()
    context.readSetup = async () => ({ known: false })
    expect(
      (await call(context, 'wait_for_site_setup', { setup_id: 'gone' })).payload
    ).toMatchObject({
      state: 'unknown'
    })
    context.readSetup = async () => answer(2, { state: 'cancelled' })
    const closed = await call(context, 'wait_for_site_setup', { setup_id: 'closed' })
    expect(closed.payload).toMatchObject({ state: 'cancelled' })
    expect(String(closed.payload.next_step)).toContain('Do not reopen')
  })
})
