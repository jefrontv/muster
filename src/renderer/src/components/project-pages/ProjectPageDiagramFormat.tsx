// Right-hand format panel for the selection: colours, text, line, connector shape, and order.
import type { Cell, Graph } from '@maxgraph/core'
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ArrowLeft,
  ArrowRight,
  Bold,
  BringToFront,
  CornerDownRight,
  Italic,
  Minus,
  MoveRight,
  Plus,
  SendToBack,
  Spline,
  Underline
} from 'lucide-react'
import type React from 'react'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import { patchSelectionStyle, selectionStyle } from './project-pages-diagram-actions'
import { DIAGRAM_COLOR_PRESETS } from './project-pages-diagram-styles'

const t = (key: string, fallback: string): string =>
  translate(`auto.components.projectPages.diagram.${key}`, fallback)

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2 border-b border-border px-3 py-3">
      <h3 className="text-xs font-medium text-muted-foreground">{title}</h3>
      {children}
    </section>
  )
}

function Tool(props: {
  label: string
  active?: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <Button
      variant={props.active ? 'secondary' : 'ghost'}
      size="icon-sm"
      aria-label={props.label}
      aria-pressed={props.active}
      title={props.label}
      onClick={props.onClick}
    >
      {props.children}
    </Button>
  )
}

function Swatches({ edges, graph }: { edges: boolean; graph: Graph }) {
  const reset = edges
    ? { strokeColor: undefined }
    : { fillColor: undefined, strokeColor: undefined, fontColor: undefined }
  return (
    <div className="flex flex-wrap gap-1.5">
      <button
        type="button"
        title={t('themeColour', 'Theme colour')}
        className="size-6 rounded-full border border-border bg-[linear-gradient(135deg,transparent_45%,var(--muted-foreground)_45%,var(--muted-foreground)_55%,transparent_55%)]"
        onClick={() => patchSelectionStyle(graph, reset)}
      />
      {DIAGRAM_COLOR_PRESETS.map((preset) => (
        <button
          key={preset.id}
          type="button"
          title={preset.id}
          className="size-6 rounded-full border-2"
          style={{ background: preset.fillColor, borderColor: preset.strokeColor }}
          onClick={() =>
            patchSelectionStyle(
              graph,
              edges
                ? { strokeColor: preset.strokeColor }
                : {
                    fillColor: preset.fillColor,
                    strokeColor: preset.strokeColor,
                    fontColor: preset.fontColor
                  }
            )
          }
        />
      ))}
    </div>
  )
}

