// One dialog, two views of a draft: the comment being written and the ActiveCollab task it answers.
// Both views stay mounted so flipping to the task and back keeps unsaved text, caret and files.
import { SquareArrowOutUpRight } from 'lucide-react'
import type React from 'react'
import { useRef } from 'react'
import { cn } from '@/lib/utils'
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
import { commentDraftAuthorLabel } from '../comment-drafts/comment-draft-author'

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
        // The comment view hugs its content; only the task view takes the tall fixed height.
        // Pinned to the top, not centred, so a height change grows downward and the header never moves.
        className={cn(
          'top-[7.5vh] max-h-[85vh] translate-y-0 grid-cols-[minmax(0,1fr)] grid-rows-[auto_minmax(0,1fr)] gap-3 transition-[height] duration-200 ease-out [interpolate-size:allow-keywords] sm:max-w-3xl',
          view === 'task' ? 'h-[min(85vh,760px)]' : 'h-auto'
        )}
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
              <DialogTitle className="min-w-0 flex-1 truncate">{taskTitle}</DialogTitle>
              {/* Kept mounted in both views so the title and toggle never shift sideways. */}
              <div
                className={view === 'task' ? undefined : 'invisible'}
                aria-hidden={view !== 'task'}
              >
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
                      tabIndex={view === 'task' ? undefined : -1}
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
              </div>
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
              {[
                task?.taskNumber ? `#${task.taskNumber}` : null,
                task?.projectName,
                translate('auto.components.commentDrafts.draftedBy', 'Drafted by {{value0}}', {
                  value0: commentDraftAuthorLabel(draft)
                })
              ]
                .filter(Boolean)
                .join(' · ')}
            </DialogDescription>
          </DialogHeader>
          <TabsContent
            value="comment"
            forceMount
            className="flex min-h-0 flex-col data-[state=active]:animate-in data-[state=active]:fade-in-0 data-[state=active]:duration-150 data-[state=inactive]:hidden"
          >
            <BotsCommentDraftEditor draft={draft} task={task} guard={guard} onClose={onClose} />
          </TabsContent>
          <TabsContent
            value="task"
            forceMount
            // Negative margin lets the task pane run to the dialog's edges like it does in a pane.
            className="-mx-6 -mb-6 min-h-0 overflow-hidden border-t border-border data-[state=active]:animate-in data-[state=active]:fade-in-0 data-[state=active]:duration-150 data-[state=inactive]:hidden"
          >
            <ActiveCollabTaskWorkspace projectId={draft.projectId} taskId={draft.taskId} />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
