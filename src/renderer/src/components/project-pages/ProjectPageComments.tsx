// The comments column on the right of a page: open threads in page order, then text that changed.
import { MessageSquare, MessageSquarePlus, X } from 'lucide-react'
import type React from 'react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'
import type { PageCommentThread } from '../../../../shared/project-pages-comment-types'
import { ProjectPageCommentCard } from './ProjectPageCommentCard'
import type { PageCommentController } from './use-page-comment-controller'

function SectionLabel({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <p className="px-1 pt-2 text-[11px] font-semibold tracking-[0.05em] text-muted-foreground uppercase">
      {children}
    </p>
  )
}

function group(controller: PageCommentController) {
  const { threads, layout } = controller
  const rank = new Map(layout.order.map((id, i) => [id, i]))
  const missing = new Set(layout.missing)
  const open = threads.filter((t) => t.status === 'open')
  return {
    wholePage: open.filter((t) => !t.anchor),
    placed: open
      .filter((t) => t.anchor && !missing.has(t.id))
      .sort((a, b) => (rank.get(a.id) ?? 1e9) - (rank.get(b.id) ?? 1e9)),
    changed: open.filter((t) => t.anchor && missing.has(t.id)),
    resolved: threads.filter((t) => t.status === 'resolved')
  }
}

export function ProjectPageCommentsToggle({
  controller
}: {
  controller: PageCommentController
}): React.JSX.Element | null {
  const open = controller.threads.filter((t) => t.status === 'open').length
  if (!controller.collapsed || controller.threads.length === 0) {
    return null
  }
  return (
    <Button
      size="xs"
      variant="outline"
      className="absolute top-3 right-4 z-10 bg-background"
      onClick={() => controller.setCollapsed(false)}
    >
      <MessageSquare className="size-3.5" />
      {open}
    </Button>
  )
}

export function ProjectPageComments({
  controller,
  overlay
}: {
  controller: PageCommentController
  /** Narrow tabs float the column over the page instead of beside it. */
  overlay: boolean
}): React.JSX.Element | null {
  const [showResolved, setShowResolved] = useState(false)
  const { threads, actions } = controller
  if (controller.collapsed || threads.length === 0) {
    return null
  }
  const groups = group(controller)
  const card = (thread: PageCommentThread): React.JSX.Element => (
    <ProjectPageCommentCard
      key={thread.id}
      thread={thread}
      active={controller.activeId === thread.id}
      onActivate={() => controller.reveal(thread.id)}
      onReply={(body) => actions.reply(thread.id, body)}
      onSetStatus={(status) => void actions.setStatus(thread.id, status)}
      onDelete={() => void actions.remove(thread.id)}
    />
  )
  return (
    <aside
      aria-label={translate('auto.components.projectPages.comments.title', 'Comments')}
      className={cn(
        'flex w-72 shrink-0 flex-col border-l border-border bg-background',
        overlay && 'absolute inset-y-0 right-0 z-20 shadow-floating'
      )}
    >
      <div className="flex h-10 shrink-0 items-center gap-1 border-b border-border pr-1.5 pl-3">
        <span className="flex-1 text-[13px] font-medium">
          {translate('auto.components.projectPages.comments.title', 'Comments')}
        </span>
        <Button
          size="icon-xs"
          variant="ghost"
          className="text-muted-foreground"
          aria-label={translate('auto.components.projectPages.comments.new', 'Comment')}
          title={`${translate('auto.components.projectPages.comments.new', 'Comment')} (${controller.shortcutLabel})`}
          onClick={() => controller.startComment()}
        >
          <MessageSquarePlus className="size-3.5" />
        </Button>
        <Button
          size="icon-xs"
          variant="ghost"
          className="text-muted-foreground"
          aria-label={translate('auto.components.projectPages.comments.hide', 'Hide comments')}
          onClick={() => controller.setCollapsed(true)}
        >
          <X className="size-3.5" />
        </Button>
      </div>
      <div className="scrollbar-editor min-h-0 flex-1 space-y-2 overflow-auto p-2">
        {[...groups.wholePage, ...groups.placed].map(card)}
        {groups.changed.length > 0 ? (
          <>
            <SectionLabel>
              {translate('auto.components.projectPages.comments.textChanged', 'Text changed')}
            </SectionLabel>
            {groups.changed.map(card)}
          </>
        ) : null}
        {groups.resolved.length > 0 ? (
          <>
            <button
              type="button"
              className="px-1 pt-2 text-[11px] font-semibold tracking-[0.05em] text-muted-foreground uppercase hover:text-foreground"
              aria-expanded={showResolved}
              onClick={() => setShowResolved((value) => !value)}
            >
              {translate('auto.components.projectPages.comments.resolved', 'Resolved ({{count}})', {
                count: groups.resolved.length
              })}
            </button>
            {showResolved ? groups.resolved.map(card) : null}
          </>
        ) : null}
      </div>
    </aside>
  )
}
