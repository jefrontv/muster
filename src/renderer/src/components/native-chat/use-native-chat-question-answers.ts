// Answer state for an AskUserQuestion prompt, shared by the docked and seated
// question cards so both resolve picks and free text the same way.

import { useState } from 'react'
import type { AskAnswerSelection, AskPrompt, AskQuestion } from './native-chat-interactive-prompt'

export type NativeChatQuestionAnswers = {
  index: number
  total: number
  isLast: boolean
  question: AskQuestion
  selections: number[][]
  otherText: string[]
  setIndex: (index: number) => void
  setOther: (questionIndex: number, value: string) => void
  pickOption: (optionIndex: number) => void
  answerFor: (questionIndex: number) => string
  currentAnswered: boolean
  /** Enter / the docked trailing action: advance, or submit on the last question. */
  confirm: (fromKeyboard?: boolean) => void
  /** Seated Skip: drop this question's answer, then advance or finish. */
  skip: () => void
}

export function useNativeChatQuestionAnswers({
  prompt,
  onAnswer,
  onCancel
}: {
  prompt: AskPrompt
  onAnswer: (selections: AskAnswerSelection[]) => void
  onCancel: () => void
}): NativeChatQuestionAnswers {
  const [index, setIndexState] = useState(0)
  // Keep option identity by index: labels are display text and are not guaranteed
  // unique, while Claude's selector commits the numbered row (STA-1860).
  const [selections, setSelections] = useState<number[][]>(() => prompt.questions.map(() => []))
  const [otherText, setOtherText] = useState<string[]>(() => prompt.questions.map(() => ''))

  const total = prompt.questions.length
  const isLast = index === total - 1
  const question = prompt.questions[index]!

  const setIndex = (next: number): void => setIndexState(Math.max(0, Math.min(next, total - 1)))

  const setOther = (qi: number, value: string): void => {
    setOtherText((prev) => {
      const next = [...prev]
      next[qi] = value
      return next
    })
  }

  // The resolved answer for a question: picked labels plus any typed free-text.
  const resolve = (qi: number, sel: number[][], oth: string[]): string => {
    const q = prompt.questions[qi]
    const picked = (sel[qi] ?? [])
      .map((optionIndex) => q?.options[optionIndex]?.label ?? '')
      .filter((label) => label.length > 0)
    const other = (oth[qi] ?? '').trim()
    return [...picked, ...(other ? [other] : [])].join(', ')
  }
  const answerFor = (qi: number): string => resolve(qi, selections, otherText)

  const submitAll = (sel: number[][], oth: string[]): boolean => {
    const resolved: AskAnswerSelection[] = prompt.questions.map((_, i) => {
      return { indices: [...(sel[i] ?? [])], other: (oth[i] ?? '').trim() }
    })
    const anyAnswered = resolved.some((s) => s.indices.length > 0 || (s.other ?? '').length > 0)
    if (anyAnswered) {
      onAnswer(resolved)
    }
    return anyAnswered
  }

  // Selecting only highlights the row; submitting is an explicit step, since
  // auto-submitting on the first click dismissed the card before any feedback.
  const pickOption = (optionIndex: number): void => {
    setSelections((prev) => {
      const next = prev.map((s) => [...s])
      const cur = next[index] ?? []
      if (question.multiSelect) {
        next[index] = cur.includes(optionIndex)
          ? cur.filter((pickedIndex) => pickedIndex !== optionIndex)
          : [...cur, optionIndex].sort((a, b) => a - b)
      } else {
        next[index] = cur.includes(optionIndex) ? [] : [optionIndex]
      }
      return next
    })
  }

  // Non-final questions just advance, so skipping one never discards the others.
  // On the last one an explicit click with nothing answered dismisses, but a
  // reflexive Enter in the empty field is a no-op so it can't throw the prompt away.
  const finish = (sel: number[][], oth: string[], fromKeyboard: boolean): void => {
    if (!isLast) {
      setIndex(index + 1)
      return
    }
    if (!submitAll(sel, oth) && !fromKeyboard) {
      onCancel()
    }
  }

  const confirm = (fromKeyboard = false): void => finish(selections, otherText, fromKeyboard)

  const skip = (): void => {
    const sel = selections.map((s, i) => (i === index ? [] : s))
    const oth = otherText.map((t, i) => (i === index ? '' : t))
    setSelections(sel)
    setOtherText(oth)
    finish(sel, oth, false)
  }

  return {
    index,
    total,
    isLast,
    question,
    selections,
    otherText,
    setIndex,
    setOther,
    pickOption,
    answerFor,
    currentAnswered: answerFor(index).length > 0,
    confirm,
    skip
  }
}
