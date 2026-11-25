import { Globe, Terminal as TerminalIcon } from 'lucide-react'
import { getFileTypeIcon } from '@/lib/file-type-icons'
import { AgentIcon } from '@/lib/agent-catalog'
import type { TabDragItemData } from '../tab-group/useTabDragSplit'
import { getTabColorStyle } from './tab-colors'
import { stripLeadingAgentTitleDecoration } from '../../../../shared/agent-title-decoration'

// Why: a terminal tab running an agent leads with the provider glyph so the
// ghost matches the resting tab; plain terminals keep the generic icon.
function LeadingIcon({ drag }: { drag: TabDragItemData }): React.JSX.Element {
  if (drag.tabType === 'browser') {
    return <Globe className="h-3.5 w-3.5 shrink-0" />
  }
  if (drag.tabType === 'editor') {
    const FileIcon = getFileTypeIcon(drag.iconPath ?? drag.label)
    return <FileIcon className="h-3.5 w-3.5 shrink-0" />
  }
  if (drag.agent) {
    return <AgentIcon agent={drag.agent} size={14} />
  }
  return <TerminalIcon className="h-3.5 w-3.5 shrink-0" />
}

// Why: rendered inside dnd-kit's DragOverlay (a document-level portal), so
// the dragged tab stays visible under the cursor even when it leaves its
// source tab strip. The DragOverlay sizes its wrapper from the source
// element's rect; `h-full w-full` on this chip fills that wrapper so the
// ghost lines up with the cursor instead of rendering as a tiny pill in
// the wrapper's top-left.
export default function TabDragPreview({ drag }: { drag: TabDragItemData }): React.JSX.Element {
  return (
    <div className="pointer-events-none h-full w-full rounded-full bg-card-solid shadow-floating">
      <div
        className="flex size-full items-center gap-1 rounded-full bg-foreground/[0.1] px-2 text-xs text-foreground"
        style={getTabColorStyle(drag.color)}
      >
        <span className="grid size-4 shrink-0 place-items-center">
          <LeadingIcon drag={drag} />
        </span>
        <span className="min-w-0 flex-1 truncate">
          {/* Why: matches the resting tab, which drops the agent's own glyph next to the provider icon. */}
          {drag.agent ? stripLeadingAgentTitleDecoration(drag.label) : drag.label}
        </span>
      </div>
    </div>
  )
}
