// A page's kind icon (folder, diagram, or page), shared by every list that shows pages.
import { FileText, Folder, FolderOpen, Workflow, type LucideIcon } from 'lucide-react'
import type { ProjectPageMeta } from '../../../../shared/project-pages-types'

type PageKind = Pick<ProjectPageMeta, 'folder' | 'diagram'>

export function pageKindIcon(page: PageKind, open = false): LucideIcon {
  if (page.folder) {
    return open ? FolderOpen : Folder
  }
  return page.diagram ? Workflow : FileText
}

export function ProjectPageKindIcon(props: { page: PageKind; open?: boolean; className: string }) {
  const Icon = pageKindIcon(props.page, props.open)
  return <Icon className={props.className} />
}
