// What changed since the previous round, as the editor's own diff view shows a file's changes.
// Read-only: notes and edits belong to the Rich view, against the plan as it stands now.

import type React from 'react'
import { DiffEditor } from '@monaco-editor/react'
import '@/lib/monaco-setup'
import { useAppStore } from '@/store'
import { resolveDocumentTheme } from '@/lib/document-theme'
import { useEditorThemeName } from '@/lib/use-editor-theme-name'
import { computeDiffEditorFontSize, resolveEditorFontFamily } from '@/lib/editor-font-zoom'
import { diffEditorScrollbarOptions } from '../editor/diff-editor-scrollbar-options'

export default function PlanReviewChangesView({
  requestId,
  previous,
  current
}: {
  requestId: string
  previous: string
  current: string
}): React.JSX.Element {
  const settings = useAppStore((s) => s.settings)
  const editorFontZoomLevel = useAppStore((s) => s.editorFontZoomLevel)
  const themeName = useEditorThemeName(resolveDocumentTheme(settings?.theme ?? 'system'))
  return (
    <div className="h-full min-h-0 bg-[var(--editor-surface)]">
      <DiffEditor
        language="markdown"
        original={previous}
        modified={current}
        theme={themeName}
        // Per-request paths, so two reviews never share a Monaco model.
        originalModelPath={`plan-review/${requestId}/previous.md`}
        modifiedModelPath={`plan-review/${requestId}/current.md`}
        options={{
          readOnly: true,
          originalEditable: false,
          renderSideBySide: false,
          minimap: { enabled: false },
          scrollBeyondLastLine: false,
          fontSize: computeDiffEditorFontSize(
            settings?.terminalFontSize ?? 13,
            editorFontZoomLevel
          ),
          fontFamily: resolveEditorFontFamily(settings),
          lineNumbers: 'on',
          wordWrap: 'on',
          automaticLayout: true,
          scrollbar: diffEditorScrollbarOptions,
          padding: { top: 8 }
        }}
      />
    </div>
  )
}
