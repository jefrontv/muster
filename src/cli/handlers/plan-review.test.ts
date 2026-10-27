import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { HandlerContext } from '../dispatch'
import type { RuntimeClient } from '../runtime-client'
import { PLAN_REVIEW_HANDLERS, type PlanReviewAwaitResult } from './plan-review'

function ok<T>(result: T) {
  return { id: 'req', ok: true as const, result, _meta: { runtimeId: 'rt' } }
}

const settled = (decision: string): PlanReviewAwaitResult =>
  ({
    status: 'settled',
    decision,
    feedback: '- **General:** tighten step 2',
    annotations: []
  }) as PlanReviewAwaitResult

describe('muster annotate', () => {
  let tempDir: string
  let planPath: string
  let logSpy: ReturnType<typeof vi.spyOn>
  const callMock = vi.fn()
  const openOrca = vi.fn()
  const client = {
    call: callMock,
    openOrca,
    getCliStatus: vi.fn().mockResolvedValue(ok({ app: { desktopWindowStatus: 'available' } }))
  } as unknown as RuntimeClient

  function run(flags: Record<string, string | boolean>, json = false): Promise<void> {
    const ctx: HandlerContext = {
      flags: new Map(Object.entries(flags)),
      client,
      cwd: tempDir,
      json
    }
    return PLAN_REVIEW_HANDLERS.annotate(ctx)
  }

  function queueAwait(...results: PlanReviewAwaitResult[]): void {
    callMock.mockImplementation(async (method: string) => {
      if (method === 'planReview.open') {
        return ok({ reviewId: 'rev-1', round: 1, queuedAhead: 0 })
      }
      return ok(results.length > 1 ? results.shift() : results[0])
    })
  }

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'muster-annotate-'))
    planPath = join(tempDir, 'plan.md')
    writeFileSync(planPath, '# Plan\n')
    callMock.mockReset()
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    process.exitCode = 0
  })

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true })
    logSpy.mockRestore()
    process.exitCode = 0
  })

  it('sends the file content and exits 0 on approval', async () => {
    queueAwait(settled('approved'))

    await run({ path: 'plan.md' })

    expect(callMock).toHaveBeenCalledWith('planReview.open', {
      planPath,
      title: 'plan.md',
      content: '# Plan\n',
      cwd: tempDir
    })
    expect(process.exitCode).toBe(0)
    expect(logSpy.mock.calls.flat().join('\n')).toContain('decision: approved')
  })

  it('exits 3 when the reviewer annotates', async () => {
    queueAwait(settled('annotated'))
    await run({ path: planPath })
    expect(process.exitCode).toBe(3)
  })

  it('keeps waiting through pending chunks until a decision', async () => {
    queueAwait({ status: 'pending', openedMs: 60_000 }, settled('approved_with_notes'))
    await run({ path: planPath })
    expect(callMock.mock.calls.filter(([method]) => method === 'planReview.await')).toHaveLength(2)
    expect(process.exitCode).toBe(0)
  })

  it('exits 2 with the resume command when the timeout passes', async () => {
    queueAwait({ status: 'pending', openedMs: 1_000 })
    await run({ path: planPath, timeout: '1' })
    expect(process.exitCode).toBe(2)
    expect(logSpy.mock.calls.flat().join('\n')).toContain('muster annotate --resume rev-1')
  })

  it('resumes an existing review and exits 4 when it is unknown', async () => {
    queueAwait({ status: 'unknown' })
    await run({ resume: 'rev-gone' }, true)
    expect(callMock).not.toHaveBeenCalledWith('planReview.open', expect.anything())
    expect(callMock).toHaveBeenCalledWith(
      'planReview.await',
      expect.objectContaining({ reviewId: 'rev-gone' }),
      expect.anything()
    )
    expect(JSON.parse(String(logSpy.mock.calls[0]?.[0])).result).toEqual({
      review_id: 'rev-gone',
      status: 'unknown'
    })
    expect(process.exitCode).toBe(4)
  })

  it('returns the review id without waiting when detached', async () => {
    queueAwait(settled('approved'))
    await run({ path: planPath, detach: true })
    expect(callMock).not.toHaveBeenCalledWith(
      'planReview.await',
      expect.anything(),
      expect.anything()
    )
    expect(logSpy.mock.calls.flat().join('\n')).toContain('review_id: rev-1')
  })

  it('refuses folders, missing files, non-markdown files and ambiguous arguments', async () => {
    mkdirSync(join(tempDir, 'docs'))
    writeFileSync(join(tempDir, 'notes.txt'), 'x')
    await expect(run({ path: 'docs' })).rejects.toThrow('Pass the plan file, not its folder.')
    await expect(run({ path: 'missing.md' })).rejects.toThrow('No such file')
    await expect(run({ path: 'notes.txt' })).rejects.toThrow('Not a markdown file')
    await expect(run({})).rejects.toThrow('Pass a plan path, or --resume')
    await expect(run({ path: planPath, resume: 'rev-1' })).rejects.toThrow('not both')
    expect(callMock).not.toHaveBeenCalled()
  })
})
