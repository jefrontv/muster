import { describe, expect, it } from 'vitest'
import type { ChatEngineToolResult } from '../../../../shared/chat-engine-types'
import { bashModel } from './chat-bash-model'
import { DIFF_PREVIEW_LINES, toolDiffModel } from './chat-tool-diff-model'
import type { ChatToolItem } from './chat-tool-input'
import { questionModel } from './chat-tool-question-model'
import { lookupToolRenderer } from './chat-tool-renderer-lookup'
import { toolRowModel } from './chat-tool-row-model'
import { todoModel } from './chat-tool-todo-model'

const tool = (
  name: string,
  input: unknown,
  status: ChatToolItem['status'] = 'done',
  result?: Partial<ChatEngineToolResult>
): ChatToolItem => ({
  kind: 'tool',
  id: 'toolu_1',
  name,
  input,
  status,
  ...(result ? { result: { text: '', isError: false, truncated: false, ...result } } : {})
})

describe('bashModel', () => {
  it('counts a non-zero exit as an error even when the CLI did not flag it', () => {
    const model = bashModel(
      tool('Bash', { command: 'npm test' }, 'done', { text: 'Exit code 2\nboom' })
    )
    expect(model.exit).toEqual({ code: 2, label: 'exit 2', ok: false })
    expect(model.isError).toBe(true)
  })

  it('trusts the CLI when it explains a non-zero code', () => {
    const model = bashModel(
      tool('Bash', { command: 'grep x f' }, 'done', {
        text: 'Exit code 1',
        exitInterpretation: 'No matches found'
      })
    )
    expect(model.exit).toMatchObject({ label: 'No matches found', ok: true })
    expect(model.isError).toBe(false)
  })

  it('has no exit while running or in the background', () => {
    expect(bashModel(tool('Bash', { command: 'ls' }, 'running')).exit).toBeNull()
    const background = bashModel(
      tool('Bash', { command: 'npm run dev' }, 'done', { backgroundTaskId: 'b1' })
    )
    expect(background).toMatchObject({ background: true, exit: null, isError: false })
  })

  it('falls back to the result text for output', () => {
    expect(bashModel(tool('Bash', { command: 'ls' }, 'done', { text: 'a\nb' })).stdout).toBe('a\nb')
  })
})

describe('toolDiffModel', () => {
  const lines = (count: number, prefix: string) =>
    Array.from({ length: count }, (_, index) => `${prefix}${index}`).join('\n')

  it('diffs a streaming Edit from its input, without line numbers', () => {
    const model = toolDiffModel(
      tool(
        'Edit',
        { file_path: '/a.css', old_string: 'height: 100vh;', new_string: 'height: 100dvh;' },
        'streaming'
      ),
      false
    )
    expect(model).toMatchObject({ live: true, additions: 1, deletions: 1, hiddenLines: 0 })
  })

  it('caps a collapsed diff and reports what it hid', () => {
    const item = tool('Write', { file_path: '/a.txt', content: lines(20, 'l') }, 'running')
    const collapsed = toolDiffModel(item, false)!
    expect(collapsed.rows.filter((row) => row.kind === 'line')).toHaveLength(DIFF_PREVIEW_LINES)
    expect(collapsed.hiddenLines).toBe(20 - DIFF_PREVIEW_LINES)
    expect(collapsed.additions).toBe(20)
    expect(toolDiffModel(item, true)!.hiddenLines).toBe(0)
  })

  it('switches to the CLI patch once it answers', () => {
    const model = toolDiffModel(
      tool('Edit', { old_string: 'a', new_string: 'b' }, 'done', {
        patch: [{ oldStart: 7, oldLines: 1, newStart: 7, newLines: 1, lines: ['-a', '+b'] }],
        additions: 1,
        deletions: 1
      }),
      false
    )
    expect(model?.live).toBe(false)
    expect(model?.rows.find((row) => row.kind === 'line')).toMatchObject({ oldNo: 7 })
  })

  it('joins every edit of a MultiEdit and ignores other tools', () => {
    const model = toolDiffModel(
      tool('MultiEdit', {
        edits: [
          { old_string: 'a', new_string: 'b' },
          { old_string: 'c', new_string: 'd' }
        ]
      }),
      false
    )
    expect(model).toMatchObject({ additions: 2, deletions: 2 })
    expect(toolDiffModel(tool('Read', {}), false)).toBeNull()
  })
})

describe('todoModel', () => {
  it('reads the checklist and skips half-streamed entries', () => {
    const model = todoModel({
      todos: [
        { content: 'Read', activeForm: 'Reading', status: 'completed' },
        { content: 'Edit', activeForm: 'Editing', status: 'in_progress' },
        { content: 'Ship' },
        { status: 'pending' }
      ]
    })
    expect(model.todos.map((todo) => todo.status)).toEqual(['completed', 'in_progress', 'pending'])
    expect(model.done).toBe(1)
    expect(model.active?.activeForm).toBe('Editing')
  })
})

describe('questionModel', () => {
  it('pairs each question with the answer the CLI wrote back', () => {
    const questions = questionModel(
      tool(
        'AskUserQuestion',
        {
          questions: [
            {
              question: 'Which colour?',
              header: 'Colour',
              multiSelect: false,
              options: [{ label: 'Blue', description: 'Calm' }, { label: 'Red' }]
            }
          ]
        },
        'done',
        { text: 'User has answered your questions: "Which colour?"="Blue". You can now continue.' }
      )
    )
    expect(questions).toEqual([
      {
        question: 'Which colour?',
        header: 'Colour',
        multiSelect: false,
        options: [
          { label: 'Blue', description: 'Calm' },
          { label: 'Red', description: null }
        ],
        answer: 'Blue'
      }
    ])
  })
})

describe('toolRowModel', () => {
  it('names the object of every call, relative to the chat folder', () => {
    expect(
      toolRowModel(tool('Read', { file_path: '/site/style.css', limit: 40 }), '/site')
    ).toMatchObject({
      verb: 'Read',
      object: 'style.css',
      meta: ['lines 1–40']
    })
    expect(
      toolRowModel(
        tool('Grep', { pattern: 'vh' }, 'done', { text: 'Found 3 files\na\nb\nc' }),
        null
      )
    ).toMatchObject({ object: '"vh"', meta: ['3 files'] })
    expect(toolRowModel(tool('Edit', { file_path: '/x.ts' }, 'awaiting-approval'), null).verb).toBe(
      'Edit'
    )
  })

  it('marks a failed Bash row as an error', () => {
    const row = toolRowModel(
      tool('Bash', { command: 'false' }, 'done', { text: 'Exit code 1' }),
      null
    )
    expect(row).toMatchObject({ verb: 'Ran', object: 'false', isError: true })
  })

  it('splits MCP names into server and tool', () => {
    expect(toolRowModel(tool('mcp__plugin_figma_figma__get_screenshot', {}), null)).toMatchObject({
      verb: 'figma:',
      object: 'get screenshot'
    })
  })
})

describe('lookupToolRenderer', () => {
  const registry = new Map([
    ['Bash', 'bash'],
    ['mcp__muster-sites__', 'muster'],
    ['mcp__', 'any-mcp']
  ])

  it.each([
    ['Bash', 'bash'],
    ['mcp__muster-sites__run_wp_cli', 'muster'],
    ['mcp__context7__query-docs', 'any-mcp'],
    ['Mystery', 'generic']
  ])('%s renders with %s', (name, expected) => {
    expect(lookupToolRenderer(registry, name, 'generic')).toBe(expected)
  })
})
