// Picker families learned from observed model ids (main-process registry).
// This is how a brand-new Claude model appears in the model picker without an
// app release: used once anywhere (even a hand-typed /model), it is learned.

import { useEffect, useState } from 'react'
import {
  getAgentSessionOptionCatalog,
  mergeCatalogModels
} from '../../../../shared/agent-session-option-catalog'
import { learnedClaudeFamilyCatalogModel } from '../../../../shared/agent-session-option-catalog-claude-codex'
import type { CatalogModel } from '../../../../shared/agent-session-option-catalog'
import { claudeModelFamilyFromId } from '../../../../shared/claude-model-family'

// undefined = not fetched yet; null = fetched, nothing beyond the static list.
let cached: CatalogModel[] | null | undefined
let pending: Promise<CatalogModel[] | null> | null = null

export async function learnedClaudeCatalogModels(): Promise<CatalogModel[] | null> {
  if (cached !== undefined) {
    return cached
  }
  pending ??= (async () => {
    try {
      // Older bridged web clients may predate this method.
      const list = window.api?.nativeChat?.learnedClaudeModels
      if (typeof list !== 'function') {
        cached = null
        return cached
      }
      const learned = await list()
      const known = new Set(
        (getAgentSessionOptionCatalog('claude')?.models ?? []).map((model) => model.id)
      )
      const extra: CatalogModel[] = []
      for (const modelId of Object.keys(learned)) {
        const family = claudeModelFamilyFromId(modelId)
        if (!family || known.has(family.id) || extra.some((model) => model.id === family.id)) {
          continue
        }
        extra.push(learnedClaudeFamilyCatalogModel(family))
      }
      cached = extra.length > 0 ? extra : null
      return cached
    } catch {
      cached = null
      return cached
    }
  })()
  return pending
}

/** The Claude catalog models plus learned families, for surfaces that render a
 *  model dropdown outside the session-option enrichment flow (chat hero). */
export function useClaudeCatalogModelsWithLearned(): CatalogModel[] {
  const staticModels = getAgentSessionOptionCatalog('claude')?.models ?? []
  const [models, setModels] = useState<CatalogModel[]>(staticModels)
  useEffect(() => {
    let cancelled = false
    void learnedClaudeCatalogModels().then((extra) => {
      if (!cancelled && extra && extra.length > 0) {
        setModels(mergeCatalogModels(staticModels, extra))
      }
    })
    return () => {
      cancelled = true
    }
    // staticModels is a stable catalog constant.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return models
}

export function clearLearnedClaudeModelsCacheForTests(): void {
  cached = undefined
  pending = null
}
