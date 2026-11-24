// Loads the diagram editor (and maxGraph) only when a diagram page opens.
import type React from 'react'
import { lazy, Suspense } from 'react'

const ProjectPageDiagramView = lazy(() =>
  import('./ProjectPageDiagramView').then((m) => ({ default: m.ProjectPageDiagramView }))
)

export function ProjectPageDiagramViewLazy(
  props: React.ComponentProps<typeof ProjectPageDiagramView>
) {
  return (
    <Suspense fallback={<div className="flex-1" />}>
      <ProjectPageDiagramView {...props} />
    </Suspense>
  )
}
