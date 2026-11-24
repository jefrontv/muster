// ActiveCollab task and project URLs in page markdown. Pages store them as ordinary links, so
// agents, exports and other tools read a plain URL.

export type ActiveCollabPageRef =
  | { kind: 'task'; projectId: number; taskId: number }
  | { kind: 'project'; projectId: number }

const PATH = /^\/projects\/(\d+)(?:\/tasks\/(\d+))?\/?(?:[?#].*)?$/
const URL_IN_TEXT = /https?:\/\/[^\s)<>\]"'`]+/g

function base(instanceUrl: string): string {
  return instanceUrl.trim().replace(/\/+$/, '')
}

/** The task or project an href points at, when it is on the connected instance. */
export function parseActiveCollabUrl(
  href: string,
  instanceUrl: string
): ActiveCollabPageRef | null {
  const root = base(instanceUrl)
  if (!root || !href.toLowerCase().startsWith(`${root.toLowerCase()}/`)) {
    return null
  }
  const match = href.slice(root.length).match(PATH)
  if (!match) {
    return null
  }
  const projectId = Number(match[1])
  return match[2]
    ? { kind: 'task', projectId, taskId: Number(match[2]) }
    : { kind: 'project', projectId }
}

export function activeCollabUrl(instanceUrl: string, ref: ActiveCollabPageRef): string {
  const project = `${base(instanceUrl)}/projects/${ref.projectId}`
  return ref.kind === 'task' ? `${project}/tasks/${ref.taskId}` : project
}

export function activeCollabRefKey(ref: ActiveCollabPageRef): string {
  return ref.kind === 'task' ? `task:${ref.taskId}` : `project:${ref.projectId}`
}

/** Every task and project the markdown links to, once each, in order of appearance. */
export function activeCollabRefsIn(markdown: string, instanceUrl: string): ActiveCollabPageRef[] {
  const found = new Map<string, ActiveCollabPageRef>()
  for (const match of markdown.matchAll(URL_IN_TEXT)) {
    const ref = parseActiveCollabUrl(match[0], instanceUrl)
    if (ref && !found.has(activeCollabRefKey(ref))) {
      found.set(activeCollabRefKey(ref), ref)
    }
  }
  return [...found.values()]
}
