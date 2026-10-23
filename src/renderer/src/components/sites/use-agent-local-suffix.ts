import { useEffect, useState } from 'react'

async function readSuffix(): Promise<string | null> {
  try {
    const result = await window.api.siteStacks.agentLocalSuffix()
    return result.ok ? result.value : null
  } catch {
    return null
  }
}

/**
 * Read fresh on every mount: a local call costs milliseconds, and caching kept a changed suffix (or
 * a daemon that was down at first ask) for the whole session.
 * Undefined while loading; null when agent-local cannot say, so callers fall back to `.local`.
 */
export function useAgentLocalSuffix(): string | null | undefined {
  const [suffix, setSuffix] = useState<string | null | undefined>(undefined)
  useEffect(() => {
    let cancelled = false
    void readSuffix().then((value) => {
      if (!cancelled) {
        setSuffix(value)
      }
    })
    return () => {
      cancelled = true
    }
  }, [])
  return suffix
}
