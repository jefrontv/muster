// A toast when a coding agent queues a comment draft; bots already notify through their own page.
import { createElement, useEffect } from 'react'
import { MessageSquareText } from 'lucide-react'
import { toast } from 'sonner'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import { activateAndRevealWorktree } from '@/lib/worktree-activation'
import { readActiveCollabRepoProject } from '../../../../shared/activecollab-repo-project-binding'
import type { BotsCommentDraft } from '../../../../shared/bots-comment-draft-types'
import { ActionToast } from '@/components/toasts/ActionToast'
import { commentDraftAuthorLabel } from './comment-draft-author'
import { commentDraftWorktreeId } from './comment-draft-worktree'
import { onCommentDraftsArrived, useCommentDraftsFeed } from './comment-drafts-feed'

/** Opens the drafts tab, first switching to the project that shows `draft` when one does. */
export function openCommentDraftsTab(draft?: BotsCommentDraft): void {
  const store = useAppStore.getState()
  store.setActiveView('terminal')
  const worktreeId = draft
    ? commentDraftWorktreeId(
        draft,
        store.allWorktrees(),
        (repoId) => readActiveCollabRepoProject(store.settings, repoId),
        store.activeWorktreeId
      )
    : null
  if (worktreeId && worktreeId !== store.activeWorktreeId) {
    activateAndRevealWorktree(worktreeId)
  }
  // After activation, which restores the project's own sidebar tab.
  store.setRightSidebarTab('comment-drafts')
  store.setRightSidebarOpen(true)
}

/** One readable line: quote markers and line breaks from the comment body would show as "> >". */
export function draftPreviewLine(text: string): string {
  return text
    .replace(/^\s*>+\s?/gm, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export function useAgentDraftArrivalToast(): void {
  // Subscribing keeps the feed live while the sidebar is closed.
  useCommentDraftsFeed()
  useEffect(
    () =>
      onCommentDraftsArrived((drafts) => {
        const fromAgents = drafts.filter((d) => d.agentSource)
        const first = fromAgents[0]
        if (!first) {
          return
        }
        const meta = [
          translate('auto.components.commentDrafts.toastTask', 'Task #{{value0}}', {
            value0: first.taskId
          }),
          fromAgents.length > 1
            ? translate('auto.components.commentDrafts.toastMore', '+{{value0}} more', {
                value0: fromAgents.length - 1
              })
            : null
        ].filter((part): part is string => Boolean(part))
        toast.custom(
          (id) =>
            createElement(ActionToast, {
              toastId: id,
              icon: createElement(MessageSquareText, { className: 'size-4', 'aria-hidden': true }),
              eyebrow: translate(
                'auto.components.commentDrafts.arrived',
                '{{value0}} drafted a comment',
                {
                  value0: commentDraftAuthorLabel(first)
                }
              ),
              title: draftPreviewLine(first.bodyText),
              meta: meta.join(' · '),
              primaryLabel: translate('auto.components.commentDrafts.review', 'Review'),
              onPrimary: () => openCommentDraftsTab(first),
              secondaryLabel: translate('auto.components.commentDrafts.later', 'Later')
            }),
          { duration: 10_000 }
        )
      }),
    []
  )
}
