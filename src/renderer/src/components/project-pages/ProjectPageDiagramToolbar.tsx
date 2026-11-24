// Diagram toolbar: undo/redo, zoom, fit, duplicate, delete.
import { Copy, Maximize, Redo2, Trash2, Undo2, ZoomIn, ZoomOut } from 'lucide-react'
import type React from 'react'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import { fitDiagram, zoomAt, type DiagramEditor } from './project-pages-diagram-graph'
import { deleteSelection, duplicateSelection } from './project-pages-diagram-keys'
import type { DiagramSelection } from './use-project-page-diagram-selection'
import { ProjectPageDiagramMenus } from './ProjectPageDiagramMenus'

const isMac = navigator.userAgent.includes('Mac')
const mod = isMac ? '⌘' : 'Ctrl+'
const t = (key: string, fallback: string): string =>
  translate(`auto.components.projectPages.diagram.${key}`, fallback)

function ToolButton(props: {
  label: string
  disabled?: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label={props.label}
      title={props.label}
      disabled={props.disabled}
      onClick={props.onClick}
    >
      {props.children}
    </Button>
  )
}

export function ProjectPageDiagramToolbar({
  editor,
  selection,
  title
}: {
  editor: DiagramEditor | null
  selection: DiagramSelection
  title: string
}) {
  const graph = editor?.graph
  const none = selection.cells.length === 0
  return (
    <div className="flex items-center gap-0.5 px-4 pb-2">
      <ToolButton
        label={`${t('undo', 'Undo')} (${mod}Z)`}
        disabled={!selection.canUndo}
        onClick={() => editor?.undo.undo()}
      >
        <Undo2 className="size-4" />
      </ToolButton>
      <ToolButton
        label={`${t('redo', 'Redo')} (${isMac ? '⇧⌘Z' : 'Ctrl+Y'})`}
        disabled={!selection.canRedo}
        onClick={() => editor?.undo.redo()}
      >
        <Redo2 className="size-4" />
      </ToolButton>
      <span className="mx-1.5 h-5 w-px bg-border" />
      <ToolButton label={t('zoomOut', 'Zoom out')} onClick={() => graph && zoomAt(graph, 1 / 1.2)}>
        <ZoomOut className="size-4" />
      </ToolButton>
      <button
        type="button"
        title={t('actualSize', 'Actual size')}
        className="w-12 rounded-md py-1 text-center text-xs tabular-nums text-muted-foreground hover:bg-accent hover:text-foreground"
        onClick={() => graph && zoomAt(graph, 1 / selection.scale)}
      >
        {Math.round(selection.scale * 100)}%
      </button>
      <ToolButton label={t('zoomIn', 'Zoom in')} onClick={() => graph && zoomAt(graph, 1.2)}>
        <ZoomIn className="size-4" />
      </ToolButton>
      <ToolButton
        label={`${t('fit', 'Fit to screen')} (${isMac ? '⇧1' : 'Shift+1'})`}
        onClick={() => graph && fitDiagram(graph)}
      >
        <Maximize className="size-4" />
      </ToolButton>
      <span className="mx-1.5 h-5 w-px bg-border" />
      <ToolButton
        label={`${t('duplicate', 'Duplicate')} (${mod}D)`}
        disabled={none}
        onClick={() => graph && duplicateSelection(graph)}
      >
        <Copy className="size-4" />
      </ToolButton>
      <ToolButton
        label={t('delete', 'Delete')}
        disabled={none}
        onClick={() => graph && deleteSelection(graph)}
      >
        <Trash2 className="size-4" />
      </ToolButton>
      <span className="mx-1.5 h-5 w-px bg-border" />
      <ProjectPageDiagramMenus editor={editor} title={title} />
      <span className="ml-auto hidden truncate pl-3 text-xs text-muted-foreground 2xl:inline">
        {t('hint', 'Double-click to add a shape. Drag from the middle of a shape to connect.')}
      </span>
    </div>
  )
}
