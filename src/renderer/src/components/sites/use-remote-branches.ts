import { useEffect, useState } from 'react'
import type { RemoteBranchList } from '../../../../shared/remote-branches-api-types'

export type RemoteBranchesState = RemoteBranchList & { loading: boolean }

const IDLE: RemoteBranchesState = { loading: false, ok: false, branches: [], defaultBranch: null }

/** Lists the remote's branches once per URL; an empty URL stays idle. */
export function useRemoteBranches(url: string): RemoteBranchesState {
  const [state, setState] = useState<RemoteBranchesState>(IDLE)
  useEffect(() => {
    if (url.length === 0) {
      setState(IDLE)
      return
    }
    let cancelled = false
    setState({ ...IDLE, loading: true })
    void window.api.remoteBranches
      .list({ url })
      .catch(() => ({ ok: false, branches: [], defaultBranch: null }))
      .then((result) => {
        if (!cancelled) {
          setState({ ...result, loading: false })
        }
      })
    return () => {
      cancelled = true
    }
  }, [url])
  return state
}

/** The link's branch first, then the remote default, then the rest as listed. */
export function orderCloneBranches(
  branches: string[],
  linkBranch: string,
  defaultBranch: string | null
): string[] {
  const head = [linkBranch, defaultBranch ?? ''].filter((b) => b.length > 0)
  return [...new Set([...head, ...branches])]
}
