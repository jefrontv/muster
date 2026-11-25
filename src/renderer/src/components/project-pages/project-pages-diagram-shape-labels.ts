// Palette names in the UI language; DIAGRAM_SHAPES keeps the English names agents match on.
import { translate } from '@/i18n/i18n'
import { createLocalizedCatalog } from '@/i18n/localized-catalog'
import type { DiagramShape } from './project-pages-diagram-styles'

const diagramShapeLabels = createLocalizedCatalog(
  (): Record<string, string> => ({
    rect: translate('auto.components.projectPages.diagram.shape.rect', 'Rectangle'),
    rounded: translate('auto.components.projectPages.diagram.shape.rounded', 'Rounded'),
    ellipse: translate('auto.components.projectPages.diagram.shape.ellipse', 'Ellipse'),
    circle: translate('auto.components.projectPages.diagram.shape.circle', 'Circle'),
    rhombus: translate('auto.components.projectPages.diagram.shape.rhombus', 'Decision'),
    triangle: translate('auto.components.projectPages.diagram.shape.triangle', 'Triangle'),
    hexagon: translate('auto.components.projectPages.diagram.shape.hexagon', 'Hexagon'),
    cylinder: translate('auto.components.projectPages.diagram.shape.cylinder', 'Database'),
    cloud: translate('auto.components.projectPages.diagram.shape.cloud', 'Cloud'),
    actor: translate('auto.components.projectPages.diagram.shape.actor', 'Person'),
    note: translate('auto.components.projectPages.diagram.shape.note', 'Note'),
    text: translate('auto.components.projectPages.diagram.shape.text', 'Text'),
    container: translate('auto.components.projectPages.diagram.shape.container', 'Container'),
    start: translate('auto.components.projectPages.diagram.shape.start', 'Start'),
    end: translate('auto.components.projectPages.diagram.shape.end', 'End')
  })
)

export function diagramShapeLabel(shape: DiagramShape): string {
  return diagramShapeLabels()[shape.id] ?? shape.label
}
