// Resolves an ActiveCollab user id to their avatar URL via the store-cached roster read. The
// roster is one cached request per credential window (see listActiveCollabUsers), so every badge
// sharing this hook costs nothing beyond the first call.

import { useEffect, useState } from 'react'
import { useAppStore } from '@/store'

export function useActiveCollabUserAvatarUrl(userId: number | null | undefined): string | null {
  const listUsers = useAppStore((s) => s.listActiveCollabUsers)
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    if (userId === null || userId === undefined) {
      setUrl(null)
      return
    }
    let stale = false
    void listUsers().then((result) => {
      if (stale) {
        return
      }
      setUrl(
        result.ok ? (result.value.find((user) => user.id === userId)?.avatarUrl ?? null) : null
      )
    })
    return () => {
      stale = true
    }
  }, [userId, listUsers])

  return url
}
