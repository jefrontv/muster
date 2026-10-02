import { describe, expect, it } from 'vitest'
import { describeToolActivity } from './native-chat-tool-activity'
import type { NativeChatToolCallBlock, NativeChatToolResultBlock } from './native-chat-types'

const call = (name: string, input: unknown): NativeChatToolCallBlock => ({
  type: 'tool-call',
  name,
  input
})
const ok = (
  output = 'ok',
  detail?: NativeChatToolResultBlock['detail']
): NativeChatToolResultBlock => ({
  type: 'tool-result',
  output,
  ...(detail ? { detail } : {})
})
const cwd = '/Users/me/site'

/** "verb object" as a row reads. */
const line = (...args: Parameters<typeof describeToolActivity>): string => {
  const activity = describeToolActivity(...args)
  return [activity.verb, activity.object].filter(Boolean).join(' ')
}

describe('describeToolActivity: edits', () => {
  const edit = call('Edit', {
    file_path: `${cwd}/wp-content/themes/x/header.php`,
    old_string: 'a',
    new_string: 'b'
  })
  const patched = ok('Updated', { patch: [], additions: 4, deletions: 2 })

  it('Code: relative path, real counts from the structured patch, a diff to expand', () => {
    const activity = describeToolActivity(edit, patched, 'code', { cwd })
    expect(line(edit, patched, 'code', { cwd })).toBe('Edited wp-content/themes/x/header.php')
    expect(activity).toMatchObject({
      additions: 4,
      deletions: 2,
      detail: 'diff',
      objectIsCode: true,
      group: 'edit'
    })
  })

  it('Chat: a plain sentence with the file name only, no counts, nothing to expand', () => {
    const activity = describeToolActivity(edit, patched, 'chat', { cwd })
    expect(line(edit, patched, 'chat', { cwd })).toBe('Updated header.php')
    expect(activity.additions).toBeUndefined()
    expect(activity.detail).toBe('none')
    expect(activity.objectIsCode).toBe(false)
  })

  it('names a created file in both surfaces', () => {
    const write = call('Write', { file_path: `${cwd}/style.css`, content: 'x' })
    const created = ok('', { created: true, additions: 1, deletions: 0 })
    expect(line(write, created, 'chat')).toBe('Created style.css')
    expect(line(write, created, 'code', { cwd })).toBe('Created style.css')
  })

  it('treats MultiEdit and NotebookEdit as edits', () => {
    for (const name of ['MultiEdit', 'NotebookEdit']) {
      expect(
        describeToolActivity(call(name, { file_path: '/a.ts' }), undefined, 'chat').group
      ).toBe('edit')
    }
  })
})

describe('describeToolActivity: commands', () => {
  const bash = call('Bash', { command: 'npm test -- --run', description: 'Running the tests' })

  it('Code: the command itself, a terminal block, interrupted as meta', () => {
    const result = ok('', { stdout: 'pass', interrupted: true })
    expect(describeToolActivity(bash, result, 'code')).toMatchObject({
      verb: 'Ran',
      object: 'npm test -- --run',
      objectIsCode: true,
      detail: 'terminal',
      meta: ['interrupted']
    })
  })

  it("Chat: the model's own description, never the command", () => {
    const activity = describeToolActivity(bash, ok(), 'chat')
    expect(line(bash, ok(), 'chat')).toBe('Running the tests')
    expect(activity.detail).toBe('none')
    expect(JSON.stringify(activity)).not.toContain('npm test')
  })

  it('Chat: "Ran a command" without a description; a failure is flagged, not described', () => {
    const plain = call('Bash', { command: 'rm -rf build' })
    const failed: NativeChatToolResultBlock = { type: 'tool-result', output: 'no', isError: true }
    const activity = describeToolActivity(plain, failed, 'chat')
    expect(activity.verb).toBe('Ran a command')
    expect(activity.failed).toBe(true)
    expect(activity.meta).toEqual([])
    expect(describeToolActivity(plain, failed, 'code').meta).toEqual(['failed'])
  })

  it('shows elapsed time in Code mode only', () => {
    expect(describeToolActivity(bash, ok(), 'code', { elapsedMs: 4_200 }).meta).toEqual(['4.2s'])
    expect(describeToolActivity(bash, ok(), 'chat', { elapsedMs: 4_200 }).meta).toEqual([])
  })
})

describe('describeToolActivity: reads and searches', () => {
  it('Read: relative path with a line range in Code, file name in Chat', () => {
    const read = call('Read', { file_path: `${cwd}/src/app.ts`, offset: 10, limit: 20 })
    expect(describeToolActivity(read, ok(), 'code', { cwd })).toMatchObject({
      verb: 'Read',
      object: 'src/app.ts',
      meta: ['lines 10–29'],
      detail: 'files',
      group: 'read'
    })
    expect(line(read, ok(), 'chat', { cwd })).toBe('Read app.ts')
    expect(describeToolActivity(read, ok(), 'chat').detail).toBe('none')
  })

  it('Grep/Glob: pattern and match count in Code, "Searched the project" in Chat', () => {
    const grep = call('Grep', { pattern: 'add_action', path: `${cwd}/inc` })
    const found = ok('Found 3 files\n/a.php\n/b.php\n/c.php')
    expect(describeToolActivity(grep, found, 'code', { cwd })).toMatchObject({
      verb: 'Searched',
      object: 'add_action in inc',
      meta: ['3 files'],
      detail: 'files'
    })
    expect(line(grep, found, 'chat')).toBe('Searched the project')
    expect(line(call('Glob', { pattern: '**/*.php' }), ok(), 'code')).toBe('Listed **/*.php')
    expect(line(call('Glob', { pattern: '**/*.php' }), ok(), 'chat')).toBe('Searched the project')
  })
})

