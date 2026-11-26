import type { ProjectPagesResult } from '../../../../shared/project-pages-types'

export type ProjectPageCreateRequest = {
  parentId: string | null
  folder?: boolean
  diagram?: boolean
}

/**
 * Creates a page, a folder or a diagram page. Every "New …" entry point goes through here so a
 * diagram is switched on before anyone opens the page.
 */
export async function createProjectPage(
  scopeKey: string,
  { parentId, folder = false, diagram = false }: ProjectPageCreateRequest
): Promise<ProjectPagesResult<{ id: string }>> {
  const created = await window.api.projectPages.create(scopeKey, { parentId, folder })
  if (!created.ok) {
    return created
  }
  const id = created.value.meta.id
  if (diagram) {
    const enabled = await window.api.projectPages.enableDiagram(scopeKey, id)
    if (!enabled.ok) {
      return enabled
    }
  }
  return { ok: true, value: { id } }
}
