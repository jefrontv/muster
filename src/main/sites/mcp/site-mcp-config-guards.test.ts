import { describe, expect, it } from 'vitest'
import { call, createFakeContext, siteRecord } from './site-mcp-fake-context'

describe('set_deployment_fields value checks', () => {
  it.each([
    [{ db_port: 0 }, 'from 1 to 65535'],
    [{ db_port: 70_000 }, 'from 1 to 65535'],
    [{ search_replace_timeout_seconds: -5 }, 'from 0 to 86400'],
    [{ hostname: { nested: true } }, 'must be a string'],
    [{ notes: true }, 'must be a string'],
    [{ local_wp_root: '../elsewhere' }, 'relative path inside the site folder'],
    [{ local_wp_root: '/etc' }, 'relative path inside the site folder'],
    [{ hostname: 'x'.repeat(257) }, 'exceeds 256 characters']
  ])('refuses %j instead of storing a clamped or stringified value', async (fields, message) => {
    const context = createFakeContext()
    const before = JSON.stringify(context.store.getSite('site-1'))
    const outcome = await call(context, 'set_deployment_fields', { fields, env: 'main' })
    expect(outcome.isError).toBe(true)
    expect(String(outcome.payload.error)).toContain(message)
    expect(JSON.stringify(context.store.getSite('site-1'))).toBe(before)
  })

  it('restores the default timeout for a blank value and trims strings', async () => {
    const context = createFakeContext()
    await call(context, 'set_deployment_fields', {
      fields: { search_replace_timeout_seconds: '', hostname: '  new.example  ' },
      env: 'main'
    })
    const site = context.store.getSite('site-1')
    expect(site?.searchReplaceTimeoutSeconds).toBe(600)
    expect(site?.environments.main?.hostname).toBe('new.example')
  })

  it('advertises every field key and the local_stack enum in its schema', async () => {
    const { SITE_MCP_TOOLS } = await import('./site-mcp-tools')
    const tool = SITE_MCP_TOOLS.find((entry) => entry.name === 'set_deployment_fields')
    const fields = (tool?.inputSchema.properties.fields ?? {}) as {
      properties?: Record<string, { enum?: string[] }>
    }
    expect(fields.properties?.local_stack?.enum).toContain('agent-local')
    expect(Object.keys(fields.properties ?? {})).toContain('hostname')
  })
})

describe('set_deployment_toggles value checks', () => {
  it('refuses a toggle value that is not a boolean instead of reading it as off', async () => {
    const context = createFakeContext()
    const outcome = await call(context, 'set_deployment_toggles', {
      toggles: { export_database: 'yes' },
      env: 'main'
    })
    expect(outcome.isError).toBe(true)
    expect(String(outcome.payload.error)).toContain('must be true or false')
  })
})

describe('config writes on a branch that matches no environment', () => {
  it('refuses to guess which environment to change without env', async () => {
    const context = createFakeContext([siteRecord()], { branch: 'feature/login' })
    const outcome = await call(context, 'set_deployment_fields', {
      fields: { hostname: 'guessed.example' }
    })
    expect(outcome.isError).toBe(true)
    expect(String(outcome.payload.error)).toContain('Pass env')
  })

  it('still writes site-level fields, which belong to no environment', async () => {
    const context = createFakeContext([siteRecord()], { branch: 'feature/login' })
    const outcome = await call(context, 'set_deployment_fields', { fields: { notes: 'hello' } })
    expect(outcome.isError).toBe(false)
    expect(context.store.getSite('site-1')?.notes).toBe('hello')
  })
})

describe('custom steps added over MCP', () => {
  it('start unticked unless the caller asks, since they run on the next deploy anyone starts', async () => {
    const context = createFakeContext()
    const outcome = await call(context, 'create_custom_step', {
      name: 'Clear cache',
      group: 'deploy',
      runs_on: 'remote',
      command: 'wp cache flush'
    })
    expect(outcome.isError).toBe(false)
    const steps = context.store.getSite('site-1')?.customSteps ?? []
    expect(steps.at(-1)?.enabled).toBe(false)
  })
})
