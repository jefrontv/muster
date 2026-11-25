// Ask agent: a chat beside the pages, started in the project's folder with the page outline.
import { FilePlus2, MessageSquarePlus, X } from 'lucide-react'
import type React from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  LEFT_EDGE_RESIZE_HANDLE_CLASS_NAME,
  WORKTREE_SIDEBAR_RESIZE_HANDLE_LINE_CLASS_NAME
} from '@/components/sidebar/sidebar-resize-handle-style'
import { translate } from '@/i18n/i18n'
import { setChatThreadExtraBrief } from '@/lib/chat-thread-extra-brief'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/store'
import { buildProjectPagesAgentBrief } from '../../../../shared/project-pages-agent-brief'
import type { ProjectPageMeta } from '../../../../shared/project-pages-types'
import { ChatConnectorConfirmDialog } from '../chat-mode/ChatConnectorConfirmDialog'
import { ChatThreadView } from '../chat-mode/ChatThreadView'
import {
  readNativeChatDraftCache,
  writeNativeChatDraftCache
} from '../native-chat/native-chat-draft-cache'
import { pageTitle } from './project-pages-tree-model'
import { ProjectPagesAgentDraft } from './ProjectPagesAgentDraft'
import { useProjectPagesAgentPanelWidth } from './use-project-pages-agent-panel-width'
import { useProjectPagesAgentThread } from './use-project-pages-agent-thread'

type Props = {
  scopeKey: string
  pages: ProjectPageMeta[]
  openPage: ProjectPageMeta | null
  onClose: () => void
}

export function ProjectPagesAgentPanel({
  scopeKey,
  pages,
  openPage,
  onClose
}: Props): React.JSX.Element {
  const repoId = scopeKey.startsWith('repo:') ? scopeKey.slice('repo:'.length) : null
  const repoRow = useAppStore((s) => (repoId ? s.repos.find((r) => r.id === repoId) : undefined))
  const remote = Boolean(repoRow?.connectionId)
  const repo = useMemo(
    () => (repoRow && !remote ? { path: repoRow.path, displayName: repoRow.displayName } : null),
    [repoRow, remote]
  )
  const { thread, workspace, error, starting, start, startNew } = useProjectPagesAgentThread(
    scopeKey,
    repo
  )
  const [draft, setDraft] = useState('')
  useEffect(() => setDraft(''), [scopeKey])
  const { containerRef, isResizing, separatorProps } = useProjectPagesAgentPanelWidth()
  const [mountKey, setMountKey] = useState(0)
  // The composer saves its draft when it unmounts, so the prefill is written between views.
  const [pendingDraft, setPendingDraft] = useState<string | null>(null)
  const latest = useRef({ pages, openPage })
  latest.current = { pages, openPage }

  useEffect(() => {
    if (!thread || !repo) {
      return undefined
    }
    setChatThreadExtraBrief(thread.id, () =>
      buildProjectPagesAgentBrief({ projectName: repo.displayName, ...latest.current })
    )
    return () => setChatThreadExtraBrief(thread.id, null)
  }, [thread, repo])

  // Puts a reference to the open page into the composer, keeping what was typed.
  function addOpenPage(): void {
    if (!openPage) {
      return
    }
    const reference = `the page "${pageTitle(openPage)}" (id ${openPage.id})`
    const withReference = (typed: string): string =>
      typed ? `${typed} ${reference} ` : `About ${reference}: `
    if (!thread) {
      setDraft((typed) => withReference(typed.trimEnd()))
      return
    }
    setPendingDraft(withReference(readNativeChatDraftCache(`chat-thread:${thread.id}`).trimEnd()))
  }

  function sendDraft(): void {
    void start(draft).then(() => setDraft(''))
  }

  useEffect(() => {
    if (pendingDraft === null || !thread) {
      return
    }
    writeNativeChatDraftCache(`chat-thread:${thread.id}`, pendingDraft)
    setPendingDraft(null)
    setMountKey((k) => k + 1)
  }, [pendingDraft, thread])

  const notice = remote
    ? translate(
        'auto.components.projectPages.agentRemote',
        'Ask agent runs on this computer, so it is not available for SSH projects yet.'
      )
    : !repoRow
      ? translate(
          'auto.components.projectPages.agentNoRepo',
          'Ask agent needs a project folder. Folder groups are not supported yet.'
        )
      : error

  return (
    <aside
      ref={containerRef}
      className="relative flex min-w-0 shrink-0 flex-col border-l border-border bg-background"
    >
      <div {...separatorProps} className={LEFT_EDGE_RESIZE_HANDLE_CLASS_NAME}>
        <div
          className={cn(
            WORKTREE_SIDEBAR_RESIZE_HANDLE_LINE_CLASS_NAME,
            'group-focus-visible:bg-ring',
            isResizing && 'bg-ring'
          )}
        />
      </div>
      <div className="flex h-10 shrink-0 items-center gap-1 border-b border-border px-3">
        <span className="flex-1 truncate text-sm font-medium text-foreground">
          {translate('auto.components.projectPages.askAgent', 'Ask agent')}
        </span>
        <Button
          variant="ghost"
          size="icon-sm"
          disabled={!openPage || starting}
          aria-label={translate('auto.components.projectPages.addPageToChat', 'Add this page')}
          title={translate('auto.components.projectPages.addPageToChat', 'Add this page')}
          onClick={addOpenPage}
        >
          <FilePlus2 className="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          disabled={!thread}
          aria-label={translate('auto.components.projectPages.newAgentChat', 'New chat')}
          title={translate('auto.components.projectPages.newAgentChat', 'New chat')}
          onClick={startNew}
        >
          <MessageSquarePlus className="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={translate('auto.components.projectPages.closeAgent', 'Close')}
          onClick={onClose}
        >
          <X className="size-4" />
        </Button>
      </div>
      {notice ? (
        <p className="p-4 text-sm text-muted-foreground">{notice}</p>
      ) : thread && pendingDraft === null ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <ChatThreadView key={`${thread.id}:${mountKey}`} thread={thread} workspace={workspace} />
        </div>
      ) : thread || starting ? (
        <p className="p-4 text-sm text-muted-foreground">
          {translate('auto.components.projectPages.agentStarting', 'Starting a chat…')}
        </p>
      ) : (
        <ProjectPagesAgentDraft
          value={draft}
          onChange={setDraft}
          onSend={sendDraft}
          sending={starting}
        />
      )}
      <ChatConnectorConfirmDialog />
    </aside>
  )
}
