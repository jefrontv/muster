import type React from 'react'
import { ClipboardCheck, Eye, FileText, GitCompareArrows, ListChecks } from 'lucide-react'
import { getFileTypeIcon } from '@/lib/file-type-icons'
import type { OpenFile } from '@/store/slices/editor'

type TabIcon = React.ComponentType<{ className?: string }>

/** Leading icon for an editor tab: the view kind for special tabs, else the file type. */
export function getEditorTabIcon(file: Pick<OpenFile, 'mode' | 'filePath'>): TabIcon {
  switch (file.mode) {
    case 'check-details':
      return ListChecks
    case 'plan-review':
      return ClipboardCheck
    case 'project-pages':
      return FileText
    case 'diff':
      return GitCompareArrows
    case 'markdown-preview':
      return Eye
    default:
      return getFileTypeIcon(file.filePath)
  }
}
