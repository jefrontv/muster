import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { SiteMcpToolError } from './mcp/site-mcp-arguments'
import {
  ACF_FIELDS_PHP,
  ACF_MAX_PATHS,
  buildAcfPayload,
  parseAcfPath,
  parseAcfRunnerStdout,
  parseAcfTarget,
  readAcfGetPaths,
  readAcfWrites
} from './wp-acf-payload'

describe('parseAcfPath', () => {
  it('parses spacing_templates.9.name as field, index 9, field', () => {
    expect(parseAcfPath('spacing_templates.9.name')).toEqual([
      { kind: 'field', name: 'spacing_templates' },
      { kind: 'index', index: 9 },
      { kind: 'field', name: 'name' }
    ])
  })

  it.each(['', '.a', 'a.', 'a..b', '9.name'])('rejects %j', (path) => {
    expect(() => parseAcfPath(path)).toThrow(SiteMcpToolError)
  })
})

describe('parseAcfTarget', () => {
  it('normalises options to option and omits empty id', () => {
    expect(parseAcfTarget({ kind: 'options' })).toEqual({ kind: 'option' })
  })

  it('requires id on post', () => {
    expect(() => parseAcfTarget({ kind: 'post' })).toThrow(/target.id/)
  })

  it('rejects an unknown kind', () => {
    expect(() => parseAcfTarget({ kind: 'widget' })).toThrow(/target.kind/)
  })
})

describe('payload caps', () => {
  it('refuses more than 40 paths', () => {
    const fields = Array.from({ length: ACF_MAX_PATHS + 1 }, (_, i) => `field_${i}`)
    expect(() => readAcfGetPaths({ fields })).toThrow(/at most 40/)
  })

  it('requires value on writes', () => {
    expect(() => readAcfWrites({ fields: [{ path: 'hero_title' }] })).toThrow(/value/)
  })
})

describe('parseAcfRunnerStdout', () => {
  it('extracts the JSON object from noisy WP-CLI stdout', () => {
    expect(parseAcfRunnerStdout('Notice: x\n{"ok":true,"home":"https://a.test"}\n')).toEqual({
      ok: true,
      home: 'https://a.test'
    })
  })

  it('throws when stdout has no JSON object', () => {
    expect(() => parseAcfRunnerStdout('Fatal error')).toThrow(/did not return JSON/)
  })
})

describe('buildAcfPayload', () => {
  it('serialises get paths and apply writes', () => {
    const getJson = buildAcfPayload({
      mode: 'get',
      target: { kind: 'option' },
      fields: ['hero_title']
    })
    expect(JSON.parse(getJson)).toMatchObject({
      mode: 'get',
      target: { kind: 'option' },
      fields: [{ path: 'hero_title' }]
    })
  })
})

describe('bundled PHP', () => {
  it('ships the walker source as a string', () => {
    expect(ACF_FIELDS_PHP).toContain('function muster_acf_run')
    expect(ACF_FIELDS_PHP).toContain('muster_acf_set_by_trace')
  })

  it('passes the PHP self-test when php is on PATH', () => {
    try {
      execFileSync('php', ['-v'], { stdio: 'ignore' })
    } catch {
      return
    }
    const script = fileURLToPath(new URL('./php/acf-fields.selftest.php', import.meta.url))
    const out = execFileSync('php', [script], { encoding: 'utf8' })
    expect(out.trim()).toBe('ok')
  })
})
