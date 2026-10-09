import { basename } from '@/lib/path'
import type { GitStatusEntry } from '../../../../shared/types'
import type { DiscardAllArea } from './discard-all-sequence'
import { translate } from '@/i18n/i18n'

export type DiscardConfirmationCopy = {
  title: string
  description: string
  confirmLabel: string
}

export function getDiscardEntryConfirmationCopy(
  entry: Pick<GitStatusEntry, 'area' | 'path' | 'status'>
): DiscardConfirmationCopy {
  const name = basename(entry.path)

  // Why: untracked and newly-added paths have no HEAD version to restore.
  // Orca's discard path removes the working-tree file in those cases.
  if (entry.area === 'untracked' || entry.status === 'untracked' || entry.status === 'added') {
    return {
      title: translate(
        'auto.components.right.sidebar.source.control.discard.confirmation.96c772bee9',
        'Delete "{{value0}}"?',
        { value0: name }
      ),
      description: translate(
        'auto.components.right.sidebar.source.control.discard.confirmation.d97bf697c9',
        'This will permanently delete this file. This cannot be undone.'
      ),
      confirmLabel: 'Delete'
    }
  }

  if (entry.status === 'deleted') {
    return {
      title: translate(
        'auto.components.right.sidebar.source.control.discard.confirmation.5c0bdbc4cb',
        'Restore "{{value0}}"?',
        { value0: name }
      ),
      description: translate(
        'auto.components.right.sidebar.source.control.discard.confirmation.40e9357b2a',
        'This will restore the file from HEAD and discard the deletion. This cannot be undone.'
      ),
      confirmLabel: 'Restore'
    }
  }

  return {
    title: translate(
      'auto.components.right.sidebar.source.control.discard.confirmation.d4df3a61df',
      'Discard changes to "{{value0}}"?',
      { value0: name }
    ),
    description: translate(
      'auto.components.right.sidebar.source.control.discard.confirmation.1426c2efff',
      'This will revert all changes to this file. This cannot be undone.'
    ),
    confirmLabel: 'Discard'
  }
}

// Why: a folder or multi-selection discard covers part of a section, so "all" titles would overstate it.
function getDiscardSubsetConfirmationCopy(
  area: Exclude<DiscardAllArea, 'untracked'>,
  count: number
): DiscardConfirmationCopy {
  return {
    title:
      count === 1
        ? translate(
            'auto.components.right.sidebar.source.control.discard.confirmation.subsetTitleOne',
            'Discard changes in 1 file?'
          )
        : translate(
            'auto.components.right.sidebar.source.control.discard.confirmation.subsetTitle',
            'Discard changes in {{count}} files?',
            { count }
          ),
    description:
      area === 'staged'
        ? translate(
            'auto.components.right.sidebar.source.control.discard.confirmation.subsetStagedDescription',
            'This will unstage and revert these files. Staged new files will be deleted. This cannot be undone.'
          )
        : translate(
            'auto.components.right.sidebar.source.control.discard.confirmation.subsetDescription',
            'This will revert the changes in these files. This cannot be undone.'
          ),
    confirmLabel: 'Discard'
  }
}

export function getDiscardAreaConfirmationCopy(
  area: DiscardAllArea,
  count: number,
  subset = false
): DiscardConfirmationCopy {
  if (subset && area !== 'untracked') {
    return getDiscardSubsetConfirmationCopy(area, count)
  }
  switch (area) {
    case 'untracked':
      return {
        title: count === 1 ? 'Delete 1 untracked file?' : `Delete ${count} untracked files?`,
        description:
          count === 1
            ? 'This will permanently delete this untracked file. This cannot be undone.'
            : `This will permanently delete these ${count} untracked files. This cannot be undone.`,
        confirmLabel: count === 1 ? 'Delete' : `Delete ${count}`
      }
    case 'staged':
      return {
        title: translate(
          'auto.components.right.sidebar.source.control.discard.confirmation.5ddd8cac7f',
          'Discard all staged changes?'
        ),
        description: translate(
          'auto.components.right.sidebar.source.control.discard.confirmation.ddf36f291c',
          'This will unstage and revert all staged changes. Staged new files will be deleted. This cannot be undone.'
        ),
        confirmLabel: 'Discard all'
      }
    case 'unstaged':
      return {
        title: translate(
          'auto.components.right.sidebar.source.control.discard.confirmation.2ae5a785b3',
          'Discard all unstaged changes?'
        ),
        description:
          count === 1
            ? 'This will revert the unstaged changes in 1 file. This cannot be undone.'
            : `This will revert unstaged changes in ${count} files. This cannot be undone.`,
        confirmLabel: 'Discard all'
      }
  }
}
