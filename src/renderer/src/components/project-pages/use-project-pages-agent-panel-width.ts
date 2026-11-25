// Drag, double-click and arrow-key resizing for the Ask agent panel, on the app's sidebar resize hook.
import type React from 'react'
import { useEffect, useState } from 'react'
import { useSidebarResize } from '@/hooks/useSidebarResize'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import {
  clampPagesAgentPanelWidth,
  computeMaxPagesAgentPanelWidth,
  PAGES_AGENT_PANEL_DEFAULT_WIDTH,
  PAGES_AGENT_PANEL_MIN_WIDTH
} from '../../../../shared/project-pages-agent-panel-width'

const KEY_STEP_PX = 16

export function useProjectPagesAgentPanelWidth(): {
  containerRef: React.RefObject<HTMLElement | null>
  isResizing: boolean
  separatorProps: React.HTMLAttributes<HTMLDivElement> & { role: 'separator' }
} {
  const storedWidth = useAppStore((s) => s.pagesAgentPanelWidth)
  const setWidth = useAppStore((s) => s.setPagesAgentPanelWidth)
  const [paneWidth, setPaneWidth] = useState<number | undefined>(undefined)
  const width = clampPagesAgentPanelWidth(storedWidth, paneWidth)
  const maxWidth = computeMaxPagesAgentPanelWidth(paneWidth ?? 0)
  // deltaSign -1: the panel is on the right, so dragging its handle left widens it.
  const { containerRef, onResizeStart, isResizing } = useSidebarResize<HTMLElement>({
    isOpen: true,
    width,
    minWidth: PAGES_AGENT_PANEL_MIN_WIDTH,
    maxWidth,
    deltaSign: -1,
    setWidth
  })

  useEffect(() => {
    const pane = containerRef.current?.parentElement
    if (!pane) {
      return undefined
    }
    const observer = new ResizeObserver(() => setPaneWidth(pane.clientWidth))
    observer.observe(pane)
    setPaneWidth(pane.clientWidth)
    return () => observer.disconnect()
  }, [containerRef])

  const onKeyDown = (event: React.KeyboardEvent): void => {
    const next: Record<string, number> = {
      ArrowLeft: width + KEY_STEP_PX,
      ArrowRight: width - KEY_STEP_PX,
      Home: PAGES_AGENT_PANEL_MIN_WIDTH,
      End: maxWidth
    }
    if (event.key in next) {
      event.preventDefault()
      setWidth(clampPagesAgentPanelWidth(next[event.key], paneWidth))
    }
  }

  return {
    containerRef,
    isResizing,
    separatorProps: {
      role: 'separator',
      tabIndex: 0,
      'aria-orientation': 'vertical',
      'aria-label': translate('auto.components.projectPages.agentPanelResize', 'Resize Ask agent'),
      'aria-valuenow': width,
      'aria-valuemin': PAGES_AGENT_PANEL_MIN_WIDTH,
      'aria-valuemax': maxWidth,
      // The drag overlay takes the mouseup, so no dblclick reaches the handle; count clicks here.
      onMouseDown: (event) =>
        event.detail === 2 ? setWidth(PAGES_AGENT_PANEL_DEFAULT_WIDTH) : onResizeStart(event),
      onKeyDown
    }
  }
}
