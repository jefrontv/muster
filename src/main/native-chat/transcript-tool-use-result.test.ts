import { describe, expect, it } from 'vitest'
import { toolUseResultDetail } from './transcript-tool-use-result'

describe('toolUseResultDetail', () => {
  it('keeps structured patch hunks and counts, never the original file', () => {
    const detail = toolUseResultDetail({
      filePath: '/a.ts',
      originalFile: 'whole file body',
      structuredPatch: [
        { oldStart: 2, oldLines: 2, newStart: 2, newLines: 3, lines: [' a', '-b', '+c', '+d'] }
      ]
    })
    expect(detail).toEqual({
      patch: [
        { oldStart: 2, oldLines: 2, newStart: 2, newLines: 3, lines: [' a', '-b', '+c', '+d'] }
      ],
      additions: 2,
      deletions: 1
    })
    expect(JSON.stringify(detail)).not.toContain('whole file body')
  })

  it('caps long patches but keeps the true counts', () => {
    const lines = Array.from({ length: 700 }, (_, i) => `+line ${i}`)
    const detail = toolUseResultDetail({
      structuredPatch: [{ oldStart: 0, oldLines: 0, newStart: 1, newLines: 700, lines }]
    })
    expect(detail?.patch?.[0]?.lines).toHaveLength(600)
    expect(detail).toMatchObject({ additions: 700, truncated: true })
  })

  it('turns a created file into an all-additions hunk', () => {
    expect(toolUseResultDetail({ type: 'create', content: 'a\nb\n' })).toMatchObject({
      created: true,
      additions: 2,
      deletions: 0,
      patch: [{ newStart: 1, lines: ['+a', '+b'] }]
    })
  })

  it('keeps Bash stdout, stderr and interrupted, capping long output head and tail', () => {
    expect(toolUseResultDetail({ stdout: 'ok', stderr: '', interrupted: true })).toEqual({
      stdout: 'ok',
      interrupted: true
    })
    const long = toolUseResultDetail({ stdout: `${'x'.repeat(9_000)}END` })
    expect(long?.truncated).toBe(true)
    expect(long?.stdout?.endsWith('END')).toBe(true)
  })

  it('collects web search sources and the fetched URL', () => {
    expect(
      toolUseResultDetail({
        query: 'q',
        results: [{ content: [{ title: 'A', url: 'https://a.test' }] }, 'summary']
      })
    ).toEqual({ sources: [{ url: 'https://a.test', title: 'A' }] })
    expect(toolUseResultDetail({ url: 'https://b.test', code: 200, result: 'body' })).toEqual({
      sources: [{ url: 'https://b.test', title: null }]
    })
  })

  it('ignores a Read result and anything unstructured', () => {
    expect(toolUseResultDetail({ type: 'text', file: { content: 'body' } })).toBeUndefined()
    expect(toolUseResultDetail('Error: nope')).toBeUndefined()
  })
})
