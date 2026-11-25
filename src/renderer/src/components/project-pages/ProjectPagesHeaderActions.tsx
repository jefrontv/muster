// Page header actions: map, go to page, ask agent, transfer, comment and history.
import {
  Highlighter,
  History,
  MessageSquarePlus,
  MessageSquareText,
  Search,
  Waypoints
} from 'lucide-react'
import type React from 'react'
import { translate } from '@/i18n/i18n'
import type { ProjectPageMeta } from '../../../../shared/project-pages-types'
import { PageTooltipButton } from './PageTooltipButton'
import { ProjectPageHistoryDialog } from './ProjectPageHistoryDialog'
import { ProjectPagesQuickSwitcher } from './ProjectPagesQuickSwitcher'
import { ProjectPagesTransferMenu } from './ProjectPagesTransferMenu'
import { requestWholePageComment } from './use-page-comments'
import { togglePageAnnotateMode, usePageAnnotateMode } from './page-annotate-mode'

type Toggle = [boolean, React.Dispatch<React.SetStateAction<boolean>>]

export function ProjectPagesHeaderActions({
  scopeKey,
  projectName,
  pages,
  meta,
  isMac,
  map: [mapOpen, setMapOpen],
  switcher: [switcherOpen, setSwitcherOpen],
  agent: [agentOpen, setAgentOpen],
  history: [historyOpen, setHistoryOpen],
  onPick
}: {
  scopeKey: string | null
  projectName: string
  pages: ProjectPageMeta[]
  meta: ProjectPageMeta | undefined
  isMac: boolean
  map: Toggle
  switcher: Toggle
  agent: Toggle
  history: Toggle
  onPick: (pageId: string) => void
}): React.JSX.Element {
  const annotate = usePageAnnotateMode()
  return (
    <>
      {scopeKey ? (
        <>
          <PageTooltipButton
            variant={mapOpen ? 'secondary' : 'ghost'}
            size="icon-sm"
            className="shrink-0 text-muted-foreground"
            label={translate('auto.components.projectPages.map.open', 'Map')}
            aria-pressed={mapOpen}
            onClick={() => setMapOpen((open) => !open)}
          >
            <Waypoints className="size-4" />
          </PageTooltipButton>
          <PageTooltipButton
            variant="ghost"
            size="icon-sm"
            className="shrink-0 text-muted-foreground"
            label={translate('auto.components.projectPages.switcher', 'Go to page')}
            shortcut={isMac ? '⌘P' : 'Ctrl+P'}
            onClick={() => setSwitcherOpen(true)}
          >
            <Search className="size-4" />
          </PageTooltipButton>
          <PageTooltipButton
            variant={agentOpen ? 'secondary' : 'ghost'}
            size="icon-sm"
            className="shrink-0 text-muted-foreground"
            label={translate('auto.components.projectPages.askAgent', 'Ask agent')}
            aria-pressed={agentOpen}
            onClick={() => setAgentOpen((open) => !open)}
          >
            <MessageSquareText className="size-4" />
          </PageTooltipButton>
          <ProjectPagesTransferMenu scopeKey={scopeKey} projectName={projectName} />
          <ProjectPagesQuickSwitcher
            scopeKey={scopeKey}
            pages={pages}
            open={switcherOpen}
            onOpenChange={setSwitcherOpen}
            onPick={onPick}
          />
        </>
      ) : null}
      {meta && !meta.diagram ? (
        <>
          <PageTooltipButton
            variant={annotate ? 'secondary' : 'ghost'}
            size="icon-sm"
            className={annotate ? 'shrink-0 text-foreground' : 'shrink-0 text-muted-foreground'}
            label={translate('auto.components.projectPages.annotate', 'Annotate')}
            shortcut={isMac ? '⌘⇧A' : 'Ctrl+Shift+A'}
            aria-pressed={annotate}
            onClick={togglePageAnnotateMode}
          >
            <Highlighter className="size-4" />
          </PageTooltipButton>
          <PageTooltipButton
            variant="ghost"
            size="icon-sm"
            className="shrink-0 text-muted-foreground"
            label={translate(
              'auto.components.projectPages.comments.wholePageAction',
              'Comment on page'
            )}
            onClick={() => requestWholePageComment(meta.id)}
          >
            <MessageSquarePlus className="size-4" />
          </PageTooltipButton>
        </>
      ) : null}
      {meta && scopeKey ? (
        <>
          <PageTooltipButton
            variant="ghost"
            size="icon-sm"
            className="shrink-0 text-muted-foreground"
            label={translate('auto.components.projectPages.history', 'Page history')}
            onClick={() => setHistoryOpen(true)}
          >
            <History className="size-4" />
          </PageTooltipButton>
          <ProjectPageHistoryDialog
            scopeKey={scopeKey}
            page={meta}
            open={historyOpen}
            onOpenChange={setHistoryOpen}
          />
        </>
      ) : null}
    </>
  )
}
