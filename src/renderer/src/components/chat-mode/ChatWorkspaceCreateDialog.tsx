// Create/edit dialog for a chat workspace: name, site URLs, notes, and the
// directories the agent may touch. Deliberately non-technical — no branch or agent config.

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { normalizeChatReplyStyle, type ChatReplyStyle } from '../../../../shared/chat-reply-style'
import { FolderPlus, X } from 'lucide-react'
import type React from 'react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ChatWorkspace, ChatWorkspacePatch } from '../../../../shared/chat-mode-types'
import type { RepoIcon } from '../../../../shared/repo-icon'
import {
  MAX_CHAT_WORKSPACE_NOTES_LENGTH,
  chatWorkspaceProjects,
  isChatWorkspaceIconOverridden,
  websiteHostname
} from '../../../../shared/chat-workspace-site-info'
import { translate } from '@/i18n/i18n'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { useChatWorkspaceFaviconSync } from '@/lib/use-chat-workspace-favicon-sync'
import { useAppStore } from '@/store'
import { ChatWorkspaceAppearanceSection } from './ChatWorkspaceAppearanceSection'
import {
  ChatWorkspaceProjectBinding,
  type ChatWorkspaceProjectRef
} from './ChatWorkspaceProjectBinding'
import { ChatWorkspaceEmailList, emailsFromDrafts } from './ChatWorkspaceEmailList'
import { ChatWorkspaceUrlList } from './ChatWorkspaceUrlList'
import {
  draftsFromUrls,
  primaryDraftUrl,
  urlsFromDrafts,
  type ChatWorkspaceUrlDraft
} from './chat-workspace-url-drafts'
import { Textarea } from '@/components/ui/textarea'

