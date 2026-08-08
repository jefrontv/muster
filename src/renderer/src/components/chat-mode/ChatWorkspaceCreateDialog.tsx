// Create/edit dialog for a chat workspace: a name plus the directories the agent may
// touch. Deliberately non-technical — no branch, worktree, or agent configuration.

import { FolderPlus, X } from 'lucide-react'
import type React from 'react'
import { useEffect, useState } from 'react'
import type { ChatWorkspace } from '../../../../shared/chat-mode-types'
import type { RepoIcon } from '../../../../shared/repo-icon'
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
import { useAppStore } from '@/store'
import { ChatWorkspaceAppearanceSection } from './ChatWorkspaceAppearanceSection'
import {
  ChatWorkspaceProjectBinding,
  type ChatWorkspaceProjectRef
} from './ChatWorkspaceProjectBinding'

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
  const [directories, setDirectories] = useState<string[]>([])
  const [icon, setIcon] = useState<RepoIcon | null>(null)
  const [color, setColor] = useState<string | null>(null)
  const [acProject, setAcProject] = useState<ChatWorkspaceProjectRef | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) {
      setName(workspace?.name ?? '')
      setDirectories(workspace?.directories ?? [])
      setIcon(workspace?.icon ?? null)
      setColor(workspace?.color ?? null)
      setAcProject(workspace?.activeCollabProject ?? null)
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
  const applyIcon = (nextIcon: RepoIcon | null): void => {
    setIcon(nextIcon)
    if (workspace) {
      void updateChatWorkspace(workspace.id, { icon: nextIcon })
    }
  }
  const applyColor = (nextColor: string): void => {
    setColor(nextColor)
    if (workspace) {
      void updateChatWorkspace(workspace.id, { color: nextColor })
    }
  }

  const canSave = name.trim().length > 0 && directories.length > 0 && !saving

  const save = async (): Promise<void> => {
    setSaving(true)
    try {
      const appearance = { icon, ...(color ? { color } : {}) }
      if (workspace) {
        await updateChatWorkspace(workspace.id, {
          name: name.trim(),
          directories,
          ...appearance,
          activeCollabProject: acProject
        })
      } else {
        const created = await createChatWorkspace({ name: name.trim(), directories })
        if (icon || color || acProject) {
          await updateChatWorkspace(created.id, {
            ...appearance,
            activeCollabProject: acProject
          })
        }
      }
      onOpenChange(false)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto scrollbar-sleek sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {workspace
              ? translate('auto.components.chat.workspaceDialog.editTitle', 'Edit workspace')
              : translate('auto.components.chat.workspaceDialog.createTitle', 'New workspace')}
          </DialogTitle>
          <DialogDescription>
            {translate(
              'auto.components.chat.workspaceDialog.description',
              'Name the workspace and choose the folders Claude can work in.'
            )}
          </DialogDescription>
        </DialogHeader>
        {/* min-w-0: DialogContent is a grid; without it a long unbreakable
            folder path widens the whole column past the dialog edge. */}
        <div className="min-w-0 space-y-4">
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
            <Label>{translate('auto.components.chat.workspaceDialog.dirsLabel', 'Folders')}</Label>
            {directories.length > 0 ? (
              <ul className="space-y-1">
                {directories.map((directory, index) => (
                  <li
                    key={directory}
                    className="flex items-center gap-2 rounded-md border border-border bg-muted/40 px-2 py-1"
                  >
                    <span className="flex min-w-0 flex-1 items-baseline gap-1.5" title={directory}>
                      <span className="shrink-0 text-xs font-medium">
                        {directory.split(/[\\/]/).findLast((part) => part !== '') ?? directory}
                      </span>
                      <span className="min-w-0 truncate font-mono text-[10px] text-muted-foreground">
                        {directory}
                      </span>
                    </span>
                    {index === 0 ? (
                      <span className="shrink-0 text-[10px] uppercase tracking-wide text-muted-foreground">
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
                  'No folders yet. The first folder becomes the main working folder.'
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
          <ChatWorkspaceProjectBinding value={acProject} onChange={setAcProject} />
          <div className="space-y-1.5 border-t border-border pt-3">
            <Label>
              {translate('auto.components.chat.workspaceDialog.appearance', 'Appearance')}
            </Label>
            <ChatWorkspaceAppearanceSection
              name={name}
              icon={icon}
              color={color}
              onIconChange={applyIcon}
              onColorChange={applyColor}
            />
          </div>
        </div>
        <DialogFooter>
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
