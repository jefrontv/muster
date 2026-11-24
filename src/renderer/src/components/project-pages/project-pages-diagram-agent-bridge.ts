// Answers agents' diagram work from the main process. maxGraph loads only when the first request arrives.
import type { DiagramWorkRequest } from '../../../../shared/project-pages-diagram-agent'

export function attachDiagramAgentBridge(): () => void {
  const pages = window.api.projectPages
  if (!pages?.onDiagramWork) {
    return () => undefined
  }
  return pages.onDiagramWork(async ({ id, ...work }) => {
    try {
      const { runDiagramWork } = await import('./project-pages-diagram-agent-worker')
      const result = await runDiagramWork(work as DiagramWorkRequest)
      pages.respondDiagramWork({ id, ok: true, result })
    } catch (error) {
      pages.respondDiagramWork({
        id,
        ok: false,
        error: error instanceof Error ? error.message : String(error)
      })
    }
  })
}
