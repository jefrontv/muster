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

export type ActiveCollabTaskLink = { key: string; href: string; title: string }

const MARKDOWN_LINK = /\[((?:\\.|[^\]\\\n])*)\]\((https?:\/\/[^\s)]+)\)/g
const TASK_PATH = /^\/projects\/\d+\/tasks\/(\d+)\/?$/

/**
 * Task links in the markdown, keyed by host and task id, with the link text as the title. Needs no
 * connection, so the search index can match pages that share a task.
 */
export function activeCollabTaskLinks(markdown: string): ActiveCollabTaskLink[] {
  const found = new Map<string, ActiveCollabTaskLink>()
  const add = (href: string, text: string): void => {
    let url: URL
    try {
      url = new URL(href)
    } catch {
      return
    }
    const taskId = url.pathname.match(TASK_PATH)?.[1]
    const key = taskId ? `${url.host.toLowerCase()}/tasks/${taskId}` : null
    if (key && !found.has(key)) {
      const title = text.replace(/\\(.)/g, '$1').trim()
      found.set(key, { key, href, title: title || `Task ${taskId}` })
    }
  }
  for (const match of markdown.matchAll(MARKDOWN_LINK)) {
    add(match[2], match[1])
  }
  for (const match of markdown.matchAll(URL_IN_TEXT)) {
    add(match[0], '')
  }
  return [...found.values()]
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
