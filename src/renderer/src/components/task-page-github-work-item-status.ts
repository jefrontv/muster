import { translate } from '@/i18n/i18n'
import type { GitHubWorkItem } from '../../../shared/types'

export type GitHubWorkItemStatusItem = Pick<GitHubWorkItem, 'type' | 'state'>

export function getTaskPageGitHubWorkItemStateLabel(item: GitHubWorkItemStatusItem): string {
  if (item.type === 'pr') {
    if (item.state === 'merged') {
      return translate('auto.components.github.pr.merge.state.83ecdbb4a6', 'Merged')
    }
    if (item.state === 'draft') {
      return translate('auto.components.TaskPage.054bf695cc', 'Draft')
    }
    if (item.state === 'closed') {
      return translate('auto.components.TaskPage.d09bf34db7', 'Closed')
    }
    return translate('auto.components.TaskPage.606a85c774', 'Open')
  }

  return item.state === 'closed'
    ? translate('auto.components.TaskPage.d09bf34db7', 'Closed')
    : translate('auto.components.TaskPage.606a85c774', 'Open')
}

// Why: use the same muted pill tones as merge/check badges — light washes with
// readable foreground text in both themes. Draft stays neutral gray because
// it's a non-actionable meta state.
export function getTaskPageGitHubWorkItemStateTone(item: GitHubWorkItemStatusItem): string {
  if (item.type === 'pr') {
    if (item.state === 'merged') {
      return 'border-purple-500/30 bg-purple-500/10 text-purple-700 dark:text-purple-300'
    }
    if (item.state === 'draft') {
      return 'border-border/60 bg-muted-foreground/70 text-background dark:bg-muted-foreground/60 dark:text-foreground'
    }
    if (item.state === 'closed') {
      return 'border-status-danger-border bg-status-danger-background text-status-danger'
    }
    return 'border-status-success-border bg-status-success-background text-status-success'
  }

  if (item.state === 'closed') {
    return 'border-status-danger-border bg-status-danger-background text-status-danger'
  }
  return 'border-status-success-border bg-status-success-background text-status-success'
}

export function isTaskPageGitHubDraftPR(item: GitHubWorkItemStatusItem): boolean {
  return item.type === 'pr' && item.state === 'draft'
}

export function getTaskPageGitHubPRIconTone(item: GitHubWorkItemStatusItem): string {
  if (item.type !== 'pr') {
    return 'text-muted-foreground'
  }

  switch (item.state) {
    case 'draft':
      return 'text-muted-foreground'
    case 'open':
      return 'text-status-success'
    case 'merged':
      return 'text-purple-600 dark:text-purple-300'
    case 'closed':
      return 'text-status-danger'
  }
}
