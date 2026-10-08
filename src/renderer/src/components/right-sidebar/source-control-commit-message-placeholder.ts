import { translate } from '@/i18n/i18n'
import { getScreenSubmitShortcutLabel } from '@/lib/screen-submit-shortcut'

export function resolveCommitMessagePlaceholder(branchName: string | null | undefined): string {
  const branch = branchName?.trim()
  if (!branch) {
    return translate('auto.components.right.sidebar.SourceControl.0d0a8359d3', 'Message')
  }
  return translate(
    'auto.components.right.sidebar.SourceControl.commitMessagePlaceholder',
    'Message ({{shortcut}} to commit on {{branch}})',
    { shortcut: getScreenSubmitShortcutLabel(), branch }
  )
}
