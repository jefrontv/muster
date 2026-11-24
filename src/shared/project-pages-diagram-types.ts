import type { ProjectPageMeta } from './project-pages-types'

/** A diagram page and its draw.io mxGraphModel XML. */
export type ProjectPageDiagram = { page: ProjectPageMeta; xml: string }

export type ProjectPageDiagramSave = { baseRevision: number; xml: string; outline: string }
