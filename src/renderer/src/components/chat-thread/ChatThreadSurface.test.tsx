// @vitest-environment happy-dom

// Plays a recorded Claude Code session (CLI 2.1.303) through the real engine
// and draws it: live through patches, and from a fresh snapshot afterwards.

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { act, cleanup, render } from '@testing-library/react'
import type React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ChatEnginePatch } from '../../../../shared/chat-engine-types'
import { ChatEngine } from '../../../../main/chat-mode/engine/chat-engine'
import type { Rec } from '../../../../main/chat-mode/engine/chat-engine-records'
import {
  createChatEngineThreadStore,
  replaceChatEngineThreadStore
} from './chat-engine-thread-store'
import { ChatThreadSurface } from './ChatThreadSurface'
import type { ChatToolRow } from './ChatToolRow'

const markdownRenders: string[] = []
vi.mock('@/components/sidebar/CommentMarkdown', () => ({
  default: (props: { content: string }): React.JSX.Element => {
    markdownRenders.push(props.content)
    return <div data-markdown>{props.content}</div>
  }
}))
vi.mock('@/components/native-chat/NativeChatHighlightedCode', () => ({
  useCodeThemeClass: () => ''
}))
const toolRenders: string[] = []
vi.mock('./ChatToolRow', async (importOriginal) => {
  const actual = await importOriginal<{ ChatToolRow: typeof ChatToolRow }>()
  return {
    ChatToolRow: (props: Parameters<typeof actual.ChatToolRow>[0]) => {
      toolRenders.push(props.item.id)
      return actual.ChatToolRow(props)
    }
  }
})

const FIXTURE = resolve('src/main/chat-mode/engine/__fixtures__/claude-2.1.303-read-edit.ndjson')
const RECORDS: Rec[] = readFileSync(FIXTURE, 'utf-8')
  .split('\n')
  .filter(Boolean)
  .map((line) => JSON.parse(line) as Rec)
const PROMPT = 'Read style.css, then change 100vh to 100dvh in it. Reply with one short sentence.'

type Step = { user: true } | { record: Rec }
const STEPS: Step[] = (() => {
  const echo = RECORDS.findIndex((record) => record.type === 'user')
  return [
    ...RECORDS.slice(0, echo).map((record) => ({ record })),
    { user: true as const },
    ...RECORDS.slice(echo).map((record) => ({ record }))
  ]
})()

function play(engine: ChatEngine, step: Step): void {
  if ('user' in step) {
    engine.userMessage('t', { id: 'rec-user-1', text: PROMPT, imageCount: 0, steer: false })
  } else {
    engine.ingest('t', step.record)
  }
}

function mount(engine: ChatEngine) {
  const frames: (() => void)[] = []
  let onPatch: (patch: ChatEnginePatch) => void = () => undefined
  replaceChatEngineThreadStore(
    createChatEngineThreadStore({
      // IPC structured-clones both directions; in-process objects would hide lost identity.
      api: {
        subscribe: async (threadId) =>
          structuredClone(
            await engine.subscribe(threadId, {
              id: 1,
              send: (_channel, patch) => onPatch(structuredClone(patch) as ChatEnginePatch),
              isDestroyed: () => false
            })
          ),
        unsubscribe: async () => undefined,
        onPatch: (callback) => {
          onPatch = callback
          return () => undefined
        }
      },
      scheduleFrame: (callback) => frames.push(callback)
    })
  )
  const view = render(<ChatThreadSurface threadId="t" />)
  // Engine flush timer, then the store's frame.
  const settle = async (): Promise<void> => {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60)
      frames.splice(0).forEach((callback) => callback())
    })
  }
  return { view, settle }
}

// useId values depend on mount order across roots; they are not content.
const markup = (element: HTMLElement): string =>
  element.innerHTML.replace(/ (id|aria-controls)="[^"]*"/g, '')

describe('ChatThreadSurface over a recorded session', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    markdownRenders.length = 0
    toolRenders.length = 0
  })
  afterEach(() => {
    cleanup()
    replaceChatEngineThreadStore(null)
    vi.useRealTimers()
  })

  it('draws the same transcript live and from history', async () => {
    const live = new ChatEngine({ now: () => 1_000 })
    const { view, settle } = mount(live)
    await settle()
    for (const step of STEPS) {
      play(live, step)
      await settle()
    }
    const liveMarkup = markup(view.container)
    expect(view.container.textContent).toContain('Read')
    expect(view.container.textContent).toContain('style.css')
    cleanup()

    const history = new ChatEngine({ now: () => 1_000 })
    for (const step of STEPS) {
      play(history, step)
    }
    const fresh = mount(history)
    await fresh.settle()
    expect(markup(fresh.view.container)).toBe(liveMarkup)
  })

  it('re-renders only the streaming block when a token lands', async () => {
    const engine = new ChatEngine({ now: () => 1_000 })
    const { settle } = mount(engine)
    await settle()
    const lastDelta = STEPS.findLastIndex(
      (step) =>
        'record' in step &&
        step.record.type === 'stream_event' &&
        (step.record.event as { delta?: { type?: string } })?.delta?.type === 'text_delta'
    )
    expect(lastDelta).toBeGreaterThan(-1)
    for (const step of STEPS.slice(0, lastDelta)) {
      play(engine, step)
    }
    await settle()
    // The counters are wired: the earlier steps drew tool rows and prose.
    expect(new Set(toolRenders).size).toBe(2)
    expect(markdownRenders.length).toBeGreaterThan(0)
    const before = markdownRenders.at(-1)
    markdownRenders.length = 0
    toolRenders.length = 0

    play(engine, STEPS[lastDelta]!)
    await settle()
    expect(toolRenders).toEqual([])
    expect(markdownRenders).toHaveLength(1)
    expect(markdownRenders[0]!.length).toBeGreaterThan(before!.length)
  })
})
