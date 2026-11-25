import { translate } from '@/i18n/i18n'
import type { GitFileStatus, TabAttention } from '../../../../shared/types'
import type { OpenFile } from '../../store/slices/editor'

function gitStatusName(status: GitFileStatus): string {
  switch (status) {
    case 'modified':
      return translate('auto.components.tab.bar.editorTabTooltip.modified', 'Modified')
    case 'added':
      return translate('auto.components.tab.bar.editorTabTooltip.added', 'Added')
    case 'deleted':
      return translate('auto.components.tab.bar.editorTabTooltip.deleted', 'Deleted')
    case 'renamed':
      return translate('auto.components.tab.bar.editorTabTooltip.renamed', 'Renamed')
    case 'untracked':
      return translate('auto.components.tab.bar.editorTabTooltip.untracked', 'Untracked')
    case 'copied':
      return translate('auto.components.tab.bar.editorTabTooltip.copied', 'Copied')
  }
}

/** State that used to sit inline beside the label; the tooltip carries it so tab width stays fixed. */
export function getEditorTabTooltipDetails({
  status,
  externalMutation,
  isDirty,
  attention
}: {
  status: GitFileStatus | null
  externalMutation: OpenFile['externalMutation']
  isDirty: boolean
  attention: TabAttention | undefined
}): string[] {
  const details: string[] = []
  if (externalMutation === 'deleted') {
    details.push(
      translate('auto.components.tab.bar.editorTabTooltip.deletedOnDisk', 'Deleted on disk')
    )
  } else if (externalMutation === 'renamed') {
    details.push(
      translate('auto.components.tab.bar.editorTabTooltip.renamedOnDisk', 'Renamed on disk')
    )
  } else if (status) {
    details.push(gitStatusName(status))
  }
  if (isDirty) {
    details.push(translate('auto.components.tab.bar.editorTabTooltip.unsaved', 'Unsaved changes'))
  }
  if (attention === 'review') {
    details.push(translate('auto.components.tab.bar.editorTabTooltip.review', 'Needs review'))
  } else if (attention === 'changed') {
    details.push(translate('auto.components.tab.bar.editorTabTooltip.changed', 'Changed'))
  }
  return details
}
