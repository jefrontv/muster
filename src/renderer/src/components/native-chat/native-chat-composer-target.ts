import { translate } from '@/i18n/i18n'
import { getScreenSubmitShortcutLabel } from '@/lib/screen-submit-shortcut'
import { isRemoteRuntimePtyId } from '@/runtime/runtime-terminal-inspection'
import type { getSettingsForAgentTabRuntimeOwner } from '@/lib/agent-paste-draft'

export type NativeChatResolvedTarget = {
  ptyId: string
  settings: ReturnType<typeof getSettingsForAgentTabRuntimeOwner>
}

/** Upper bound for clipboard text pulled into the composer via Cmd/Ctrl+V, so a
 *  pathological clipboard can't stall the round-trip. */
export const NATIVE_CHAT_CONTEXT_PASTE_MAX_BYTES = 16 * 1024 * 1024

/** queueing: a stream thread mid-turn, where Enter queues and Cmd/Ctrl+Enter steers. */
export function nativeChatComposerPlaceholder(
  hasPty: boolean,
  canSend: boolean,
  queueing = false
): string {
  if (!hasPty) {
    return translate(
      'components.native-chat.composer.noPty',
      'No live terminal — toggle back to reconnect.'
    )
  }
  if (!canSend) {
    return translate('components.native-chat.composer.locked', 'Input is held by another device.')
  }
  if (queueing) {
    return translate(
      'components.native-chat.composer.queue',
      'Queue a message ({{shortcut}} to steer)',
      { shortcut: getScreenSubmitShortcutLabel() }
    )
  }
  return translate('components.native-chat.composer.reply', 'Reply…')
}

export function nativeChatComposerTargetIsRemote(ptyId: string | null): boolean {
  return ptyId !== null && isRemoteRuntimePtyId(ptyId)
}

export function formatNativeChatFileReference(filePath: string): string {
  const escaped = filePath.replace(/"/g, '\\"')
  return /\s/.test(filePath) ? `@"${escaped}"` : `@${filePath}`
}