describe('describeToolActivity: web, helpers, plans', () => {
  it('WebSearch: query in Code, sources in both, no raw prompt in Chat', () => {
    const search = call('WebSearch', { query: 'wordpress dvh header' })
    const result = ok('', { sources: [{ url: 'https://example.com/a', title: 'A' }] })
    expect(line(search, result, 'code')).toBe('Searched the web wordpress dvh header')
    const chat = describeToolActivity(search, result, 'chat')
    expect(chat).toMatchObject({ verb: 'Searched the web', object: '', detail: 'sources' })
    expect(chat.sources).toHaveLength(1)
  })

  it('WebFetch: "Read example.com" in Chat, "Fetched" in Code', () => {
    const fetch = call('WebFetch', { url: 'https://www.example.com/docs', prompt: 'summarise' })
    expect(line(fetch, ok(), 'chat')).toBe('Read example.com')
    expect(line(fetch, ok(), 'code')).toBe('Fetched example.com')
  })

  it('Task/Agent: "Asked a helper to …"', () => {
    for (const name of ['Task', 'Agent']) {
      const task = call(name, { description: 'Compare the spacing', prompt: 'long prompt' })
      expect(line(task, undefined, 'chat')).toBe('Asked a helper to compare the spacing')
    }
  })

  it('hides TodoWrite on both surfaces (the plan checklist shows it)', () => {
    for (const surface of ['chat', 'code'] as const) {
      expect(describeToolActivity(call('TodoWrite', { todos: [] }), ok(), surface).hidden).toBe(
        true
      )
    }
  })

  it('names other harness tools plainly', () => {
    expect(line(call('Skill', { skill: 'humanizer' }), ok(), 'chat')).toBe(
      'Used the humanizer skill'
    )
    expect(line(call('AskUserQuestion', { questions: [] }), ok(), 'chat')).toBe(
      'Asked you a question'
    )
    expect(line(call('ExitPlanMode', {}), ok(), 'code')).toBe('Proposed a plan')
    expect(describeToolActivity(call('ToolSearch', {}), ok(), 'chat').hidden).toBe(true)
    expect(describeToolActivity(call('ToolSearch', {}), ok(), 'code')).toMatchObject({
      hidden: false,
      detail: 'fields'
    })
  })
})

describe('describeToolActivity: MCP', () => {
  const bundle = call('mcp__activecollab__get_task_bundle', { task_id: 77, project_id: 3 })

  it('Code: "Server: tool" with a key/value detail', () => {
    expect(describeToolActivity(bundle, ok('{"a":1}'), 'code')).toMatchObject({
      verb: 'ActiveCollab:',
      object: 'get task bundle',
      detail: 'fields'
    })
  })

  it('Chat: a per-server sentence, never JSON or results', () => {
    const activity = describeToolActivity(bundle, ok('{"secret":true}'), 'chat')
    expect(activity.verb).toBe('Checked ActiveCollab task #77')
    expect(activity.detail).toBe('none')
    expect(JSON.stringify(activity)).not.toContain('secret')
    expect(line(call('mcp__claude_ai_Figma__use_figma', {}), ok(), 'chat')).toBe('Used Figma')
    expect(line(call('mcp__muster-sites__update_wp_fields', {}), ok(), 'chat')).toBe(
      'Updated Muster sites'
    )
  })
})

describe('describeToolActivity: orphans and live labels', () => {
  it('hides a result whose call is not loaded in Chat, shows it as text in Code', () => {
    expect(describeToolActivity(undefined, ok('x'), 'chat').hidden).toBe(true)
    expect(describeToolActivity(undefined, ok('x'), 'code').detail).toBe('text')
  })

  it('gives each call a present-tense live label', () => {
    expect(
      describeToolActivity(call('Read', { file_path: '/a/b.ts' }), undefined, 'chat').liveLabel
    ).toBe('Reading b.ts')
    expect(describeToolActivity(call('Bash', { command: 'ls' }), undefined, 'chat').liveLabel).toBe(
      'Running a command'
    )
  })

  it('takes an injected translator', () => {
    const t = (key: string, fallback: string) => (key.endsWith('.edited') ? 'Bearbeitet' : fallback)
    expect(
      describeToolActivity(call('Edit', { file_path: '/a.ts' }), undefined, 'code', { t }).verb
    ).toBe('Bearbeitet')
  })
})
