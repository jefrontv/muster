import { describe, expect, it } from 'vitest'
import {
  clampPagesAgentPanelWidth,
  computeMaxPagesAgentPanelWidth,
  PAGES_AGENT_PANEL_DEFAULT_WIDTH
} from './project-pages-agent-panel-width'

describe('Ask agent panel width', () => {
  it('keeps the width between 320px and 60% of the pane', () => {
    expect(clampPagesAgentPanelWidth(100, 1000)).toBe(320)
    expect(clampPagesAgentPanelWidth(900, 1000)).toBe(600)
    expect(clampPagesAgentPanelWidth(480, 1000)).toBe(480)
    expect(computeMaxPagesAgentPanelWidth(400)).toBe(320)
  })

  it('falls back to the default for a missing or corrupt stored width', () => {
    expect(clampPagesAgentPanelWidth(undefined)).toBe(PAGES_AGENT_PANEL_DEFAULT_WIDTH)
    expect(clampPagesAgentPanelWidth(Number.NaN)).toBe(PAGES_AGENT_PANEL_DEFAULT_WIDTH)
  })
})
