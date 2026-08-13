// Reorderable website list for the chat workspace dialog. First valid URL is
// the primary site and drives the default favicon.

import { GripVertical, Link2, X } from 'lucide-react'
import type React from 'react'
import { useState } from 'react'
import {
  MAX_CHAT_WORKSPACE_URLS,
  normalizeWebsiteUrl
} from '../../../../shared/chat-workspace-site-info'
import { ORCA_INTERNAL_FILE_DRAG_TYPE } from '../../../../shared/native-file-drop'
import { translate } from '@/i18n/i18n'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import {
  createUrlDraft,
  moveUrlDraft,
  type ChatWorkspaceUrlDraft
} from './chat-workspace-url-drafts'

export function ChatWorkspaceUrlList({
  drafts,
  onChange
}: {
  drafts: ChatWorkspaceUrlDraft[]
  onChange: (next: ChatWorkspaceUrlDraft[]) => void
}): React.JSX.Element {
  const [dragKey, setDragKey] = useState<string | null>(null)
  const [over, setOver] = useState<{ key: string; after: boolean } | null>(null)

  const resetDrag = (): void => {
    setDragKey(null)
    setOver(null)
  }

  const addUrl = (): void => {
    if (drafts.length >= MAX_CHAT_WORKSPACE_URLS) {
      return
    }
    onChange([...drafts, createUrlDraft()])
  }
  const primaryKey = drafts.find((row) => normalizeWebsiteUrl(row.value))?.key

  return (
    <div className="space-y-2">
      <div className="space-y-1">
        <Label>{translate('auto.components.chat.workspaceDialog.urlsLabel', 'Websites')}</Label>
        <p className="text-xs text-muted-foreground">
          {translate(
            'auto.components.chat.workspaceDialog.urlsHint',
            'First URL is the primary site and sets the workspace icon. Drag to reorder.'
          )}
        </p>
      </div>
      {drafts.length > 0 ? (
        <ul className="space-y-1.5">
          {drafts.map((draft) => {
            const dropEdge = over?.key === draft.key ? (over.after ? 'below' : 'above') : null
            return (
              <li
                key={draft.key}
                className={cn(
                  'relative flex items-center gap-1.5 rounded-md border border-border bg-muted/30 px-1.5 py-1',
                  dragKey === draft.key && 'opacity-50'
                )}
                onDragOver={(event) => {
                  if (!dragKey || dragKey === draft.key) {
                    return
                  }
                  event.preventDefault()
                  event.dataTransfer.dropEffect = 'move'
                  const rect = event.currentTarget.getBoundingClientRect()
                  const after = event.clientY > rect.top + rect.height / 2
                  setOver((current) =>
                    current?.key === draft.key && current.after === after
                      ? current
                      : { key: draft.key, after }
                  )
                }}
                onDragLeave={() => {
                  setOver((current) => (current?.key === draft.key ? null : current))
                }}
                onDrop={(event) => {
                  event.preventDefault()
                  if (dragKey) {
                    const placeAfter = over?.key === draft.key ? over.after : false
                    onChange(moveUrlDraft(drafts, dragKey, draft.key, placeAfter))
                  }
                  resetDrag()
                }}
              >
                {dropEdge ? (
                  <span
                    className={cn(
                      'pointer-events-none absolute inset-x-1 z-10 h-0.5 rounded-full bg-ring',
                      dropEdge === 'above' ? '-top-px' : '-bottom-px'
                    )}
                  />
                ) : null}
                <button
                  type="button"
                  draggable
                  aria-label={translate(
                    'auto.components.chat.workspaceDialog.reorderUrl',
                    'Reorder website'
                  )}
                  className="flex size-7 shrink-0 cursor-grab items-center justify-center rounded-sm text-muted-foreground hover:bg-accent active:cursor-grabbing"
                  onDragStart={(event) => {
                    setDragKey(draft.key)
                    event.dataTransfer.setData(ORCA_INTERNAL_FILE_DRAG_TYPE, draft.key)
                    event.dataTransfer.effectAllowed = 'move'
                  }}
                  onDragEnd={resetDrag}
                >
                  <GripVertical className="size-3.5" />
                </button>
                <Input
                  value={draft.value}
                  inputMode="url"
                  autoComplete="url"
                  placeholder={translate(
                    'auto.components.chat.workspaceDialog.urlPlaceholder',
                    'https://example.com'
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
                    const href = normalizeWebsiteUrl(draft.value)
                    if (href && href !== draft.value) {
                      onChange(
                        drafts.map((row) => (row.key === draft.key ? { ...row, value: href } : row))
                      )
                    }
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault()
                      addUrl()
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
                    'auto.components.chat.workspaceDialog.removeUrl',
                    'Remove website'
                  )}
                  onClick={() => onChange(drafts.filter((row) => row.key !== draft.key))}
                >
                  <X className="size-3" />
                </Button>
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="text-xs text-muted-foreground">
          {translate(
            'auto.components.chat.workspaceDialog.noUrls',
            'No websites yet. Add the live site first, then staging or docs.'
          )}
        </p>
      )}
      {drafts.length < MAX_CHAT_WORKSPACE_URLS ? (
        <Button variant="outline" size="sm" className="gap-1.5" onClick={addUrl}>
          <Link2 className="size-3.5" />
          {translate('auto.components.chat.workspaceDialog.addUrl', 'Add website')}
        </Button>
      ) : null}
    </div>
  )
}