export function ProjectPageDiagramFormat({ graph, cells }: { graph: Graph; cells: Cell[] }) {
  const style = selectionStyle(graph)
  const edges = cells.every((cell) => cell.isEdge())
  const fontStyle = Number(style.fontStyle ?? 0)
  const fontSize = Number(style.fontSize ?? 12)
  const set = (patch: Parameters<typeof patchSelectionStyle>[1]): void =>
    patchSelectionStyle(graph, patch)
  const flag = (bit: number): void => graph.toggleCellStyleFlags('fontStyle', bit, cells)
  const curved = Boolean(style.curved)
  const straight = !curved && (style.edgeStyle === 'none' || !style.edgeStyle)

  return (
    <aside className="w-56 shrink-0 overflow-y-auto scrollbar-sleek border-l border-border text-sm">
      <Section title={edges ? t('lineColour', 'Line colour') : t('colour', 'Colour')}>
        <Swatches edges={edges} graph={graph} />
      </Section>
      {edges ? (
        <Section title={t('connector', 'Connector')}>
          <div className="flex gap-1">
            <Tool
              label={t('straight', 'Straight')}
              active={straight}
              onClick={() => set({ edgeStyle: 'none', curved: undefined })}
            >
              <MoveRight className="size-4" />
            </Tool>
            <Tool
              label={t('elbow', 'Elbow')}
              active={!straight && !curved}
              onClick={() => set({ edgeStyle: 'orthogonalEdgeStyle', curved: undefined })}
            >
              <CornerDownRight className="size-4" />
            </Tool>
            <Tool
              label={t('curved', 'Curved')}
              active={curved}
              onClick={() => set({ edgeStyle: 'orthogonalEdgeStyle', curved: 1 })}
            >
              <Spline className="size-4" />
            </Tool>
            <span className="mx-1 w-px bg-border" />
            <Tool
              label={t('startArrow', 'Arrow at start')}
              active={(style.startArrow ?? 'none') !== 'none'}
              onClick={() =>
                set({ startArrow: (style.startArrow ?? 'none') === 'none' ? 'classic' : 'none' })
              }
            >
              <ArrowLeft className="size-4" />
            </Tool>
            <Tool
              label={t('endArrow', 'Arrow at end')}
              active={(style.endArrow ?? 'none') !== 'none'}
              onClick={() =>
                set({ endArrow: (style.endArrow ?? 'none') === 'none' ? 'classic' : 'none' })
              }
            >
              <ArrowRight className="size-4" />
            </Tool>
          </div>
        </Section>
      ) : (
        <Section title={t('text', 'Text')}>
          <div className="flex items-center gap-1">
            <Tool label={t('bold', 'Bold')} active={(fontStyle & 1) !== 0} onClick={() => flag(1)}>
              <Bold className="size-4" />
            </Tool>
            <Tool
              label={t('italic', 'Italic')}
              active={(fontStyle & 2) !== 0}
              onClick={() => flag(2)}
            >
              <Italic className="size-4" />
            </Tool>
            <Tool
              label={t('underline', 'Underline')}
              active={(fontStyle & 4) !== 0}
              onClick={() => flag(4)}
            >
              <Underline className="size-4" />
            </Tool>
            <span className="mx-1 h-5 w-px bg-border" />
            <Tool
              label={t('smaller', 'Smaller text')}
              onClick={() => set({ fontSize: Math.max(6, fontSize - 1) })}
            >
              <Minus className="size-4" />
            </Tool>
            <span className="w-6 text-center text-xs tabular-nums">{fontSize}</span>
            <Tool
              label={t('larger', 'Larger text')}
              onClick={() => set({ fontSize: Math.min(96, fontSize + 1) })}
            >
              <Plus className="size-4" />
            </Tool>
          </div>
          <div className="flex gap-1">
            {(
              [
                ['left', AlignLeft],
                ['center', AlignCenter],
                ['right', AlignRight]
              ] as const
            ).map(([align, Icon]) => (
              <Tool
                key={align}
                label={t(`align.${align}`, `Align ${align}`)}
                active={(style.align ?? 'center') === align}
                onClick={() => set({ align })}
              >
                <Icon className="size-4" />
              </Tool>
            ))}
            <Tool
              label={t('rounded', 'Rounded corners')}
              active={Boolean(style.rounded)}
              onClick={() => set({ rounded: style.rounded ? undefined : 1 })}
            >
              <span className="size-3.5 rounded-[4px] border-[1.5px] border-current" />
            </Tool>
          </div>
        </Section>
      )}
      <Section title={t('line', 'Line')}>
        <div className="flex items-center gap-1">
          {[1, 2, 3].map((width) => (
            <Tool
              key={width}
              label={t(`width${width}`, `${width} px`)}
              active={Number(style.strokeWidth ?? 1) === width}
              onClick={() => set({ strokeWidth: width === 1 ? undefined : width })}
            >
              <span className="w-4 rounded-full bg-current" style={{ height: width + 0.5 }} />
            </Tool>
          ))}
          <Tool
            label={t('dashed', 'Dashed')}
            active={Boolean(style.dashed)}
            onClick={() => set({ dashed: style.dashed ? undefined : 1 })}
          >
            <span className="w-4 border-t-2 border-dashed border-current" />
          </Tool>
        </div>
      </Section>
      <Section title={t('arrange', 'Arrange')}>
        <div className="flex gap-1">
          <Tool
            label={t('toFront', 'Bring to front')}
            onClick={() => graph.orderCells(false, cells)}
          >
            <BringToFront className="size-4" />
          </Tool>
          <Tool label={t('toBack', 'Send to back')} onClick={() => graph.orderCells(true, cells)}>
            <SendToBack className="size-4" />
          </Tool>
        </div>
      </Section>
    </aside>
  )
}
