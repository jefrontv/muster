import { describe, expect, it } from 'vitest'
import { getAgentSessionOptionCatalog } from '../../../../shared/agent-session-option-catalog'
import { chatDraftSessionOptionSnapshot } from './chat-draft-session-options'

const models = getAgentSessionOptionCatalog('claude')?.models ?? []

describe('chatDraftSessionOptionSnapshot', () => {
  it('leaves model and effort unknown until the user picks', () => {
    const [model, effort] = chatDraftSessionOptionSnapshot(models, undefined)
    expect(model).toMatchObject({ id: 'model', valueSource: 'unknown' })
    expect(model?.kind.type === 'select' && model.kind.currentValue).toBeUndefined()
    expect(effort).toMatchObject({ id: 'effort', valueSource: 'unknown' })
  })

  it('reads back the picked model and its effort', () => {
    const snapshot = chatDraftSessionOptionSnapshot(models, {
      claude: { model: 'opus', valuesByModel: { opus: { effort: 'medium' } } }
    })
    expect(
      snapshot.map((d) => [d.id, d.kind.type === 'select' ? d.kind.currentValue : null])
    ).toEqual([
      ['model', 'opus'],
      ['effort', 'medium']
    ])
  })

  it('has no effort row for a model without one', () => {
    const snapshot = chatDraftSessionOptionSnapshot(models, { claude: { model: 'haiku' } })
    expect(snapshot.map((d) => d.id)).toEqual(['model'])
  })
})
