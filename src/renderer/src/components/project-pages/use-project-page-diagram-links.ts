// Keeps shape link badges current and opens what a link points at.
import { InternalEvent } from '@maxgraph/core'
import { useCallback, useEffect, useRef } from 'react'
import { useAppStore } from '@/store'
import { onActiveCollabPageData, openActiveCollabRef } from './project-pages-activecollab-data'
import type { DiagramEditor } from './project-pages-diagram-graph'
import { syncLinkBadges, type DiagramLink } from './project-pages-diagram-links'

export function useProjectPageDiagramLinks(
  editor: DiagramEditor | null,
  onOpenPage: (pageId: string) => void
): (link: DiagramLink) => void {
  const openPageRef = useRef(onOpenPage)
  openPageRef.current = onOpenPage
  const open = useCallback((link: DiagramLink) => {
    if (link.kind === 'page') {
      openPageRef.current(link.pageId)
    } else if (link.kind === 'activecollab') {
      openActiveCollabRef(link.ref)
    } else {
      void window.api.shell.openUrl(link.href)
    }
  }, [])

  useEffect(() => {
    if (!editor) {
      return
    }
    const store = useAppStore.getState()
    if (!store.activeCollabStatusChecked) {
      void store.checkActiveCollabConnection()
    }
    let frame = 0
    const sync = (): void => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => syncLinkBadges(editor.graph, open))
    }
    const model = editor.graph.getDataModel()
    model.addListener(InternalEvent.CHANGE, sync)
    const stopData = onActiveCollabPageData(sync)
    const stopStore = useAppStore.subscribe((state, before) => {
      if (state.activeCollabStatus !== before.activeCollabStatus) {
        sync()
      }
    })
    sync()
    return () => {
      cancelAnimationFrame(frame)
      model.removeListener(sync)
      stopData()
      stopStore()
    }
  }, [editor, open])

  return open
}
