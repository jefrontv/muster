import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { resolveClaudeSubagentTranscript } from './claude-subagent-transcript'

let root: string
let parent: string
let subagents: string

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'subagent-transcript-'))
  parent = join(root, 'sess.jsonl')
  subagents = join(root, 'sess', 'subagents')
  mkdirSync(subagents, { recursive: true })
  writeFileSync(parent, '')
})
afterEach(() => rmSync(root, { recursive: true, force: true }))

const resolve = (toolUseId: string) =>
  resolveClaudeSubagentTranscript({
    agent: 'claude',
    sessionId: 'sess',
    transcriptPath: parent,
    toolUseId
  })

describe('resolveClaudeSubagentTranscript', () => {
  it('finds the sidechain through its meta file', async () => {
    writeFileSync(join(subagents, 'agent-a1.meta.json'), JSON.stringify({ toolUseId: 'toolu_1' }))
    writeFileSync(join(subagents, 'agent-a1.jsonl'), '{}\n')
    await expect(resolve('toolu_1')).resolves.toBe(join(subagents, 'agent-a1.jsonl'))
    await expect(resolve('toolu_other')).resolves.toBeNull()
  })

  it('falls back to the agentId on the parent tool result', async () => {
    writeFileSync(
      parent,
      `${JSON.stringify({
        type: 'user',
        message: { content: [{ type: 'tool_result', tool_use_id: 'toolu_2', content: 'done' }] },
        toolUseResult: { agentId: 'b2', status: 'completed' }
      })}\n`
    )
    writeFileSync(join(subagents, 'agent-b2.jsonl'), '{}\n')
    await expect(resolve('toolu_2')).resolves.toBe(join(subagents, 'agent-b2.jsonl'))
  })

  it('refuses an agent id that is not a plain file name', async () => {
    writeFileSync(
      parent,
      `${JSON.stringify({
        message: { content: [{ type: 'tool_result', tool_use_id: 'toolu_3' }] },
        toolUseResult: { agentId: '../../etc' }
      })}\n`
    )
    await expect(resolve('toolu_3')).resolves.toBeNull()
  })
})
