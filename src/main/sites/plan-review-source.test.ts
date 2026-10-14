import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  MAX_PLAN_BYTES,
  describePlanProject,
  loadPlanText,
  PlanSourceError
} from './plan-review-source'

describe('loadPlanText', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'plan-source-'))
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('reads a file and takes its name as the title', () => {
    const path = join(dir, 'ship.md')
    writeFileSync(path, '# Ship')
    expect(loadPlanText({ path, content: '', cwd: dir })).toEqual({
      planPath: path,
      title: 'ship.md',
      content: '# Ship'
    })
  })

  it('resolves a relative path against the caller, not the process', () => {
    writeFileSync(join(dir, 'rel.md'), 'x')
    expect(loadPlanText({ path: 'rel.md', content: '', cwd: dir }).planPath).toBe(
      join(dir, 'rel.md')
    )
  })

  it('takes inline content as-is, with no path to diff against', () => {
    expect(loadPlanText({ path: '', content: '# Inline', cwd: dir })).toEqual({
      planPath: null,
      title: 'Plan',
      content: '# Inline'
    })
  })

  it('refuses both sources and neither, with one code', () => {
    for (const request of [
      { path: join(dir, 'a.md'), content: '# b', cwd: dir },
      { path: '', content: '', cwd: dir }
    ]) {
      try {
        loadPlanText(request)
        expect.unreachable('expected a refusal')
      } catch (error) {
        expect(error).toBeInstanceOf(PlanSourceError)
        expect((error as PlanSourceError).code).toBe('bad-request')
      }
    }
  })

  it('reports an unreadable file with the absolute path it tried', () => {
    try {
      loadPlanText({ path: 'missing.md', content: '', cwd: dir })
      expect.unreachable('expected a refusal')
    } catch (error) {
      expect((error as PlanSourceError).code).toBe('unreadable-plan')
      expect((error as Error).message).toContain(join(dir, 'missing.md'))
    }
  })

  it('refuses a plan too large to put in front of a person', () => {
    const path = join(dir, 'huge.md')
    writeFileSync(path, 'x'.repeat(MAX_PLAN_BYTES + 1))
    try {
      loadPlanText({ path, content: '', cwd: dir })
      expect.unreachable('expected a refusal')
    } catch (error) {
      expect((error as PlanSourceError).code).toBe('plan-too-large')
    }
  })
})

describe('describePlanProject', () => {
  it('names the deepest site containing the working directory', () => {
    expect(
      describePlanProject('/sites/acme/wt-1', [
        { path: '/sites', displayName: 'Shallow' },
        { path: '/sites/acme', displayName: 'Acme' }
      ])
    ).toBe('Acme')
  })

  it('does not claim a sibling that merely shares a name prefix', () => {
    expect(
      describePlanProject('/sites/acme-other', [{ path: '/sites/acme', displayName: 'Acme' }])
    ).toBe('acme-other')
  })

  it('falls back to the directory name for a checkout Muster does not manage', () => {
    expect(describePlanProject('/tmp/loose', [])).toBe('loose')
  })
})
