// A Claude subagent's own transcript ("sidechain"): `<session>/subagents/agent-<id>.jsonl`
// beside the parent `<session>.jsonl`. The Code panel's parent transcript has only the
// Agent call and its result, so drilling into an agent reads this file instead.

import { createReadStream, existsSync } from 'node:fs'
import { readdir, readFile } from 'node:fs/promises'
import { dirname, extname, join, basename } from 'node:path'
import { createInterface } from 'node:readline'
import { ipcMain } from 'electron'
import type { AgentType } from '../../shared/native-chat-types'
import { resolveSessionFilePath } from './session-file-resolver'

export type ResolveSubagentTranscriptArgs = {
  agent: AgentType
  sessionId: string
  transcriptPath?: string
  /** The parent's Agent/Task tool call id. */
  toolUseId: string
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** Newer CLIs write `agent-<id>.meta.json` naming the tool call that launched the agent. */
async function fromMetaFiles(dir: string, toolUseId: string): Promise<string | null> {
  let names: string[]
  try {
    names = await readdir(dir)
  } catch {
    return null
  }
  for (const name of names.filter((entry) => entry.endsWith('.meta.json'))) {
    try {
      const meta: unknown = JSON.parse(await readFile(join(dir, name), 'utf8'))
      if (isRecord(meta) && meta.toolUseId === toolUseId) {
        const file = join(dir, name.replace(/\.meta\.json$/, '.jsonl'))
        return existsSync(file) ? file : null
      }
    } catch {
      // A half-written meta file: skip it.
    }
  }
  return null
}

/** Older CLIs: the parent's tool result record carries `toolUseResult.agentId`. */
async function agentIdFromParent(parentPath: string, toolUseId: string): Promise<string | null> {
  const lines = createInterface({
    input: createReadStream(parentPath, { encoding: 'utf8' }),
    crlfDelay: Infinity
  })
  try {
    for await (const line of lines) {
      if (!line.includes(toolUseId) || !line.includes('"agentId"')) {
        continue
      }
      try {
        const record: unknown = JSON.parse(line)
        const result = isRecord(record) ? record.toolUseResult : null
        const content = isRecord(record) && isRecord(record.message) ? record.message.content : null
        const answers =
          Array.isArray(content) &&
          content.some((block) => isRecord(block) && block.tool_use_id === toolUseId)
        if (answers && isRecord(result) && typeof result.agentId === 'string') {
          return result.agentId
        }
      } catch {
        // Not a JSON line: keep scanning.
      }
    }
  } catch {
    return null
  }
  return null
}

export async function resolveClaudeSubagentTranscript(
  args: ResolveSubagentTranscriptArgs
): Promise<string | null> {
  const parent = await resolveSessionFilePath(args.agent, args.sessionId, {
    transcriptPath: args.transcriptPath
  })
  if (!parent || extname(parent) !== '.jsonl' || !args.toolUseId) {
    return null
  }
  const dir = join(dirname(parent), basename(parent, '.jsonl'), 'subagents')
  const viaMeta = await fromMetaFiles(dir, args.toolUseId)
  if (viaMeta) {
    return viaMeta
  }
  const agentId = await agentIdFromParent(parent, args.toolUseId)
  // The id becomes a file name: accept only the CLI's plain hex/word ids.
  if (!agentId || !/^[\w-]+$/.test(agentId)) {
    return null
  }
  const file = join(dir, `agent-${agentId}.jsonl`)
  return existsSync(file) ? file : null
}

export function registerSubagentTranscriptHandler(): void {
  ipcMain.handle(
    'nativeChat:resolveSubagentTranscript',
    (_event, args: ResolveSubagentTranscriptArgs) => resolveClaudeSubagentTranscript(args)
  )
}
