// The two people reads the @mention menu is built on: the whole instance roster, and the members
// of one project.
//
// Both answer `{ id, name }` and nothing else — no emails, avatars or permissions cross the bridge
// — and both resolve their names out of the credential-keyed window in name-directory.ts that the
// assignee join already fills, so the menu can never spell a colleague differently from the
// assignee row beside it.

import type { ActiveCollabResult } from '../../shared/activecollab-api-types'
import type { ActiveCollabUser } from '../../shared/activecollab-types'
import { acClient, guard } from './activecollab-operation-context'
import { positiveId, record } from './activecollab-argument-validation'

/**
 * The instance-wide roster, served out of the name directory rather than a second `/users` read.
 *
 * That collection is ALREADY fetched behind a credential-keyed, TTL'd, in-flight-shared window to
 * label assignees, and every path that reaches a comment composer — the task list, then the task
 * detail — warms it on the way in. Fetching it again here would double a 176-row request to answer
 * with the identical rows. Sorted by name so a capped suggestion list is stable between keystrokes.
 */
export function acListUsers(): Promise<ActiveCollabResult<ActiveCollabUser[]>> {
  return guard(async () => {
    const directory = await acClient().names()
    return [...directory.users.values()].sort((left, right) => left.name.localeCompare(right.name))
  })
}

/**
 * The members of one project — seven people where the roster has 176, on the instance this was
 * verified against.
 *
 * An EMPTY array is a real answer, not an error, and it is the renderer's signal to offer the whole
 * roster instead: a fetch fault, a membership nobody in the roster can name, and a project that
 * genuinely has no members all reach the composer the same way, because in every one of them a
 * mention menu showing nobody would read as "nobody exists" and block a legitimate mention. The
 * decision is left here rather than substituted upstream so the composer can SAY it fell back.
 */
export function acListProjectMembers(
  args: unknown
): Promise<ActiveCollabResult<ActiveCollabUser[]>> {
  return guard(async () => {
    const projectId = positiveId(record(args).projectId, 'projectId')
    return acClient().members(projectId)
  })
}
