// Page header actions: map, go to page, ask agent, transfer, comment and history.
import { History, MessageSquarePlus, MessageSquareText, Search, Waypoints } from 'lucide-react'
import type React from 'react'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import type { ProjectPageMeta } from '../../../../shared/project-pages-types'
import { ProjectPageHistoryDialog } from './ProjectPageHistoryDialog'
import { ProjectPagesQuickSwitcher } from './ProjectPagesQuickSwitcher'
import { ProjectPagesTransferMenu } from './ProjectPagesTransferMenu'
import { requestWholePageComment } from './use-page-comments'

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
  return (
    <>
      {scopeKey ? (
        <>
          <Button
            variant={mapOpen ? 'secondary' : 'ghost'}
            size="icon-sm"
            className="shrink-0 text-muted-foreground"
            aria-label={translate('auto.components.projectPages.map.open', 'Map')}
            aria-pressed={mapOpen}
            title={translate('auto.components.projectPages.map.open', 'Map')}
            onClick={() => setMapOpen((open) => !open)}
          >
            <Waypoints className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            className="shrink-0 text-muted-foreground"
            aria-label={translate('auto.components.projectPages.switcher', 'Go to page')}
            title={`${translate('auto.components.projectPages.switcher', 'Go to page')} (${isMac ? '⌘P' : 'Ctrl+P'})`}
            onClick={() => setSwitcherOpen(true)}
          >
            <Search className="size-4" />
          </Button>
          <Button
            variant={agentOpen ? 'secondary' : 'ghost'}
            size="icon-sm"
            className="shrink-0 text-muted-foreground"
            aria-label={translate('auto.components.projectPages.askAgent', 'Ask agent')}
            aria-pressed={agentOpen}
            title={translate('auto.components.projectPages.askAgent', 'Ask agent')}
            onClick={() => setAgentOpen((open) => !open)}
          >
            <MessageSquareText className="size-4" />
          </Button>
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
        <Button
          variant="ghost"
          size="icon-sm"
          className="shrink-0 text-muted-foreground"
          aria-label={translate(
            'auto.components.projectPages.comments.wholePageAction',
            'Comment on page'
          )}
          title={translate(
            'auto.components.projectPages.comments.wholePageAction',
            'Comment on page'
          )}
          onClick={() => requestWholePageComment(meta.id)}
        >
          <MessageSquarePlus className="size-4" />
        </Button>
      ) : null}
      {meta && scopeKey ? (
        <>
          <Button
            variant="ghost"
            size="icon-sm"
            className="shrink-0 text-muted-foreground"
            aria-label={translate('auto.components.projectPages.history', 'Page history')}
            title={translate('auto.components.projectPages.history', 'Page history')}
            onClick={() => setHistoryOpen(true)}
          >
            <History className="size-4" />
          </Button>
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
