import { acquire, ghExecFileAsync, ghRepoExecOptions, release } from './gh-utils'
import type { OwnerRepo } from './github-repository-identity'

/**
 * The website a GitHub repo links to, or null. Best-effort: gh missing,
 * unauthenticated, offline, or a repo with no homepage all resolve to null,
 * because this only ever feeds a default icon.
 */
export async function getRepoHomepage(
  slug: OwnerRepo,
  repoPath: string,
  connectionId?: string | null
): Promise<string | null> {
  await acquire()
  try {
    const { stdout } = await ghExecFileAsync(
      ['api', `repos/${slug.owner}/${slug.repo}`, '--jq', '.homepage'],
      {
        ...ghRepoExecOptions({ repoPath, connectionId: connectionId ?? undefined }),
        encoding: 'utf-8',
        ...(slug.host ? { host: slug.host } : {})
      }
    )
    const homepage = stdout.trim()
    return homepage && homepage !== 'null' ? homepage : null
  } catch {
    return null
  } finally {
    release()
  }
}
