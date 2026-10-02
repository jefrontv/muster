// Newest concrete model id seen per Claude family, so an alias pick ("opus") can
// read "Opus 5.5" before the session reports its model. Fetched once per app run.

import { useEffect, useState } from 'react'
import { latestClaudeSightings } from '../../../../shared/claude-model-name'

type Sightings = (family: string) => string | null

const NONE: Sightings = () => null
let cached: Sightings | null = null
let pending: Promise<Sightings> | null = null

function loadSightings(): Promise<Sightings> {
  pending ??= (async () => {
    try {
      const list = window.api?.nativeChat?.learnedClaudeModels
      cached = typeof list === 'function' ? latestClaudeSightings(await list()) : NONE
    } catch {
      cached = NONE
    }
    return cached
  })()
  return pending
}

export function useClaudeModelSightings(): Sightings {
  const [sightings, setSightings] = useState<Sightings>(() => cached ?? NONE)
  useEffect(() => {
    if (cached) {
      return
    }
    let cancelled = false
    void loadSightings().then((next) => {
      if (!cancelled) {
        setSightings(() => next)
      }
    })
    return () => {
      cancelled = true
    }
  }, [])
  return sightings
}
