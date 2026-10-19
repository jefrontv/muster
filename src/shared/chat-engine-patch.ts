// Folds main's numbered chat-engine patches into a thread snapshot. A patch
// carries only the turns that changed, so a skipped version can lose a turn for
// good: on 'gap' the caller drops its copy and subscribes again.

import type { ChatEnginePatch, ChatEngineSnapshot } from './chat-engine-types'

export function applyChatEnginePatch(
  view: ChatEngineSnapshot,
  patch: ChatEnginePatch
): ChatEngineSnapshot | 'gap' {
  if (patch.version <= view.version) {
    return view
  }
  if (patch.version !== view.version + 1) {
    return 'gap'
  }
  let turns = view.turns
  if (patch.turns?.length) {
    turns = [...view.turns]
    for (const turn of patch.turns) {
      const index = turns.findIndex((existing) => existing.id === turn.id)
      if (index === -1) {
        turns.push(turn)
      } else {
        turns[index] = turn
      }
    }
  }
  return { version: patch.version, meta: patch.meta ?? view.meta, turns }
}
