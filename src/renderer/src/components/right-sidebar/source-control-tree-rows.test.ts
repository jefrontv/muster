import { describe, expect, it } from 'vitest'
import type { GitBranchChangeEntry, GitStatusEntry } from '../../../../shared/types'
import {
  buildGitStatusSourceControlTree,
  buildSourceControlTree,
  flattenSourceControlTree
} from './source-control-tree'
import { injectExpandedSubmoduleEntries } from './source-control-submodule-expansion'
import { buildSourceControlTreeRows } from './source-control-tree-rows'

function entry(overrides: Partial<GitStatusEntry>): GitStatusEntry {
  return { path: 'b.txt', status: 'modified', area: 'unstaged', ...overrides }
}

const staged = [entry({ path: 'src/b.txt', status: 'added', area: 'staged' })]
const unstaged = [entry({ path: 'a.ts' })]

function section(id: 'staged' | 'unstaged', items: GitStatusEntry[], collapsed = false) {
  const area = id
  return {
    id,
    label: id === 'staged' ? 'Staged Changes' : 'Changes',
    count: items.length,
    collapsed,
    treeRows: flattenSourceControlTree(buildGitStatusSourceControlTree(area, items), new Set()),
    listRows: injectExpandedSubmoduleEntries(items, new Set(), {}, 'Loading', 'Empty')
  }
}

describe('buildSourceControlTreeRows', () => {
  it('flattens list mode into section headers and files with labels', () => {
    const rows = buildSourceControlTreeRows({
      viewMode: 'list',
      sections: [section('staged', staged), section('unstaged', unstaged)],
      branch: null,
      collapsedTreeDirs: new Set(),
      expandedSubmoduleKeys: new Set()
    })
    expect(rows.map((row) => [row.kind, row.id, row.level, row.expanded])).toEqual([
      ['section', 'section::staged', 1, true],
      ['file', 'staged::src/b.txt', 2, undefined],
      ['section', 'section::unstaged', 1, true],
      ['file', 'unstaged::a.ts', 2, undefined]
    ])
    expect(rows[1].label).toBe('b.txt, added, staged')
    expect(rows[0].label).toBe('Staged Changes, 1 file')
  })

  it('includes folders in tree mode and hides collapsed content', () => {
    const rows = buildSourceControlTreeRows({
      viewMode: 'tree',
      sections: [section('staged', staged), section('unstaged', unstaged, true)],
      branch: null,
      collapsedTreeDirs: new Set(),
      expandedSubmoduleKeys: new Set()
    })
    expect(rows.map((row) => [row.kind, row.id, row.level, row.expanded])).toEqual([
      ['section', 'section::staged', 1, true],
      ['directory', 'dir::staged::src', 2, true],
      ['file', 'staged::src/b.txt', 3, undefined],
      ['section', 'section::unstaged', 1, false]
    ])
  })

  it('appends committed branch rows with list-mode keys', () => {
    const branchEntries: GitBranchChangeEntry[] = [{ path: 'lib/c.ts', status: 'deleted' }]
    const rows = buildSourceControlTreeRows({
      viewMode: 'list',
      sections: [],
      branch: {
        id: 'branch',
        label: 'Committed on Branch',
        count: 1,
        collapsed: false,
        treeRows: flattenSourceControlTree(
          buildSourceControlTree('branch', branchEntries),
          new Set()
        ),
        entries: branchEntries
      },
      collapsedTreeDirs: new Set(),
      expandedSubmoduleKeys: new Set()
    })
    expect(rows.map((row) => row.id)).toEqual(['section::branch', 'branch:lib/c.ts'])
    expect(rows[1].label).toBe('c.ts, deleted, committed on branch')
  })
})
