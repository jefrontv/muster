// Ask agent: a chat beside the pages, started in the project's folder with the page outline.
import { FilePlus2, MessageSquarePlus, X } from 'lucide-react'
import type React from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import { setChatThreadExtraBrief } from '@/lib/chat-thread-extra-brief'
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
  const { thread, workspace, error, startNew } = useProjectPagesAgentThread(scopeKey, repo)
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
    if (!thread || !openPage) {
      return
    }
    const key = `chat-thread:${thread.id}`
    const typed = readNativeChatDraftCache(key).trimEnd()
    const reference = `the page "${pageTitle(openPage)}" (id ${openPage.id})`
    setPendingDraft(typed ? `${typed} ${reference} ` : `About ${reference}: `)
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
    <aside className="flex w-[420px] min-w-0 shrink-0 flex-col border-l border-border bg-background">
      <div className="flex h-10 shrink-0 items-center gap-1 border-b border-border px-3">
        <span className="flex-1 truncate text-sm font-medium text-foreground">
          {translate('auto.components.projectPages.askAgent', 'Ask agent')}
        </span>
        <Button
          variant="ghost"
          size="icon-sm"
          disabled={!thread || !openPage}
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
      ) : (
        <p className="p-4 text-sm text-muted-foreground">
          {translate('auto.components.projectPages.agentStarting', 'Starting a chat…')}
        </p>
      )}
      <ChatConnectorConfirmDialog />
    </aside>
  )
}
