// The concrete model behind each Claude alias, so a pick ("haiku") reads "Haiku 5.5" before the
// session reports its model. The CLI's own list wins; the newest id seen in transcripts is the
// fallback when the CLI can't be asked. Fetched once per app run.

import { useEffect, useState } from 'react'
import { latestClaudeSightings } from '../../../../shared/claude-model-name'

type Sightings = (family: string) => string | null

const NONE: Sightings = () => null
let cached: Sightings | null = null
let pending: Promise<Sightings> | null = null

async function readSightings(): Promise<Sightings> {
  const nativeChat = window.api?.nativeChat
  const [learned, cli] = await Promise.all([
    nativeChat?.learnedClaudeModels?.().catch(() => ({})) ?? Promise.resolve({}),
    nativeChat?.claudeCliModels?.().catch(() => []) ?? Promise.resolve([])
  ])
  const seen = latestClaudeSightings(learned)
  const resolved = new Map<string, string>()
  for (const model of cli) {
    if (model.resolvedModel) {
      resolved.set(model.value, model.resolvedModel)
    }
  }
  return (family) => resolved.get(family) ?? seen(family)
}

function loadSightings(): Promise<Sightings> {
  pending ??= readSightings()
    .catch(() => NONE)
    .then((next) => {
      cached = next
      return next
    })
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
