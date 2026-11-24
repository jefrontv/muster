// A diagram page: title, toolbar, shape palette, canvas with minimap, and the format panel.
import {
  Clipboard,
  InternalEvent,
  Outline,
  type EventObject,
  type EventSource
} from '@maxgraph/core'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { translate } from '@/i18n/i18n'
import { diagramOutlineText } from '../../../../shared/project-pages-diagram-outline'
import { writeDiagramXml } from '../../../../shared/project-pages-diagram-xml'
import type { ProjectPageMeta } from '../../../../shared/project-pages-types'
import type { AutosaveState } from './project-pages-autosave'
import { insertShape } from './project-pages-diagram-actions'
import { createDiagramEditor, fitDiagram, type DiagramEditor } from './project-pages-diagram-graph'
import { handleDiagramKey } from './project-pages-diagram-keys'
import { loadDiagramXml, snapshotDiagram } from './project-pages-diagram-model'
import { DIAGRAM_SHAPES } from './project-pages-diagram-styles'
import { ProjectPageDiagramFormat } from './ProjectPageDiagramFormat'
import { ProjectPageDiagramPalette } from './ProjectPageDiagramPalette'
import { ProjectPageDiagramQuickConnect } from './ProjectPageDiagramQuickConnect'
import { ProjectPageDiagramToolbar } from './ProjectPageDiagramToolbar'
import { useProjectPageDiagram, type DiagramContent } from './use-project-page-diagram'
import { useProjectPageDiagramLinks } from './use-project-page-diagram-links'
import { useProjectPageDiagramSelection } from './use-project-page-diagram-selection'
import { insertMermaidText } from './ProjectPageDiagramMermaidDialog'

function diagramContent(editor: DiagramEditor): DiagramContent {
  const cells = snapshotDiagram(editor.graph)
  return { xml: writeDiagramXml(cells), outline: diagramOutlineText(cells) }
}

/** Dot grid that pans and zooms with the canvas; coarser when zoomed far out. */
function gridStyle(scale: number, translate: { x: number; y: number }): React.CSSProperties {
  const fine = 10 * scale
  const step = fine < 8 ? fine * 5 : fine
  return {
    backgroundImage:
      'radial-gradient(circle, color-mix(in srgb, var(--foreground) 16%, transparent) 1px, transparent 1.2px)',
    backgroundSize: `${step}px ${step}px`,
    backgroundPosition: `${translate.x * scale}px ${translate.y * scale}px`
  }
}

