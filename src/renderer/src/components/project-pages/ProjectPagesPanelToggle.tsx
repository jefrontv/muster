// Hide/show for the Pages side panels; each panel remembers its choice.
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import type React from 'react'
import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'

export type PagesPanel = 'pagesSidebar' | 'diagramPalette'

const storageKey = (panel: PagesPanel): string => `muster.pages.${panel}.collapsed`

export function usePagesPanelCollapsed(panel: PagesPanel): [boolean, () => void] {
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(storageKey(panel)) === '1')
  const toggle = useCallback(() => {
    setCollapsed((was) => {
      localStorage.setItem(storageKey(panel), was ? '0' : '1')
      return !was
    })
  }, [panel])
  return [collapsed, toggle]
}

const AGENT_OPEN_KEY = 'muster.pages.agentPanel.open'

/** Ask agent panel open state; one choice for all projects, like the other panels. */
export function usePagesAgentPanelOpen(): [boolean, React.Dispatch<React.SetStateAction<boolean>>] {
  const [open, setOpen] = useState(() => localStorage.getItem(AGENT_OPEN_KEY) === '1')
  useEffect(() => {
    localStorage.setItem(AGENT_OPEN_KEY, open ? '1' : '0')
  }, [open])
  return [open, setOpen]
}

/** Slides a panel shut; the content keeps its width so nothing reflows while it moves. */
export function PagesPanelSlot(props: {
  collapsed: boolean
  width: string
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <div
      inert={props.collapsed}
      className={`flex min-h-0 shrink-0 overflow-hidden transition-[width] duration-200 ease-out motion-reduce:transition-none ${props.collapsed ? 'w-0' : props.width}`}
    >
      {props.children}
    </div>
  )
}

export function PagesPanelToggle(props: {
  collapsed: boolean
  onToggle: () => void
  showLabel: string
  hideLabel: string
}): React.JSX.Element {
  const label = props.collapsed ? props.showLabel : props.hideLabel
  const Icon = props.collapsed ? PanelLeftOpen : PanelLeftClose
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      className="shrink-0 text-muted-foreground"
      aria-label={label}
      aria-expanded={!props.collapsed}
      title={label}
      onClick={props.onToggle}
    >
      <Icon className="size-4" />
    </Button>
  )
}
