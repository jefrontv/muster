// @vitest-environment happy-dom

import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NativeChatQuestionCard } from './NativeChatQuestionCard'
import { NativeChatSurfaceProvider } from './native-chat-surface-context'
import type { AskAnswerSelection, AskPrompt } from './native-chat-interactive-prompt'

let container: HTMLDivElement
let root: ReturnType<typeof createRoot>

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

const SEAT = {
  surface: 'chat' as const,
  cwd: null,
  openFile: null,
  chatThread: true,
  reportedModel: null,
  seat: true
}

function render(
  prompt: AskPrompt,
  onAnswer: (s: AskAnswerSelection[]) => void = () => {},
  onCancel: () => void = () => {}
): void {
  act(() => {
    root.render(
      <NativeChatSurfaceProvider value={SEAT}>
        <NativeChatQuestionCard prompt={prompt} onAnswer={onAnswer} onCancel={onCancel} />
      </NativeChatSurfaceProvider>
    )
  })
}

function buttonByText(text: string): HTMLButtonElement {
  const button = [...container.querySelectorAll('button')].find(
    (b) => b.textContent?.trim() === text
  )
  if (!button) {
    throw new Error(`button not found: ${text}`)
  }
  return button
}

function buttonByLabel(label: string): HTMLButtonElement {
  const button = container.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)
  if (!button) {
    throw new Error(`button not found: ${label}`)
  }
  return button
}

function click(button: Element): void {
  act(() => button.dispatchEvent(new MouseEvent('click', { bubbles: true })))
}

function clickOption(label: string): void {
  const row = [...container.querySelectorAll('button[aria-pressed]')].find((b) =>
    b.textContent?.includes(label)
  )
  if (!row) {
    throw new Error(`option not found: ${label}`)
  }
  click(row)
}

function typeAnswer(value: string): HTMLTextAreaElement {
  const textarea = container.querySelector('textarea')!
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!
    setter.call(textarea, value)
    textarea.dispatchEvent(new Event('input', { bubbles: true }))
  })
  return textarea
}

function pressEnter(target: Element, shiftKey = false): void {
  act(() => {
    target.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', shiftKey, bubbles: true }))
  })
}

const twoQuestions: AskPrompt = {
  questions: [
    {
      question: 'Do you prefer tabs or spaces?',
      header: 'Indent',
      multiSelect: false,
      options: [{ label: 'Tabs' }, { label: 'Spaces', description: 'Four of them' }]
    },
    {
      question: 'Which fruits?',
      multiSelect: true,
      options: [{ label: 'Apple' }, { label: 'Banana' }, { label: 'Cherry' }]
    }
  ]
}

