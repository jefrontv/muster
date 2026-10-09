import type {
  GitBranchChangeEntry,
  GitBranchChangeStatus,
  GitFileStatus,
  GitStatusEntry
} from '../../../../shared/types'
import { basename } from '@/lib/path'
import { translate } from '@/i18n/i18n'
import type { SourceControlTreeNode } from './source-control-tree'
import {
  getSubmoduleExpansionKey,
  isExpandableSubmoduleEntry,
  type RenderableSourceControlNode,
  type RenderableSubmoduleListItem
} from './source-control-submodule-expansion'
import type { SourceControlTreeNavRow } from './source-control-tree-navigation'

export type SourceControlTreeRow = SourceControlTreeNavRow & { label: string } & (
    | { kind: 'section'; sectionId: string }
    | { kind: 'directory' }
    | { kind: 'file'; entry: GitStatusEntry }
    | { kind: 'branch-file'; entry: GitBranchChangeEntry }
    | { kind: 'placeholder' }
  )

export const SOURCE_CONTROL_BRANCH_SECTION_ID = 'branch'

export function getSourceControlTreeSectionRowId(sectionId: string): string {
  return `section::${sectionId}`
}

export function getSourceControlStatusEntryRowId(entry: Pick<GitStatusEntry, 'area' | 'path'>) {
  return `${entry.area}::${entry.path}`
}

export function getSourceControlBranchEntryRowId(entry: Pick<GitBranchChangeEntry, 'path'>) {
  return `branch:${entry.path}`
}

function getStatusWord(status: GitFileStatus | GitBranchChangeStatus): string {
  switch (status) {
    case 'modified':
      return translate('auto.components.right.sidebar.SourceControlTree.statusModified', 'modified')
    case 'added':
      return translate('auto.components.right.sidebar.SourceControlTree.statusAdded', 'added')
    case 'deleted':
      return translate('auto.components.right.sidebar.SourceControlTree.statusDeleted', 'deleted')
    case 'renamed':
      return translate('auto.components.right.sidebar.SourceControlTree.statusRenamed', 'renamed')
    case 'untracked':
      return translate(
        'auto.components.right.sidebar.SourceControlTree.statusUntracked',
        'untracked'
      )
    case 'copied':
      return translate('auto.components.right.sidebar.SourceControlTree.statusCopied', 'copied')
  }
}

function getSectionWord(sectionId: string): string {
  switch (sectionId) {
    case 'staged':
      return translate('auto.components.right.sidebar.SourceControlTree.sectionStaged', 'staged')
    case 'unstaged':
      return translate(
        'auto.components.right.sidebar.SourceControlTree.sectionUnstaged',
        'unstaged'
      )
    case 'untracked':
      return translate(
        'auto.components.right.sidebar.SourceControlTree.sectionUntracked',
        'untracked'
      )
    case 'conflicts':
      return translate(
        'auto.components.right.sidebar.SourceControlTree.sectionConflicts',
        'conflict'
      )
    default:
      return translate(
        'auto.components.right.sidebar.SourceControlTree.sectionBranch',
        'committed on branch'
      )
  }
}

export function getSourceControlTreeFileLabel(
  path: string,
  status: GitFileStatus | GitBranchChangeStatus,
  sectionId: string
): string {
  return translate(
    'auto.components.right.sidebar.SourceControlTree.fileLabel',
    '{{name}}, {{status}}, {{section}}',
    { name: basename(path), status: getStatusWord(status), section: getSectionWord(sectionId) }
  )
}

function getSectionLabel(label: string, count: number): string {
  return count === 1
    ? translate(
        'auto.components.right.sidebar.SourceControlTree.sectionOneFile',
        '{{label}}, 1 file',
        {
          label
        }
      )
    : translate(
        'auto.components.right.sidebar.SourceControlTree.sectionFiles',
        '{{label}}, {{count}} files',
        { label, count }
      )
}

export type SourceControlTreeSectionInput = {
  id: string
  label: string
  count: number
  collapsed: boolean
}

