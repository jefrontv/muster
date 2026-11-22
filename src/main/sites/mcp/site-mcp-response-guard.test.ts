import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { formatSiteMcpToolResult, SITE_MCP_SPILL_TTL_MS } from './site-mcp-response-guard'

let spillDir: string

beforeEach(() => {
  spillDir = mkdtempSync(join(tmpdir(), 'muster-spill-test-'))
})

afterEach(() => {
  rmSync(spillDir, { recursive: true, force: true })
})

describe('formatSiteMcpToolResult', () => {
  it('serializes compact JSON without pretty-print indentation', () => {
    const result = formatSiteMcpToolResult(
      'list_sites',
      { ok: true, count: 1, sites: [{ name: 'Acme' }] },
      false,
      { spillDir }
    )
    const text = result.content[0]!.text
    expect(text).toBe('{"ok":true,"count":1,"sites":[{"name":"Acme"}]}')
    expect(text).not.toContain('\n')
    expect(result.isError).toBeUndefined()
  })

  it('passes payloads at or under maxInlineBytes through verbatim', () => {
    const payload = { ok: true, data: 'x'.repeat(200) }
    const text = JSON.stringify(payload)
    const result = formatSiteMcpToolResult('run_wp_cli', payload, false, {
      maxInlineBytes: Buffer.byteLength(text, 'utf8'),
      spillDir
    })
    expect(result.content[0]!.text).toBe(text)
  })

  it('spills oversized payloads to disk, preserves metadata, and stays within maxInlineBytes', () => {
    const huge = {
      ok: true,
      site: 'Acme',
      site_id: 'site-1',
      environment: 'main',
      exit_code: 0,
      revert_token: 'rev-123',
      warnings: ['w1', 'w2'],
      secret_blob_should_spill: 'y'.repeat(10_000)
    }
    const maxInlineBytes = 1_200
    const result = formatSiteMcpToolResult('get_wp_fields', huge, true, {
      maxInlineBytes,
      spillDir
    })
    expect(result.isError).toBe(true)
    const rawSummary = result.content[0]!.text
    expect(Buffer.byteLength(rawSummary, 'utf8')).toBeLessThanOrEqual(maxInlineBytes)

    const summary = JSON.parse(rawSummary) as Record<string, unknown>
    expect(summary).toMatchObject({
      ok: true,
      site: 'Acme',
      site_id: 'site-1',
      environment: 'main',
      exit_code: 0,
      revert_token: 'rev-123',
      warnings: ['w1', 'w2'],
      truncated: true,
      inline_limit_bytes: maxInlineBytes
    })
    expect(typeof summary.output_file).toBe('string')
    const filePath = summary.output_file as string
    expect(existsSync(filePath)).toBe(true)
    expect(JSON.parse(readFileSync(filePath, 'utf8'))).toEqual(huge)
    if (process.platform !== 'win32') {
      expect(statSync(filePath).mode & 0o777).toBe(0o600)
    }
  })

  it('prunes spill files older than 24h while keeping recent ones', () => {
    const stalePath = join(spillDir, 'old-result.json')
    const freshPath = join(spillDir, 'fresh-result.json')
    writeFileSync(stalePath, '{}')
    writeFileSync(freshPath, '{}')

    const nowMs = Date.now()
    const staleDate = new Date(nowMs - SITE_MCP_SPILL_TTL_MS - 60_000)
    const freshDate = new Date(nowMs - 60_000)
    utimesSync(stalePath, staleDate, staleDate)
    utimesSync(freshPath, freshDate, freshDate)

    formatSiteMcpToolResult('run_wp_cli', { ok: true, big: 'z'.repeat(2_000) }, false, {
      maxInlineBytes: 800,
      spillDir,
      nowMs
    })

    expect(existsSync(stalePath)).toBe(false)
    expect(existsSync(freshPath)).toBe(true)
  })
})
