import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { getDefaultSettings } from '../../shared/constants'
import type { GlobalSettings } from '../../shared/types'
import { createProjectPagesStore } from '../project-pages/project-pages-store'
import { bindPlanReviewPage, planReviewsSaveToPages } from './plan-review-pages'

const dirs: string[] = []
const SCOPE = 'repo:r1'

function setup(
  settings: Partial<GlobalSettings> = { experimentalProjectPages: true, planReviewsToPages: true }
) {
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
    // Saving every review to Pages is opt-in.
    expect(planReviewsSaveToPages(getDefaultSettings('/tmp'))).toBe(false)
    expect(bindPlanReviewPage(setup(getDefaultSettings('/tmp')).deps, input('v1'), null)).toBeNull()
    expect(
      bindPlanReviewPage(setup({ experimentalProjectPages: true }).deps, input('v1'), null)
    ).toBeNull()
    expect(planReviewsSaveToPages({ experimentalProjectPages: true })).toBe(false)
    expect(bindPlanReviewPage(setup().deps, input('v1', { cwd: '/elsewhere' }), null)).toBeNull()
    expect(
      planReviewsSaveToPages({ experimentalProjectPages: true, planReviewInProjectTab: false })
    ).toBe(false)
  })

  it('saves on "Add to Pages" even with the setting off', () => {
    const { deps } = setup({ experimentalProjectPages: true })
    expect(bindPlanReviewPage(deps, input('v1'), null, { force: true })?.scopeKey).toBe(SCOPE)
    expect(bindPlanReviewPage(setup({}).deps, input('v1'), null, { force: true })).toBeNull()
  })

  it('keeps updating a page added on request in later rounds with the setting off', () => {
    const { store, deps } = setup({ experimentalProjectPages: true })
    const first = bindPlanReviewPage(deps, input('v1'), null, { force: true })
    expect(bindPlanReviewPage(deps, input('v2'), first)).toEqual(first)
    expect(store.readPage(SCOPE, first!.pageId).markdown).toBe('v2')
  })

  it('files the page in a named folder path, creating what is missing', () => {
    const { store, deps } = setup()
    const ref = bindPlanReviewPage(deps, input('v1', { pagesFolder: 'Specs / Q4' }), null)
    const pages = store.listPages(SCOPE).pages
    const specs = pages.find((p) => p.folder && p.title === 'Specs')
    const q4 = pages.find((p) => p.folder && p.title === 'Q4')
    expect(specs?.parentId).toBeNull()
    expect(q4?.parentId).toBe(specs?.id)
    expect(store.readPage(SCOPE, ref!.pageId).meta.parentId).toBe(q4?.id)
    expect(pages.some((p) => p.title === 'Plans')).toBe(false)

    const byId = bindPlanReviewPage(
      deps,
      input('v1', { title: 'Other', pagesFolder: specs!.id }),
      null
    )
    expect(store.readPage(SCOPE, byId!.pageId).meta.parentId).toBe(specs?.id)
  })

  it('keeps the title out of the page body and names the page from the H1', () => {
    const { store, deps } = setup()
    const plan = '# Tab strip polish\n\n## Goal\n\nKeep tabs still.\n'
    const named = bindPlanReviewPage(deps, input(plan, { title: 'tab-strip.md' }), null)
    expect(store.readPage(SCOPE, named!.pageId)).toMatchObject({
      meta: { title: 'Tab strip polish' },
      markdown: '## Goal\n\nKeep tabs still.\n'
    })
    const again = bindPlanReviewPage(
      deps,
      input(plan.replace('still', 'put'), { title: 'tab-strip.md' }),
      named
    )
    expect(store.readPage(SCOPE, again!.pageId).markdown).toBe('## Goal\n\nKeep tabs put.\n')

    const titled = bindPlanReviewPage(
      deps,
      input('# Draft\n\nBody\n', { title: 'Ship plan' }),
      null
    )
    expect(store.readPage(SCOPE, titled!.pageId).markdown).toBe('# Draft\n\nBody\n')
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
