// Who "Post & reassign" offers first: the person last picked in this project, anyone @mentioned in
// the draft, then the task's delegator and creator. Each person once, never the signed-in user.
import type { BotsHandBackPerson } from '../../../../shared/bots-comment-draft-types'
import type { HandBackTo } from './bots-comment-draft-post-action'

const STORAGE_PREFIX = 'muster.bots.reassign.'

export function draftMentionedPeople(bodyHtml: string): HandBackTo[] {
  const doc = new DOMParser().parseFromString(bodyHtml, 'text/html')
  const people: HandBackTo[] = []
  for (const node of doc.querySelectorAll<HTMLElement>('[data-user-id]')) {
    const userId = Number(node.dataset.userId)
    const name = node.textContent?.replace(/^@/, '').trim()
    if (Number.isInteger(userId) && userId > 0 && name) {
      people.push({ userId, name })
    }
  }
  return people
}

export function reassignCandidates(args: {
  remembered: HandBackTo | null
  bodyHtml: string
  handBackPeople: readonly BotsHandBackPerson[]
  selfId: number | null
}): HandBackTo[] {
  const ordered = [
    ...(args.remembered ? [args.remembered] : []),
    ...draftMentionedPeople(args.bodyHtml),
    ...args.handBackPeople.map(({ userId, name }) => ({ userId, name }))
  ]
  const seen = new Set<number>()
  return ordered.filter((person) => {
    if (person.userId === args.selfId || seen.has(person.userId)) {
      return false
    }
    seen.add(person.userId)
    return true
  })
}

export function rememberedReassign(projectId: number): HandBackTo | null {
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}${projectId}`)
    const parsed = raw ? (JSON.parse(raw) as Partial<HandBackTo>) : null
    return typeof parsed?.userId === 'number' && typeof parsed.name === 'string'
      ? { userId: parsed.userId, name: parsed.name }
      : null
  } catch {
    return null
  }
}

export function rememberReassign(projectId: number, person: HandBackTo): void {
  try {
    localStorage.setItem(`${STORAGE_PREFIX}${projectId}`, JSON.stringify(person))
  } catch {
    // Remembering is a convenience; posting already succeeded or failed on its own.
  }
}
