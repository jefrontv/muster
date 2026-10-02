// The hero composer's footer, laid out like the thread composer's: + menu and the
// workspace chip on the left; the model/effort trigger, mic and send on the right.

import { ArrowUp, ChevronDown, Folder, FolderPlus } from 'lucide-react'
import type React from 'react'
import { translate } from '@/i18n/i18n'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import type { ChatWorkspace } from '../../../../shared/chat-mode-types'
import { NativeChatSessionOptionPickers } from '../native-chat/NativeChatSessionOptionPickers'
import { NativeChatStashMenu } from '../native-chat/NativeChatStashMenu'
import { NativeChatMicButton } from '../native-chat/NativeChatMicButton'
import type { NativeChatPromptStash } from '../native-chat/use-native-chat-prompt-stash'
import type { NativeChatDictation } from '../native-chat/use-native-chat-dictation'
import { useChatDraftSessionOptions } from './chat-draft-session-options'

/** Radio value for the standalone (no-workspace) chat option. */
const STANDALONE = ''

function WorkspaceChip({
  workspaces,
  selected,
  onSelect,
  onCreateWorkspace
}: {
  workspaces: readonly ChatWorkspace[]
  selected: ChatWorkspace | null
  onSelect: (id: string | null) => void
  onCreateWorkspace: () => void
}): React.JSX.Element {
  const name = selected?.name ?? translate('auto.components.chat.hero.standalone', 'No workspace')
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="xs"
          aria-label={translate('components.chat-mode.hero.workspaceChip', 'Workspace: {{name}}', {
            name
          })}
          className="max-w-48 gap-1 text-muted-foreground"
        >
          <Folder className="size-3.5 shrink-0" />
          <span className="truncate">{name}</span>
          <ChevronDown className="size-3 shrink-0" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="scrollbar-sleek max-h-80 w-64 overflow-y-auto">
        <DropdownMenuRadioGroup
          value={selected?.id ?? STANDALONE}
          onValueChange={(value) => onSelect(value === STANDALONE ? null : value)}
        >
          {workspaces.map((workspace) => (
            <DropdownMenuRadioItem key={workspace.id} value={workspace.id}>
              <span className="min-w-0 truncate">{workspace.name}</span>
            </DropdownMenuRadioItem>
          ))}
          <DropdownMenuRadioItem value={STANDALONE}>
            {translate('auto.components.chat.hero.standalone', 'No workspace')}
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onCreateWorkspace}>
          <FolderPlus className="size-4" />
          {translate('auto.components.chat.hero.newWorkspace', 'New workspace…')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function ChatModeDraftHeroControls({
  sendDisabled,
  onSend,
  stash,
  onAttach,
  dictation,
  workspaces,
  selectedWorkspace,
  onSelectWorkspace,
  onCreateWorkspace
}: {
  sendDisabled: boolean
  onSend: () => void
  stash: NativeChatPromptStash
  onAttach: () => void
  dictation: NativeChatDictation
  workspaces: readonly ChatWorkspace[]
  selectedWorkspace: ChatWorkspace | null
  onSelectWorkspace: (id: string | null) => void
  onCreateWorkspace: () => void
}): React.JSX.Element {
  const options = useChatDraftSessionOptions()
  return (
    <div className="flex w-full items-center justify-between gap-2 pt-0.5">
      <div className="flex min-w-0 items-center gap-0.5">
        <NativeChatStashMenu stash={stash} attachDisabled={false} onAttach={onAttach} />
        <WorkspaceChip
          workspaces={workspaces}
          selected={selectedWorkspace}
          onSelect={onSelectWorkspace}
          onCreateWorkspace={onCreateWorkspace}
        />
      </div>
      <div className="ml-auto flex items-center gap-1">
        <NativeChatSessionOptionPickers
          surface={options.surface}
          snapshot={options.snapshot}
          isWorking={false}
          chatThread
        />
        <NativeChatMicButton
          configured={dictation.configured}
          isDictating={dictation.isDictating}
          isHoldMode={dictation.isHoldMode}
          onToggle={dictation.toggle}
          onHoldStart={dictation.holdStart}
          onHoldEnd={dictation.holdEnd}
          onSetUp={dictation.openSetup}
        />
        <Button
          type="button"
          aria-label={translate('auto.components.chat.hero.send', 'Start the chat')}
          disabled={sendDisabled}
          onClick={onSend}
          size="icon"
          className="ml-0.5 size-8 rounded-full pointer-coarse:size-10"
        >
          <ArrowUp className="size-4" />
        </Button>
      </div>
    </div>
  )
}
