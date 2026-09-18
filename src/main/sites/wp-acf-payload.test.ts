import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { SiteMcpToolError } from './mcp/site-mcp-arguments'
import {
  ACF_FIELDS_PHP,
  ACF_MAX_PATHS,
  buildAcfPayload,
  explainAcfRunnerFailure,
  parseAcfPath,
  parseAcfRunnerOutcome,
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

  it('reads * as a wildcard wherever an index is legal', () => {
    expect(parseAcfPath('modules.*.slides.*.title')).toEqual([
      { kind: 'field', name: 'modules' },
      { kind: 'wildcard' },
      { kind: 'field', name: 'slides' },
      { kind: 'wildcard' },
      { kind: 'field', name: 'title' }
    ])
  })

  it('rejects a leading wildcard', () => {
    expect(() => parseAcfPath('*.section_id')).toThrow(/row index/)
  })
})

describe('wildcards in the path grammar', () => {
  it('lets get_wp_fields ask for a pattern', () => {
    expect(readAcfGetPaths({ fields: ['modules.*.section_id'] })).toEqual(['modules.*.section_id'])
  })

  it('counts a pattern as one of the 40 paths', () => {
    const fields = Array.from({ length: ACF_MAX_PATHS }, () => 'modules.*.section_id')
    expect(readAcfGetPaths({ fields })).toHaveLength(ACF_MAX_PATHS)
    expect(() => readAcfGetPaths({ fields: [...fields, 'modules.*.title'] })).toThrow(/at most 40/)
  })

  it('refuses a write through a pattern', () => {
    expect(() => readAcfWrites({ fields: [{ path: 'modules.*.section_id', value: 'x' }] })).toThrow(
      /wildcards are read-only/
    )
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

  it.each([
    ['post', '0'],
    ['post', 0],
    ['term', '0'],
    ['term', 0],
    ['user', '0'],
    ['user', 0]
  ])('rejects %s id %j', (kind, id) => {
    expect(() => parseAcfTarget({ kind, id })).toThrow(/positive integer/)
  })
})

describe('readAcfWrites', () => {
  it('returns nothing when fields is omitted, so rows can carry the call', () => {
    expect(readAcfWrites({})).toEqual([])
  })

  it('still refuses a fields value that is not an array', () => {
    expect(() => readAcfWrites({ fields: 'hero_title' })).toThrow(/must be an array/)
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

describe('explainAcfRunnerFailure', () => {
  const NOT_WORDPRESS =
    'Error: This does not seem to be a WordPress installation.\nPass --path=`path/to/wordpress` or run `wp core download`.'
  const failed = { exitCode: 1, stdout: '', stderr: '', wpRoot: '/Sites/acme' }

  it('tells the agent a theme-only checkout cannot boot WordPress locally', () => {
    const error = explainAcfRunnerFailure({
      ...failed,
      location: 'local',
      stderr: NOT_WORDPRESS
    })
    expect(error).toBeInstanceOf(SiteMcpToolError)
    expect(error.message).toContain('/Sites/acme')
    expect(error.message).toContain('bootable')
    expect(error.message).toContain('localWpRoot')
    expect(error.message).toContain("location='remote'")
  })

  it('names the resolved webroot on remote', () => {
    const error = explainAcfRunnerFailure({
      ...failed,
      location: 'remote',
      wpRoot: '/home/deploy/public_html/web',
      stderr: NOT_WORDPRESS
    })
    expect(error.message).toContain('/home/deploy/public_html/web')
    expect(error.message).toMatch(/did not find WordPress/)
  })

  // The DB error names wp-config.php too, so this also pins the match order.
  it('reports a database failure as a database failure', () => {
    const error = explainAcfRunnerFailure({
      ...failed,
      location: 'local',
      stderr:
        'Error: Error establishing a database connection. This either means that the username and password information in your wp-config.php file is incorrect.'
    })
    expect(error.message).toMatch(/database/i)
    expect(error.message).not.toMatch(/bootable/)
  })

  it('falls back to the exit code and keeps the stderr tail', () => {
    const error = explainAcfRunnerFailure({
      ...failed,
      exitCode: 255,
      location: 'local',
      stderr: 'PHP Fatal error: Allowed memory size exhausted',
      command: 'wp --no-color eval-file /tmp/muster-eval-1.php'
    })
    expect(error.message).toBe('WP-CLI exited 255 before the ACF runner produced JSON.')
    expect(error.details).toMatchObject({
      exit_code: 255,
      command: 'wp --no-color eval-file /tmp/muster-eval-1.php'
    })
    expect(String(error.details.stderr)).toContain('memory size exhausted')
  })
})

describe('parseAcfRunnerOutcome', () => {
  it('returns the envelope when a non-zero exit still printed JSON', () => {
    expect(
      parseAcfRunnerOutcome({
        exitCode: 1,
        stdout: '{"ok":false,"error":"unknown field hero_titel"}',
        stderr: 'Error: This does not seem to be a WordPress installation.',
        location: 'local',
        wpRoot: '/Sites/acme'
      })
    ).toEqual({ ok: false, error: 'unknown field hero_titel' })
  })

  it('names the cut when a truncated envelope fails to parse', () => {
    expect(() =>
      parseAcfRunnerOutcome({
        exitCode: 0,
        stdout: '{"ok":true,"results":[{"path":"modules.0","value":{"body":"abc',
        stderr: '',
        location: 'remote',
        wpRoot: '/var/www',
        outputTruncated: true,
        maxOutputChars: 1_000_000
      })
    ).toThrow(/cut at 1000000 characters/)
  })

  it('names the cut when truncation left no JSON object at all', () => {
    const error = explainAcfRunnerFailure({
      exitCode: 0,
      stdout: '{"ok":true,"results":[',
      stderr: '',
      location: 'local',
      wpRoot: '/Sites/acme',
      outputTruncated: true,
      maxOutputChars: 1_000_000
    })
    expect(error.message).toMatch(/Narrow the request/)
  })

  it('keeps the plain parse failure when nothing was cut', () => {
    expect(() =>
      parseAcfRunnerOutcome({
        exitCode: 0,
        stdout: '{"ok":true,,}',
        stderr: '',
        location: 'local',
        wpRoot: '/Sites/acme'
      })
    ).toThrow(/invalid JSON/)
  })

  it('throws the explained failure when stdout is empty', () => {
    expect(() =>
      parseAcfRunnerOutcome({
        exitCode: 1,
        stdout: '',
        stderr: 'Error: This does not seem to be a WordPress installation.',
        location: 'local',
        wpRoot: '/Sites/acme'
      })
    ).toThrow(/bootable WordPress install/)
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

  it('serialises describe with layout_filter and omits it otherwise', () => {
    expect(
      JSON.parse(
        buildAcfPayload({
          mode: 'describe',
          target: { kind: 'post', id: 672 },
          fields: ['modules'],
          layoutFilter: 'media'
        })
      )
    ).toEqual({
      mode: 'describe',
      target: { kind: 'post', id: 672 },
      fields: [{ path: 'modules' }],
      layout_filter: 'media'
    })
    expect(
      JSON.parse(buildAcfPayload({ mode: 'describe', target: { kind: 'option' }, fields: [] }))
    ).toEqual({ mode: 'describe', target: { kind: 'option' }, fields: [] })
  })

  it('carries row operations and leaves the key out when there are none', () => {
    const rows = [{ op: 'delete' as const, path: 'modules', index: 7 }]
    expect(
      JSON.parse(buildAcfPayload({ mode: 'apply', target: { kind: 'option' }, fields: [], rows }))
    ).toEqual({ mode: 'apply', target: { kind: 'option' }, fields: [], rows })
    expect(
      JSON.parse(
        buildAcfPayload({ mode: 'apply', target: { kind: 'option' }, fields: [], rows: [] })
      )
    ).toEqual({ mode: 'apply', target: { kind: 'option' }, fields: [] })
  })

  it('counts row operations against the 256 KB payload cap', () => {
    const rows = Array.from({ length: 40 }, () => ({
      op: 'append' as const,
      path: 'modules',
      layout: 'media',
      values: { body: 'x'.repeat(8_000) }
    }))
    expect(() =>
      buildAcfPayload({ mode: 'apply', target: { kind: 'option' }, fields: [], rows })
    ).toThrow(/byte cap/)
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
