import { unwrapChatWorkspaceUserTurn } from '../../../../shared/chat-workspace-site-info'
import { parseActiveCollabTaskReferences } from '@/components/native-chat/native-chat-activecollab-references'
import {
  nativeChatImagePathNotes,
  parseNativeChatFileReferences,
  stripNativeChatImagePathNotes
} from '@/components/native-chat/native-chat-file-reference-display'

export type ChatUserMessageParts = {
  /** What the user typed, without the workspace brief. */
  typed: string
  images: string[]
  files: string[]
  taskIds: number[]
  /** The bubble text: references lifted out, since chips carry them. */
  body: string
}

/** Sends carry attachments as tokens the agent reads; the transcript shows them as chips. */
export function chatUserMessageParts(text: string): ChatUserMessageParts {
  const typed = unwrapChatWorkspaceUserTurn(text)
  const images = nativeChatImagePathNotes(typed)
  const { files, text: withoutFiles } = parseNativeChatFileReferences(
    stripNativeChatImagePathNotes(typed)
  )
  const { taskIds, text: body } = parseActiveCollabTaskReferences(withoutFiles)
  return { typed, images, files, taskIds, body }
}
