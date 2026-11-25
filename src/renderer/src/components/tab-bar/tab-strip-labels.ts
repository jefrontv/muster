import { getEditorDisplayLabel } from '@/components/editor/editor-labels'
import { translate } from '@/i18n/i18n'
import { basename } from '@/lib/path'
import type { OpenFile } from '@/store/slices/editor'

// Why: must match projectPagesTabLabel and planReviewTabLabel; the round-trip test pins them.
const PAGES_PREFIX = 'Pages: '
const PLAN_REVIEW_PREFIX = 'Review: '

type LabelFile = Pick<
  OpenFile,
  | 'mode'
  | 'relativePath'
  | 'filePath'
  | 'diffSource'
  | 'checkRunDetails'
  | 'combinedAreaFilter'
  | 'branchCompare'
  | 'commitCompare'
>

function stripPrefix(label: string, prefix: string): string {
  return label.startsWith(prefix) && label.length > prefix.length
    ? label.slice(prefix.length)
    : label
}

/** The strip's shorter label; the icon and tooltip carry the kind. Other surfaces keep getEditorDisplayLabel. */
export function getTabStripEditorLabel(file: LabelFile): string {
  if (file.mode === 'project-pages') {
    return stripPrefix(file.relativePath, PAGES_PREFIX)
  }
  if (file.mode === 'plan-review') {
    return stripPrefix(file.relativePath, PLAN_REVIEW_PREFIX)
  }
  if (file.mode === 'markdown-preview') {
    return basename(file.relativePath)
  }
  return getEditorDisplayLabel(file as OpenFile)
}

/** Tooltip line naming what the strip label dropped, or null. */
export function getTabStripEditorKind(file: Pick<OpenFile, 'mode'>): string | null {
  switch (file.mode) {
    case 'project-pages':
      return translate('auto.components.tab.bar.tabStripLabels.pages', 'Pages')
    case 'plan-review':
      return translate('auto.components.tab.bar.tabStripLabels.planReview', 'Plan review')
    case 'markdown-preview':
      return translate('auto.components.tab.bar.tabStripLabels.markdownPreview', 'Markdown preview')
    default:
      return null
  }
}

/** Tooltip lines that say what the tab is and where it lives. */
export function getTabStripEditorContextLines(
  file: Pick<OpenFile, 'mode' | 'diffSource' | 'relativePath'>,
  label: string
): string[] {
  const lines: string[] = []
  const kind = getTabStripEditorKind(file)
  if (kind && kind !== label) {
    lines.push(kind)
  }
  if (hasFilePathLabel(file) && file.relativePath !== label) {
    lines.push(file.relativePath)
  }
  return lines
}

/** True when relativePath is a real file path worth showing or disambiguating. */
export function hasFilePathLabel(file: Pick<OpenFile, 'mode' | 'diffSource'>): boolean {
  if (file.mode === 'edit' || file.mode === 'markdown-preview') {
    return true
  }
  return file.mode === 'diff' && !(file.diffSource ?? '').startsWith('combined')
}
