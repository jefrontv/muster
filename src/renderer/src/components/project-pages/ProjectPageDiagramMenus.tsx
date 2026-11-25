// Toolbar menus: auto-layout, colour themes, Mermaid import, and export.
import { Download, Network, Palette, Sparkles } from 'lucide-react'
import type React from 'react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { translate } from '@/i18n/i18n'
import { createLocalizedCatalog } from '@/i18n/localized-catalog'
import { writeDiagramXml } from '../../../../shared/project-pages-diagram-xml'
import { exportDiagram, type DiagramExportFormat } from './project-pages-diagram-export'
import type { DiagramEditor } from './project-pages-diagram-graph'
import { diagramLayouts, runLayout } from './project-pages-diagram-layout'
import { snapshotDiagram } from './project-pages-diagram-model'
import { applyColourTheme, diagramThemes } from './project-pages-diagram-themes'
import { ProjectPageDiagramMermaidDialog } from './ProjectPageDiagramMermaidDialog'

const t = (key: string, fallback: string): string =>
  translate(`auto.components.projectPages.diagram.${key}`, fallback)

const exportFormats = createLocalizedCatalog((): { id: DiagramExportFormat; label: string }[] => [
  {
    id: 'svg',
    label: translate('auto.components.projectPages.diagram.export.svg', 'SVG (opens in draw.io)')
  },
  { id: 'png', label: 'PNG' },
  {
    id: 'png2x',
    label: translate('auto.components.projectPages.diagram.export.png2x', 'PNG at 2x')
  },
  { id: 'pdf', label: 'PDF' }
])

function Menu(props: { label: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="h-7 gap-1.5 px-2 text-xs" title={props.label}>
          {props.icon}
          {props.label}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">{props.children}</DropdownMenuContent>
    </DropdownMenu>
  )
}

export function ProjectPageDiagramMenus({
  editor,
  title
}: {
  editor: DiagramEditor | null
  title: string
}) {
  const [mermaidOpen, setMermaidOpen] = useState(false)
  const graph = editor?.graph
  if (!graph) {
    return null
  }
  const scope = graph.getSelectionCount()
    ? t('selection', 'Applies to the selection')
    : t('all', 'Applies to everything')
  return (
    <>
      <Menu label={t('layout', 'Layout')} icon={<Network className="size-3.5" />}>
        {diagramLayouts().map((layout) => (
          <DropdownMenuItem key={layout.id} onSelect={() => runLayout(graph, layout.id)}>
            {layout.label}
          </DropdownMenuItem>
        ))}
      </Menu>
      <Menu label={t('theme', 'Theme')} icon={<Palette className="size-3.5" />}>
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
          {scope}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {diagramThemes().map((theme) => (
          <DropdownMenuItem key={theme.id} onSelect={() => applyColourTheme(graph, theme)}>
            {theme.label}
          </DropdownMenuItem>
        ))}
      </Menu>
      <Button
        variant="ghost"
        size="sm"
        className="h-7 gap-1.5 px-2 text-xs"
        onClick={() => setMermaidOpen(true)}
      >
        <Sparkles className="size-3.5" />
        {t('fromMermaid', 'From Mermaid')}
      </Button>
      <Menu label={t('export', 'Export')} icon={<Download className="size-3.5" />}>
        {exportFormats().map((format) => (
          <DropdownMenuItem
            key={format.id}
            onSelect={() =>
              void exportDiagram(graph, format.id, title, writeDiagramXml(snapshotDiagram(graph)))
            }
          >
            {t(`export.${format.id}`, format.label)}
          </DropdownMenuItem>
        ))}
      </Menu>
      <ProjectPageDiagramMermaidDialog
        graph={graph}
        open={mermaidOpen}
        onOpenChange={setMermaidOpen}
      />
    </>
  )
}