type BuildArgs = {
  viewMode: 'list' | 'tree'
  sections: readonly (SourceControlTreeSectionInput & {
    treeRows: readonly RenderableSourceControlNode[]
    listRows: readonly RenderableSubmoduleListItem[]
  })[]
  branch:
    | (SourceControlTreeSectionInput & {
        treeRows: readonly SourceControlTreeNode<GitBranchChangeEntry, string>[]
        entries: readonly GitBranchChangeEntry[]
      })
    | null
  collapsedTreeDirs: ReadonlySet<string>
  expandedSubmoduleKeys: ReadonlySet<string>
}

function getSubmoduleExpanded(
  entry: GitStatusEntry,
  expandedSubmoduleKeys: ReadonlySet<string>
): boolean | undefined {
  return isExpandableSubmoduleEntry(entry)
    ? expandedSubmoduleKeys.has(getSubmoduleExpansionKey(entry))
    : undefined
}

function pushSectionRow(rows: SourceControlTreeRow[], section: SourceControlTreeSectionInput) {
  rows.push({
    kind: 'section',
    sectionId: section.id,
    id: getSourceControlTreeSectionRowId(section.id),
    level: 1,
    expanded: !section.collapsed,
    label: getSectionLabel(section.label, section.count)
  })
}

/**
 * Flattens what the panel renders into the visible-row model keyboard
 * navigation walks. Row ids equal the render keys each virtual list uses, so a
 * list can locate and scroll to a row by id.
 */
export function buildSourceControlTreeRows(args: BuildArgs): SourceControlTreeRow[] {
  const { viewMode, collapsedTreeDirs, expandedSubmoduleKeys } = args
  const rows: SourceControlTreeRow[] = []
  for (const section of args.sections) {
    pushSectionRow(rows, section)
    if (section.collapsed) {
      continue
    }
    if (viewMode === 'tree') {
      for (const node of section.treeRows) {
        const level = node.depth + 2
        if (node.type === 'submodule-placeholder') {
          rows.push({ kind: 'placeholder', id: node.key, level, label: node.message ?? '' })
        } else if (node.type === 'directory') {
          rows.push({
            kind: 'directory',
            id: node.key,
            level,
            expanded: !collapsedTreeDirs.has(node.key),
            label: node.name
          })
        } else {
          rows.push({
            kind: 'file',
            entry: node.entry,
            id: node.key,
            level,
            expanded: getSubmoduleExpanded(node.entry, expandedSubmoduleKeys),
            label: getSourceControlTreeFileLabel(node.entry.path, node.entry.status, section.id)
          })
        }
      }
      continue
    }
    for (const item of section.listRows) {
      if (item.type === 'submodule-placeholder') {
        rows.push({
          kind: 'placeholder',
          id: item.key,
          level: item.depth + 2,
          label: item.message ?? ''
        })
        continue
      }
      rows.push({
        kind: 'file',
        entry: item.entry,
        id: getSourceControlStatusEntryRowId(item.entry),
        level: item.entry.submoduleRoot ? 3 : 2,
        expanded: getSubmoduleExpanded(item.entry, expandedSubmoduleKeys),
        label: getSourceControlTreeFileLabel(item.entry.path, item.entry.status, section.id)
      })
    }
  }

  const { branch } = args
  if (!branch) {
    return rows
  }
  pushSectionRow(rows, branch)
  if (branch.collapsed) {
    return rows
  }
  const branchLabel = (entry: GitBranchChangeEntry): string =>
    getSourceControlTreeFileLabel(entry.path, entry.status, SOURCE_CONTROL_BRANCH_SECTION_ID)
  if (viewMode === 'tree') {
    for (const node of branch.treeRows) {
      rows.push(
        node.type === 'directory'
          ? {
              kind: 'directory',
              id: node.key,
              level: node.depth + 2,
              expanded: !collapsedTreeDirs.has(node.key),
              label: node.name
            }
          : {
              kind: 'branch-file',
              entry: node.entry,
              id: node.key,
              level: node.depth + 2,
              label: branchLabel(node.entry)
            }
      )
    }
    return rows
  }
  for (const entry of branch.entries) {
    rows.push({
      kind: 'branch-file',
      entry,
      id: getSourceControlBranchEntryRowId(entry),
      level: 2,
      label: branchLabel(entry)
    })
  }
  return rows
}
