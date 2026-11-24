// A toast when a coding agent queues a comment draft; bots already notify through their own page.
import { useEffect } from 'react'
import { toast } from 'sonner'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import { commentDraftAuthorLabel } from './comment-draft-author'
import { onCommentDraftsArrived, useCommentDraftsFeed } from './comment-drafts-feed'

export function openCommentDraftsTab(): void {
  const store = useAppStore.getState()
  store.setActiveView('terminal')
  store.setRightSidebarTab('comment-drafts')
  store.setRightSidebarOpen(true)
}

export function useAgentDraftArrivalToast(): void {
  // Subscribing keeps the feed live while the sidebar is closed.
  useCommentDraftsFeed()
  useEffect(
    () =>
      onCommentDraftsArrived((drafts) => {
        const fromAgents = drafts.filter((d) => d.agentSource)
        if (fromAgents.length === 0) {
          return
        }
        toast(
          translate('auto.components.commentDrafts.arrived', '{{value0}} drafted a comment', {
            value0: commentDraftAuthorLabel(fromAgents[0])
          }),
          {
            description: fromAgents[0].bodyText.slice(0, 120),
            action: {
              label: translate('auto.components.commentDrafts.review', 'Review'),
              onClick: openCommentDraftsTab
            }
          }
        )
      }),
    []
  )
}