export function ProjectPageDiagramView({
  scopeKey,
  meta,
  autoFocusTitle,
  pages,
  onOpenPage,
  onSaveState
}: {
  scopeKey: string
  meta: ProjectPageMeta
  autoFocusTitle: boolean
  pages: ProjectPageMeta[]
  onOpenPage: (pageId: string) => void
  onSaveState: (state: AutosaveState) => void
}) {
  const { loaded, error, schedule, rename } = useProjectPageDiagram(scopeKey, meta, onSaveState)
  const canvasRef = useRef<HTMLDivElement>(null)
  const minimapRef = useRef<HTMLDivElement>(null)
  const [editor, setEditor] = useState<DiagramEditor | null>(null)
  const [title, setTitle] = useState(meta.title)
  const applying = useRef(false)
  const fitted = useRef(false)
  const scheduleRef = useRef(schedule)
  scheduleRef.current = schedule
  const selection = useProjectPageDiagramSelection(editor?.graph ?? null, editor?.undo ?? null)
  const openLink = useProjectPageDiagramLinks(editor, onOpenPage)

  useEffect(() => {
    const canvas = canvasRef.current
    const minimap = minimapRef.current
    if (!canvas || !minimap) {
      return
    }
    const made: DiagramEditor = createDiagramEditor(canvas, () => {
      if (!applying.current) {
        scheduleRef.current(() => diagramContent(made))
      }
    })
    // Double-click on empty canvas adds a rounded box there and starts typing its label.
    made.graph.addListener(InternalEvent.DOUBLE_CLICK, (_sender: EventSource, evt: EventObject) => {
      const event = evt.getProperty('event') as MouseEvent | undefined
      if (evt.getProperty('cell') || !event) {
        return
      }
      const point = made.graph.getPointForEvent(event)
      const shape = DIAGRAM_SHAPES.find((s) => s.id === 'rounded')!
      made.graph.startEditingAtCell(insertShape(made.graph, shape, point.x, point.y))
    })
    const outline = new Outline(made.graph, minimap)
    setEditor(made)
    return () => {
      outline.destroy()
      made.destroy()
      setEditor(null)
    }
  }, [])

  useEffect(() => {
    if (!editor || !loaded) {
      return
    }
    applying.current = true
    try {
      loadDiagramXml(editor.graph, loaded.xml)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    } finally {
      applying.current = false
    }
    editor.undo.clear()
    if (!fitted.current) {
      fitted.current = true
      fitDiagram(editor.graph)
    }
  }, [editor, loaded])

  const commitTitle = (): void => {
    if (title.trim() !== meta.title) {
      void rename(title.trim())
    }
  }
  const lone = selection.cells.length === 1 ? selection.cells[0] : null

  return (
    <div className="project-page-diagram flex min-h-0 flex-1 flex-col">
      <input
        value={title}
        autoFocus={autoFocusTitle}
        aria-label={translate('auto.components.projectPages.titleLabel', 'Page title')}
        placeholder={translate('auto.components.projectPages.untitled', 'Untitled')}
        className="w-full bg-transparent px-6 pt-6 pb-2 text-2xl font-semibold text-foreground outline-none placeholder:text-muted-foreground/60"
        onChange={(event) => setTitle(event.target.value)}
        onBlur={commitTitle}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault()
            commitTitle()
            canvasRef.current?.focus()
          }
        }}
      />
      <ProjectPageDiagramToolbar editor={editor} selection={selection} title={title} />
      <div className="flex min-h-0 flex-1 border-t border-border">
        <ProjectPageDiagramPalette graph={editor?.graph ?? null} />
        <div className="relative min-w-0 flex-1 overflow-hidden">
          <div
            ref={canvasRef}
            tabIndex={0}
            aria-label={translate('auto.components.projectPages.diagram.canvas', 'Diagram canvas')}
            className="absolute inset-0 overflow-hidden outline-none"
            style={gridStyle(selection.scale, selection.translate)}
            onMouseDown={() => canvasRef.current?.focus({ preventScroll: true })}
            onKeyDown={(event) => {
              if (editor && handleDiagramKey(editor, event.nativeEvent)) {
                event.preventDefault()
              }
            }}
            onPaste={(event) => {
              if (!editor || editor.graph.isEditing()) {
                return
              }
              event.preventDefault()
              // Mermaid text from anywhere becomes shapes; otherwise paste copied shapes.
              const text = event.clipboardData.getData('text/plain')
              if (/^\s*(graph|flowchart)\b/i.test(text)) {
                const problem = insertMermaidText(editor.graph, text)
                if (problem) {
                  toast.error(problem)
                }
              } else {
                Clipboard.paste(editor.graph)
              }
            }}
          />
          {editor && lone && selection.box && !selection.moving ? (
            <ProjectPageDiagramQuickConnect graph={editor.graph} cell={lone} box={selection.box} />
          ) : null}
          <div
            ref={minimapRef}
            className="absolute right-3 bottom-3 h-28 w-44 overflow-hidden rounded-md border border-border bg-background/90 shadow-xs"
          />
          {error ? (
            <p className="absolute top-3 left-3 rounded-md bg-background px-2 py-1 text-xs text-destructive">
              {error}
            </p>
          ) : null}
        </div>
        {editor && selection.cells.length ? (
          <ProjectPageDiagramFormat
            graph={editor.graph}
            cells={selection.cells}
            pages={pages}
            onOpenLink={openLink}
          />
        ) : null}
      </div>
    </div>
  )
}
