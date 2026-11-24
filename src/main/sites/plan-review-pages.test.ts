import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { GlobalSettings } from '../../shared/types'
import { createProjectPagesStore } from '../project-pages/project-pages-store'
import { bindPlanReviewPage, planReviewsSaveToPages } from './plan-review-pages'

const dirs: string[] = []
const SCOPE = 'repo:r1'

function setup(settings: Partial<GlobalSettings> = { experimentalProjectPages: true }) {
  const rootDir = mkdtempSync(join(tmpdir(), 'plan-pages-'))
  dirs.push(rootDir)
  const store = createProjectPagesStore({ rootDir })
  const deps = {
    store,
    repos: () => [{ id: 'r1', displayName: 'Repo', path: '/work/repo' }],
    settings: () => settings as GlobalSettings
  }
  return { store, deps }
}

const input = (content: string, extra: Record<string, unknown> = {}) => ({
  planPath: '/work/repo/plan.md',
  title: 'Ship plan',
  content,
  agent: 'claude',
  project: null,
  cwd: '/work/repo/sub',
  ...extra
})

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true })
  }
})

describe('plan reviews saved to Pages', () => {
  it('creates a Plans folder and page, then updates it as the next round', () => {
    const { store, deps } = setup()
    const first = bindPlanReviewPage(deps, input('v1'), null)
    expect(first?.scopeKey).toBe(SCOPE)
    const pages = store.listPages(SCOPE).pages
    const folder = pages.find((p) => p.folder)
    expect(folder?.title).toBe('Plans')
    expect(store.readPage(SCOPE, first!.pageId)).toMatchObject({
      meta: {
        parentId: folder!.id,
        title: 'Ship plan',
        editedBy: { kind: 'agent', agent: 'claude' }
      },
      markdown: 'v1'
    })

    const second = bindPlanReviewPage(deps, input('v2'), first)
    expect(second).toEqual(first)
    const doc = store.readPage(SCOPE, first!.pageId)
    expect(doc.markdown).toBe('v2')
    expect(doc.meta.revision).toBe(2)
    expect(store.listPages(SCOPE).pages.filter((p) => p.folder)).toHaveLength(1)
  })

  it('finds the page by title when the round memory is gone', () => {
    const { deps } = setup()
    const first = bindPlanReviewPage(deps, input('v1'), null)
    expect(bindPlanReviewPage(deps, input('v2'), null)).toEqual(first)
  })

  it('stays off Pages when the settings say so or no project holds the cwd', () => {
    expect(bindPlanReviewPage(setup({}).deps, input('v1'), null)).toBeNull()
    expect(
      bindPlanReviewPage(
        setup({ experimentalProjectPages: true, planReviewsToPages: false }).deps,
        input('v1'),
        null
      )
    ).toBeNull()
    expect(bindPlanReviewPage(setup().deps, input('v1', { cwd: '/elsewhere' }), null)).toBeNull()
    expect(
      planReviewsSaveToPages({ experimentalProjectPages: true, planReviewInProjectTab: false })
    ).toBe(false)
  })

  it('uses the page an agent asked to review when it exists', () => {
    const { store, deps } = setup()
    const page = store.createPage(SCOPE, { title: 'Spec', markdown: 'x' }, { kind: 'user' })
    const ref = { scopeKey: SCOPE, pageId: page.meta.id }
    expect(bindPlanReviewPage(deps, input('x', { page: ref, planPath: null }), null)).toEqual(ref)
    const missing = { scopeKey: SCOPE, pageId: 'p_gone' }
    expect(bindPlanReviewPage(deps, input('x', { page: missing, planPath: null }), null)).toBeNull()
  })
})
