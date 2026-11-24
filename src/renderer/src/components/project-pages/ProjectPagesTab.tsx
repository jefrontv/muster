// Pages inside a project tab, bound to the tab's project.
import type React from 'react'
import { useCallback } from 'react'
import { useAppStore } from '@/store'
import type { OpenFile } from '@/store/slices/editor'
import ProjectPagesPage from './ProjectPagesPage'

export default function ProjectPagesTab({ file }: { file: OpenFile }): React.JSX.Element | null {
  const showPage = useAppStore((s) => s.showProjectPagesTabPage)
  const onShowPage = useCallback(
    (pageId: string | null, title: string | null) => showPage(file.id, pageId, title),
    [showPage, file.id]
  )
  const state = file.projectPages
  if (!state) {
    return null
  }
  return (
    <ProjectPagesPage
      embedded={{
        scopeKey: state.scopeKey,
        pageId: state.pageId,
        request: state.request,
        onShowPage
      }}
    />
  )
}
