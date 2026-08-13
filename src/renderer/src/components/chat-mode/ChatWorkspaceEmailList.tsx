// Client email list for the workspace dialog. First valid address is the
// primary contact and goes into new-chat context first.

import { Mail, X } from 'lucide-react'
import type React from 'react'
import {
  MAX_CHAT_WORKSPACE_EMAILS,
  normalizeClientEmail
} from '../../../../shared/chat-workspace-site-info'
import { translate } from '@/i18n/i18n'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createUrlDraft, type ChatWorkspaceUrlDraft } from './chat-workspace-url-drafts'

export function emailsFromDrafts(drafts: readonly ChatWorkspaceUrlDraft[]): string[] {
  const seen = new Set<string>()
  const emails: string[] = []
  for (const draft of drafts) {
    const email = normalizeClientEmail(draft.value)
    if (!email || seen.has(email)) {
      continue
    }
    seen.add(email)
    emails.push(email)
  }
  return emails
}

export function ChatWorkspaceEmailList({
  drafts,
  onChange
}: {
  drafts: ChatWorkspaceUrlDraft[]
  onChange: (next: ChatWorkspaceUrlDraft[]) => void
}): React.JSX.Element {
  const addEmail = (): void => {
    if (drafts.length >= MAX_CHAT_WORKSPACE_EMAILS) {
      return
    }
    onChange([...drafts, createUrlDraft()])
  }
  const primaryKey = drafts.find((row) => normalizeClientEmail(row.value))?.key

  return (
    <div className="space-y-2">
      <div className="space-y-1">
        <Label>
          {translate('auto.components.chat.workspaceDialog.emailsLabel', 'Client emails')}
        </Label>
        <p className="text-xs text-muted-foreground">
          {translate(
            'auto.components.chat.workspaceDialog.emailsHint',
            'Contacts for this client. The first address is the primary contact.'
          )}
        </p>
      </div>
      {drafts.length > 0 ? (
        <ul className="space-y-1.5">
          {drafts.map((draft) => (
            <li
              key={draft.key}
              className="flex items-center gap-1.5 rounded-md border border-border bg-muted/30 px-1.5 py-1"
            >
              <Input
                value={draft.value}
                type="email"
                inputMode="email"
                autoComplete="email"
                placeholder={translate(
                  'auto.components.chat.workspaceDialog.emailPlaceholder',
                  'name@client.com'
                )}
                className="h-8 bg-transparent dark:bg-transparent"
                onChange={(event) =>
                  onChange(
                    drafts.map((row) =>
                      row.key === draft.key ? { ...row, value: event.target.value } : row
                    )
                  )
                }
                onBlur={() => {
                  const email = normalizeClientEmail(draft.value)
                  if (email && email !== draft.value) {
                    onChange(
                      drafts.map((row) => (row.key === draft.key ? { ...row, value: email } : row))
                    )
                  }
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    addEmail()
                  }
                }}
              />
              {draft.key === primaryKey ? (
                <span className="shrink-0 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  {translate('auto.components.chat.workspaceDialog.primary', 'primary')}
                </span>
              ) : null}
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label={translate(
                  'auto.components.chat.workspaceDialog.removeEmail',
                  'Remove email'
                )}
                onClick={() => onChange(drafts.filter((row) => row.key !== draft.key))}
              >
                <X className="size-3" />
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted-foreground">
          {translate(
            'auto.components.chat.workspaceDialog.noEmails',
            'No client emails yet. Add the main contact first.'
          )}
        </p>
      )}
      {drafts.length < MAX_CHAT_WORKSPACE_EMAILS ? (
        <Button variant="outline" size="sm" className="gap-1.5" onClick={addEmail}>
          <Mail className="size-3.5" />
          {translate('auto.components.chat.workspaceDialog.addEmail', 'Add email')}
        </Button>
      ) : null}
    </div>
  )
}
