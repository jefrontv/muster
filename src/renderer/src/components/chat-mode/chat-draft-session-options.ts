// The hero's model/effort options as a session-option surface, so the hero and the
// thread composer share one picker. No session exists yet: picks persist as the
// chat defaults the thread launcher reads, and an unpicked value stays unknown.

import { useMemo } from 'react'
import { useAppStore } from '@/store'
import {
  catalogDefaultModel,
  findCatalogModel,
  getAgentSessionOptionCatalog,
  type CatalogModel
} from '../../../../shared/agent-session-option-catalog'
import {
  resolveNativeChatSessionOptionDefaults,
  updateNativeChatSessionOptionDefaults
} from '../../../../shared/native-chat-session-option-defaults'
import type {
  PersistedNativeChatSessionOptions,
  SessionOptionDescriptor,
  SessionOptionsSurface
} from '../../../../shared/native-chat-session-options'
import { useClaudeCatalogModelsWithLearned } from '../native-chat/claude-learned-models'

export function chatDraftSessionOptionSnapshot(
  models: readonly CatalogModel[],
  persisted: PersistedNativeChatSessionOptions | null | undefined
): SessionOptionDescriptor[] {
  const defaults = resolveNativeChatSessionOptionDefaults(persisted, 'claude')
  const picked = typeof defaults?.model === 'string' ? defaults.model : null
  const catalog = getAgentSessionOptionCatalog('claude')
  const model =
    (picked ? models.find((candidate) => candidate.id === picked) : undefined) ??
    (catalog ? catalogDefaultModel({ ...catalog, models: [...models] }) : undefined)
  const snapshot: SessionOptionDescriptor[] = [
    {
      id: 'model',
      label: 'Model',
      category: 'model',
      kind: {
        type: 'select',
        ...(picked ? { currentValue: picked } : {}),
        choices: models.map(({ id, label, description }) => ({
          value: id,
          label,
          ...(description ? { description } : {})
        }))
      },
      valueSource: picked ? 'applied' : 'unknown',
      settable: true
    }
  ]
  const effort = model?.options.find((option) => option.id === 'effort')
  if (effort?.kind.type === 'select') {
    const value = typeof defaults?.effort === 'string' ? defaults.effort : null
    snapshot.push({
      id: 'effort',
      label: effort.label,
      category: effort.category ?? 'thought_level',
      kind: {
        type: 'select',
        ...(value ? { currentValue: value } : {}),
        choices: effort.kind.choices
      },
      valueSource: value ? 'applied' : 'unknown',
      settable: true
    })
  }
  return snapshot
}

export function useChatDraftSessionOptions(): {
  surface: SessionOptionsSurface | null
  snapshot: SessionOptionDescriptor[]
} {
  const persisted = useAppStore((s) => s.settings?.nativeChatSessionOptions)
  const models = useClaudeCatalogModelsWithLearned()
  const snapshot = useMemo(
    () => chatDraftSessionOptionSnapshot(models, persisted),
    [models, persisted]
  )
  const surface = useMemo<SessionOptionsSurface | null>(() => {
    const catalog = getAgentSessionOptionCatalog('claude')
    if (!catalog) {
      return null
    }
    return {
      getSnapshot: () => snapshot,
      subscribe: () => () => undefined,
      invokeAction: async () => ({ snapshot }),
      setOption: async (id, value) => {
        const store = useAppStore.getState()
        const current = store.settings?.nativeChatSessionOptions
        const picked = resolveNativeChatSessionOptionDefaults(current, 'claude')?.model
        const modelId =
          id === 'model'
            ? String(value)
            : typeof picked === 'string' && findCatalogModel({ ...catalog, models }, picked)
              ? picked
              : (catalogDefaultModel({ ...catalog, models })?.id ?? '')
        await store.updateSettings({
          nativeChatSessionOptions: updateNativeChatSessionOptionDefaults({
            persisted: current,
            agent: 'claude',
            modelId,
            optionId: id,
            value
          })
        })
        return { snapshot }
      }
    }
  }, [models, snapshot])
  return { surface, snapshot }
}