describe('NativeChatQuestionCard in the seat', () => {
  it('drops the tab strip for a footer pager', () => {
    render(twoQuestions)

    expect(container.textContent).toContain('1 / 2')
    expect(container.textContent).not.toContain('Step 1')
    expect(container.querySelector('h3')?.textContent).toBe('Do you prefer tabs or spaces?')
    expect(container.textContent).toContain('Indent')

    click(buttonByLabel('Next question'))
    expect(container.textContent).toContain('2 / 2')
    expect(container.querySelector('h3')?.textContent).toBe('Which fruits?')
    expect(buttonByLabel('Next question').disabled).toBe(true)

    click(buttonByLabel('Previous question'))
    expect(container.textContent).toContain('1 / 2')
  })

  it('shows no pager for a single question', () => {
    render({ questions: [twoQuestions.questions[0]!] })
    expect(container.querySelector('button[aria-label="Next question"]')).toBeNull()
  })

  it('answers single and multi-select questions by index', () => {
    const onAnswer = vi.fn()
    render(twoQuestions, onAnswer)

    clickOption('Spaces')
    click(buttonByText('Next'))
    clickOption('Cherry')
    clickOption('Apple')
    click(buttonByText('Submit'))

    expect(onAnswer).toHaveBeenCalledWith([
      { indices: [1], other: '' },
      { indices: [0, 2], other: '' }
    ])
  })

  it('draws a real checkbox for multi-select rows that fills when checked', () => {
    render({ questions: [twoQuestions.questions[1]!] })
    const row = () =>
      [...container.querySelectorAll('button[aria-pressed]')].find((b) =>
        b.textContent?.includes('Banana')
      )!
    const box = () => row().querySelector('.size-3\\.5')!

    expect(box().className).toContain('border-chat-line-4')
    expect(box().querySelector('svg')).toBeNull()

    clickOption('Banana')

    expect(row().getAttribute('aria-pressed')).toBe('true')
    expect(row().className).toContain('border-chat-line-2')
    expect(box().className).toContain('bg-foreground')
    expect(box().querySelector('svg')).not.toBeNull()
  })

  it('shows an error instead of submitting an unanswered question', () => {
    const onAnswer = vi.fn()
    render({ questions: [twoQuestions.questions[0]!] }, onAnswer)

    click(buttonByText('Submit'))

    expect(onAnswer).not.toHaveBeenCalled()
    expect(container.querySelector('[role="status"]')?.textContent).toBe(
      'Select an option or type an answer.'
    )
  })

  it('skips a question without its pick, and dismisses when nothing was answered', () => {
    const onAnswer = vi.fn()
    const onCancel = vi.fn()
    render(twoQuestions, onAnswer, onCancel)

    clickOption('Tabs')
    click(buttonByText('Skip'))
    expect(container.textContent).toContain('2 / 2')
    click(buttonByText('Skip'))

    expect(onAnswer).not.toHaveBeenCalled()
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('carries free text, with Enter continuing and Shift+Enter left to the textarea', () => {
    const onAnswer = vi.fn()
    render({ questions: [twoQuestions.questions[0]!] }, onAnswer)

    const textarea = typeAnswer('four spaces')
    pressEnter(textarea, true)
    expect(onAnswer).not.toHaveBeenCalled()

    pressEnter(textarea)
    expect(onAnswer).toHaveBeenCalledWith([{ indices: [], other: 'four spaces' }])
  })

  it('ignores a reflexive Enter in the empty field on the last question', () => {
    const onAnswer = vi.fn()
    const onCancel = vi.fn()
    render({ questions: [twoQuestions.questions[0]!] }, onAnswer, onCancel)

    pressEnter(container.querySelector('textarea')!)

    expect(onAnswer).not.toHaveBeenCalled()
    expect(onCancel).not.toHaveBeenCalled()
  })

  it('gives an option-less question the block answer field', () => {
    const onAnswer = vi.fn()
    render(
      { questions: [{ question: 'Anything else?', multiSelect: false, options: [] }] },
      onAnswer
    )

    expect(container.querySelector('button[aria-pressed]')).toBeNull()
    expect(container.querySelector('.min-h-16 textarea')).not.toBeNull()
    typeAnswer('no')
    click(buttonByText('Submit'))
    expect(onAnswer).toHaveBeenCalledWith([{ indices: [], other: 'no' }])
  })

  it('minimises to the header and expands again', () => {
    render(twoQuestions)

    click(buttonByLabel('Collapse question'))

    expect(container.querySelector('button[aria-pressed]')).toBeNull()
    expect(container.querySelector('textarea')).toBeNull()
    expect(container.querySelector('h3')?.textContent).toBe('Do you prefer tabs or spaces?')
    expect(buttonByLabel('Expand question').getAttribute('aria-expanded')).toBe('false')

    click(buttonByLabel('Expand question'))
    expect(container.querySelectorAll('button[aria-pressed]')).toHaveLength(2)
  })

  it('closes through onCancel', () => {
    const onCancel = vi.fn()
    render(twoQuestions, () => {}, onCancel)
    click(buttonByLabel('Cancel'))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })
})
