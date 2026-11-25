// Width of the Pages "Ask agent" panel. The upper bound follows the pane, so the page beside the
// chat always keeps at least 40% of the room.

export const PAGES_AGENT_PANEL_MIN_WIDTH = 320
export const PAGES_AGENT_PANEL_DEFAULT_WIDTH = 420
/** Bound for a stored width before the pane has been measured. */
export const PAGES_AGENT_PANEL_MAX_WIDTH = 1600
const MAX_SHARE_OF_PANE = 0.6

export function computeMaxPagesAgentPanelWidth(paneWidth: number): number {
  if (!Number.isFinite(paneWidth) || paneWidth <= 0) {
    return PAGES_AGENT_PANEL_MAX_WIDTH
  }
  return Math.max(PAGES_AGENT_PANEL_MIN_WIDTH, Math.floor(paneWidth * MAX_SHARE_OF_PANE))
}

export function clampPagesAgentPanelWidth(
  width: unknown,
  paneWidth?: number,
  fallback = PAGES_AGENT_PANEL_DEFAULT_WIDTH
): number {
  if (typeof width !== 'number' || !Number.isFinite(width)) {
    return fallback
  }
  const maxWidth =
    paneWidth !== undefined
      ? computeMaxPagesAgentPanelWidth(paneWidth)
      : PAGES_AGENT_PANEL_MAX_WIDTH
  return Math.round(Math.min(maxWidth, Math.max(PAGES_AGENT_PANEL_MIN_WIDTH, width)))
}
