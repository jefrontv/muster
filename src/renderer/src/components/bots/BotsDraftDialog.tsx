// One dialog, two views of a draft: the comment being written and the ActiveCollab task it answers.
// Both views stay mounted so flipping to the task and back keeps unsaved text, caret and files.
import { SquareArrowOutUpRight } from 'lucide-react'
import type React from 'react'
import { useRef } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import type {
  BotsCommentDraft,
  BotsCommentDraftTask
} from '../../../../shared/bots-comment-draft-types'
import { ActiveCollabTaskWorkspace } from '../ActiveCollabTaskWorkspace'
import { BotsCommentDraftEditor, type BotsDraftEditorGuard } from './BotsCommentDraftEditor'

export type BotsDraftDialogView = 'comment' | 'task'

const VIEW_SHORTCUTS: Record<string, BotsDraftDialogView> = { '1': 'comment', '2': 'task' }

export function BotsDraftDialog({
  draft,
  task,
  taskTitle,
  view,
  onViewChange,
  onClose
}: {
  draft: BotsCommentDraft
  task: BotsCommentDraftTask | undefined
  taskTitle: string
  view: BotsDraftDialogView
  onViewChange: (view: BotsDraftDialogView) => void
  onClose: () => void
}): React.JSX.Element {
  const guard = useRef<BotsDraftEditorGuard>({ menuOpen: false, busy: false })
  const mod = navigator.userAgent.includes('Mac') ? '⌘' : 'Ctrl+'

  const close = (): void => {
    if (!guard.current.busy) {
      onClose()
    }
  }

  const openOnTasksPage = (): void => {
    const store = useAppStore.getState()
    store.requestActiveCollabTask({ projectId: draft.projectId, taskId: draft.taskId })
    store.openTaskPage()
    close()
  }

  const onKeyDown = (event: React.KeyboardEvent): void => {
    const isMac = navigator.userAgent.includes('Mac')
    const next = VIEW_SHORTCUTS[event.key]
    if (next && (isMac ? event.metaKey : event.ctrlKey) && !event.shiftKey && !event.altKey) {
      event.preventDefault()
      onViewChange(next)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : close())}>
      <DialogContent
        // minmax(0,1fr): a long truncated subtitle otherwise widens the grid past the dialog.
        // Fixed height so switching views never resizes the dialog.
        className="h-[min(85vh,760px)] grid-cols-[minmax(0,1fr)] grid-rows-[auto_minmax(0,1fr)] gap-3 sm:max-w-3xl"
        // Escape first closes an open @mention menu, not the whole dialog.
        onEscapeKeyDown={(event) =>
          view === 'comment' && guard.current.menuOpen ? event.preventDefault() : undefined
        }
        onKeyDown={onKeyDown}
      >
        <Tabs
          value={view}
          onValueChange={(next) => onViewChange(next as BotsDraftDialogView)}
          className="contents"
        >
          <DialogHeader className="min-w-0 gap-2 pr-8">
            <div className="flex min-w-0 items-center gap-3">
              <DialogTitle className="min-w-0 flex-1 truncate">
                {view === 'comment'
                  ? translate('auto.components.bots.commentDrafts.editTitle', 'Edit comment')
                  : taskTitle}
              </DialogTitle>
              {view === 'task' ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={translate(
                        'auto.components.bots.commentDrafts.openOnTasksPage',
                        'Open on Tasks page'
                      )}
                      onClick={openOnTasksPage}
                    >
                      <SquareArrowOutUpRight className="size-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    {translate(
                      'auto.components.bots.commentDrafts.openOnTasksPage',
                      'Open on Tasks page'
                    )}
                  </TooltipContent>
                </Tooltip>
              ) : null}
              <TabsList className="h-8 shrink-0">
                <TabsTrigger value="comment" title={`${mod}1`}>
                  {translate('auto.components.bots.commentDrafts.viewComment', 'Comment')}
                </TabsTrigger>
                <TabsTrigger value="task" title={`${mod}2`}>
                  {translate('auto.components.bots.commentDrafts.viewTask', 'Task')}
                </TabsTrigger>
              </TabsList>
            </div>
            <DialogDescription className="truncate">
              {[taskTitle, task?.projectName, draft.botName].filter(Boolean).join(' · ')}
            </DialogDescription>
          </DialogHeader>
          <TabsContent
            value="comment"
            forceMount
            className="flex min-h-0 flex-col data-[state=inactive]:hidden"
          >
            <BotsCommentDraftEditor draft={draft} task={task} guard={guard} onClose={onClose} />
          </TabsContent>
          <TabsContent
            value="task"
            forceMount
            // Negative margin lets the task pane run to the dialog's edges like it does in a pane.
            className="-mx-6 -mb-6 min-h-0 overflow-hidden border-t border-border data-[state=inactive]:hidden"
          >
            <ActiveCollabTaskWorkspace projectId={draft.projectId} taskId={draft.taskId} />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
