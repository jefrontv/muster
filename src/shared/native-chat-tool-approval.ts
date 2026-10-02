// Approval prompts as questions ("Allow Claude to change header.php?") rather
// than tool jargon. Chat mode keeps the command or path behind Details; Code
// mode shows it. Same describer family as the work log, so both read alike.

import {
  englishTranslate,
  type NativeChatSurface,
  type NativeChatTranslate
} from './native-chat-tool-activity-types'
import { parseMcpToolName } from './native-chat-tool-activity-mcp'
import { inputField, inputPath, pathFileName, urlDomain } from './native-chat-tool-input-fields'

export type NativeChatToolApproval = {
  title: string
  /** The model's own explanation, when it gave one. */
  caption: string | null
  /** Command, path or input the user judges; behind Details in Chat mode. */
  code: string | null
  detailsCollapsed: boolean
}

const EDIT_TOOLS = new Set(['Edit', 'MultiEdit', 'Write', 'NotebookEdit'])

function approvalTitle(toolName: string, input: unknown, t: NativeChatTranslate): string {
  const mcp = parseMcpToolName(toolName)
  if (mcp) {
    return t('components.native-chat.approval.useService', 'Allow Claude to use {{service}}?', {
      service: mcp.server
    })
  }
  const path = inputPath(input)
  if (EDIT_TOOLS.has(toolName)) {
    return path
      ? t('components.native-chat.approval.changeFile', 'Allow Claude to change {{file}}?', {
          file: pathFileName(path)
        })
      : t('components.native-chat.approval.changeFiles', 'Allow Claude to change files?')
  }
  switch (toolName) {
    case 'Bash':
      return t('components.native-chat.approval.runCommand', 'Allow Claude to run a command?')
    case 'Read':
      return path
        ? t('components.native-chat.approval.readFile', 'Allow Claude to read {{file}}?', {
            file: pathFileName(path)
          })
        : t('components.native-chat.approval.readFiles', 'Allow Claude to read files?')
    case 'WebFetch': {
      const url = inputField(input, 'url')
      return t('components.native-chat.approval.readSite', 'Allow Claude to read {{site}}?', {
        site: url ? urlDomain(url) : t('components.native-chat.approval.aWebPage', 'a web page')
      })
    }
    case 'WebSearch':
      return t('components.native-chat.approval.searchWeb', 'Allow Claude to search the web?')
    default:
      return t('components.native-chat.approval.useTool', 'Allow Claude to use {{tool}}?', {
        tool: toolName
      })
  }
}

function approvalCode(input: unknown): string | null {
  const command =
    inputField(input, 'command') ?? inputField(input, 'query') ?? inputField(input, 'url')
  if (command) {
    return command
  }
  const path = inputPath(input)
  if (path) {
    return path
  }
  if (input === null || input === undefined) {
    return null
  }
  try {
    const text = typeof input === 'string' ? input : JSON.stringify(input, null, 2)
    return text && text !== '{}' ? text : null
  } catch {
    return null
  }
}

export function describeToolApproval(
  toolName: string,
  input: unknown,
  surface: NativeChatSurface,
  t: NativeChatTranslate = englishTranslate
): NativeChatToolApproval {
  return {
    title: approvalTitle(toolName, input, t),
    caption: inputField(input, 'description'),
    code: approvalCode(input),
    detailsCollapsed: surface === 'chat'
  }
}