export function ChatWorkspaceCreateDialog({
  open,
  onOpenChange,
  workspace
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Present when editing; absent when creating. */
  workspace?: ChatWorkspace
}): React.JSX.Element {
  const createChatWorkspace = useAppStore((s) => s.createChatWorkspace)
  const updateChatWorkspace = useAppStore((s) => s.updateChatWorkspace)
  const [name, setName] = useState('')
  const [notes, setNotes] = useState('')
  const [urlDrafts, setUrlDrafts] = useState<ChatWorkspaceUrlDraft[]>([])
  const [emailDrafts, setEmailDrafts] = useState<ChatWorkspaceUrlDraft[]>([])
  const [directories, setDirectories] = useState<string[]>([])
  const [icon, setIcon] = useState<RepoIcon | null>(null)
  const [color, setColor] = useState<string | null>(null)
  const [iconOverridden, setIconOverridden] = useState(false)
  const [acProjects, setAcProjects] = useState<ChatWorkspaceProjectRef[]>([])
  const [replyStyle, setReplyStyle] = useState<ChatReplyStyle>('default')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) {
      setName(workspace?.name ?? '')
      setNotes(workspace?.notes ?? '')
      setUrlDrafts(draftsFromUrls(workspace?.urls ?? []))
      setEmailDrafts(draftsFromUrls(workspace?.clientEmails ?? []))
      setDirectories(workspace?.directories ?? [])
      setIcon(workspace?.icon ?? null)
      setColor(workspace?.color ?? null)
      setIconOverridden(isChatWorkspaceIconOverridden(workspace))
      setAcProjects(workspace ? chatWorkspaceProjects(workspace) : [])
      setReplyStyle(normalizeChatReplyStyle(workspace?.replyStyle))
      setSaving(false)
    }
  }, [open, workspace])

  const addDirectories = async (): Promise<void> => {
    const picked = await window.api.repos.pickFolders()
    if (picked.length > 0) {
      setDirectories((current) => [...current, ...picked.filter((path) => !current.includes(path))])
    }
  }

  // Why: appearance edits apply immediately (like project settings) — a favicon
  // "Apply" that still waits on the dialog's Save reads as a broken button.
  const persistAppearance = useCallback(
    (patch: ChatWorkspacePatch): void => {
      if (workspace) {
        void updateChatWorkspace(workspace.id, patch)
      }
    },
    [updateChatWorkspace, workspace]
  )

  const applyAutoIcon = useCallback(
    (nextIcon: RepoIcon): void => {
      setIcon(nextIcon)
      persistAppearance({ icon: nextIcon, iconOverridden: false })
    },
    [persistAppearance]
  )

  const applyIcon = (nextIcon: RepoIcon | null): void => {
    setIcon(nextIcon)
    setIconOverridden(true)
    persistAppearance({ icon: nextIcon, iconOverridden: true })
  }
  const applyColor = (nextColor: string): void => {
    setColor(nextColor)
    persistAppearance({ color: nextColor })
  }

  const primaryUrl = useMemo(() => primaryDraftUrl(urlDrafts), [urlDrafts])
  useChatWorkspaceFaviconSync({
    open,
    primaryUrl,
    iconOverridden,
    hasAutoIcon: icon?.type === 'image' && icon.source === 'favicon',
    onAutoIcon: applyAutoIcon
  })

  const canSave = name.trim().length > 0 && !saving

  const siteFields = (): Pick<
    ChatWorkspacePatch,
    | 'urls'
    | 'clientEmails'
    | 'notes'
    | 'icon'
    | 'color'
    | 'iconOverridden'
    | 'activeCollabProjects'
    | 'replyStyle'
  > => ({
    urls: urlsFromDrafts(urlDrafts),
    clientEmails: emailsFromDrafts(emailDrafts),
    notes,
    icon,
    iconOverridden,
    activeCollabProjects: acProjects,
    replyStyle,
    ...(color ? { color } : {})
  })

  const save = async (): Promise<void> => {
    setSaving(true)
    try {
      if (workspace) {
        await updateChatWorkspace(workspace.id, {
          name: name.trim(),
          directories,
          ...siteFields()
        })
      } else {
        const created = await createChatWorkspace({ name: name.trim(), directories })
        await updateChatWorkspace(created.id, siteFields())
      }
      onOpenChange(false)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-xl">
        <DialogHeader className="shrink-0 space-y-1 border-b border-border px-6 py-4 pr-12">
          <DialogTitle>
            {workspace
              ? translate('auto.components.chat.workspaceDialog.editTitle', 'Edit workspace')
              : translate('auto.components.chat.workspaceDialog.createTitle', 'New workspace')}
          </DialogTitle>
          <DialogDescription>
            {translate(
              'auto.components.chat.workspaceDialog.description',
              'Name the workspace and add site details. Folders are optional.'
            )}
          </DialogDescription>
        </DialogHeader>
        {/* min-w-0: DialogContent is a grid; without it a long unbreakable
            folder path widens the whole column past the dialog edge. */}
        <div className="min-h-0 min-w-0 flex-1 space-y-5 overflow-y-auto px-6 py-4 scrollbar-sleek">
          <div className="space-y-1.5">
            <Label htmlFor="chat-workspace-name">
              {translate('auto.components.chat.workspaceDialog.nameLabel', 'Name')}
            </Label>
            <Input
              id="chat-workspace-name"
              value={name}
              autoFocus
              placeholder={translate(
                'auto.components.chat.workspaceDialog.namePlaceholder',
                'e.g. Client site'
              )}
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <div className="space-y-1">
              <Label htmlFor="chat-workspace-notes">
                {translate('auto.components.chat.workspaceDialog.notesLabel', 'About')}
              </Label>
              <p className="text-xs text-muted-foreground">
                {translate(
                  'auto.components.chat.workspaceDialog.notesHint',
                  'Optional context new chats in this workspace will see. Stack, clients, gotchas.'
                )}
              </p>
            </div>
            <Textarea
              id="chat-workspace-notes"
              value={notes}
              rows={3}
              maxLength={MAX_CHAT_WORKSPACE_NOTES_LENGTH}
              placeholder={translate(
                'auto.components.chat.workspaceDialog.notesPlaceholder',
                'e.g. WordPress site. Staging is on LocalWP.'
              )}
              onChange={(event) => setNotes(event.target.value)}
              className={cn(
                'resize-y',
                'focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring'
              )}
            />
          </div>
          <div className="space-y-1.5">
            <div className="space-y-1">
              <Label htmlFor="chat-workspace-reply-style">
                {translate('components.chat-mode.workspaceDialog.replyStyle', 'Reply style')}
              </Label>
              <p className="text-xs text-muted-foreground">
                {translate(
                  'components.chat-mode.workspaceDialog.replyStyleHint',
                  'Conversational sends short replies as a few small messages. Applies to new chats.'
                )}
              </p>
            </div>
            <Select
              value={replyStyle}
              onValueChange={(value) => setReplyStyle(normalizeChatReplyStyle(value))}
            >
              <SelectTrigger id="chat-workspace-reply-style" className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="default">
                  {translate('components.chat-mode.workspaceDialog.replyStyleDefault', 'Default')}
                </SelectItem>
                <SelectItem value="conversational">
                  {translate(
                    'components.chat-mode.workspaceDialog.replyStyleConversational',
                    'Conversational'
                  )}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <ChatWorkspaceUrlList drafts={urlDrafts} onChange={setUrlDrafts} />
          <ChatWorkspaceEmailList drafts={emailDrafts} onChange={setEmailDrafts} />
          <div className="space-y-1.5">
            <div className="space-y-1">
              <Label>
                {translate('auto.components.chat.workspaceDialog.dirsLabel', 'Folders')}
              </Label>
              <p className="text-xs text-muted-foreground">
                {translate(
                  'auto.components.chat.workspaceDialog.dirsHint',
                  'Optional. The first folder is the working directory. Extra folders are added to the session.'
                )}
              </p>
            </div>
            {directories.length > 0 ? (
              <ul className="space-y-1.5">
                {directories.map((directory, index) => (
                  <li
                    key={directory}
                    className="flex items-center gap-2 rounded-md border border-border bg-muted/30 px-2 py-1.5"
                  >
                    <span className="flex min-w-0 flex-1 items-baseline gap-1.5" title={directory}>
                      <span className="shrink-0 text-xs font-medium">
                        {directory.split(/[\\/]/).findLast((part) => part !== '') ?? directory}
                      </span>
                      <span className="min-w-0 truncate font-mono text-[11px] text-muted-foreground">
                        {directory}
                      </span>
                    </span>
                    {index === 0 ? (
                      <span className="shrink-0 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                        {translate('auto.components.chat.workspaceDialog.primary', 'primary')}
                      </span>
                    ) : null}
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      aria-label={translate(
                        'auto.components.chat.workspaceDialog.removeDir',
                        'Remove folder'
                      )}
                      onClick={() =>
                        setDirectories((current) => current.filter((d) => d !== directory))
                      }
                    >
                      <X className="size-3" />
                    </Button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-muted-foreground">
                {translate(
                  'auto.components.chat.workspaceDialog.noDirs',
                  'No folders. Chats start in your home folder until you add one.'
                )}
              </p>
            )}
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => void addDirectories()}
            >
              <FolderPlus className="size-3.5" />
              {translate('auto.components.chat.workspaceDialog.addDir', 'Add folder')}
            </Button>
          </div>
          <ChatWorkspaceProjectBinding value={acProjects} onChange={setAcProjects} />
          <div className="space-y-2 border-t border-border pt-4">
            <Label>
              {translate('auto.components.chat.workspaceDialog.appearance', 'Appearance')}
            </Label>
            <ChatWorkspaceAppearanceSection
              name={name}
              icon={icon}
              color={color}
              defaultFaviconDomain={primaryUrl ? (websiteHostname(primaryUrl) ?? '') : ''}
              onIconChange={applyIcon}
              onColorChange={applyColor}
            />
          </div>
        </div>
        <DialogFooter className="shrink-0 border-t border-border px-6 py-3">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {translate('auto.components.chat.workspaceDialog.cancel', 'Cancel')}
          </Button>
          <Button disabled={!canSave} onClick={() => void save()}>
            {workspace
              ? translate('auto.components.chat.workspaceDialog.save', 'Save')
              : translate('auto.components.chat.workspaceDialog.create', 'Create workspace')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
