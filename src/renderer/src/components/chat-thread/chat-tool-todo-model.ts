// TodoWrite's checklist as the card draws it, tolerating a list still streaming in.

import type { ChatEngineTodo } from '../../../../shared/chat-engine-types'
import { inputList, inputRecord } from './chat-tool-input'

export type ChatTodoModel = { todos: ChatEngineTodo[]; done: number; active: ChatEngineTodo | null }

const STATUSES = new Set<ChatEngineTodo['status']>(['pending', 'in_progress', 'completed'])

export function todoModel(input: unknown): ChatTodoModel {
  const todos = inputList(input, 'todos').flatMap((entry): ChatEngineTodo[] => {
    const todo = inputRecord(entry)
    if (typeof todo.content !== 'string' || todo.content === '') {
      return []
    }
    const status = STATUSES.has(todo.status as ChatEngineTodo['status'])
      ? (todo.status as ChatEngineTodo['status'])
      : 'pending'
    const activeForm = typeof todo.activeForm === 'string' ? todo.activeForm : todo.content
    return [{ content: todo.content, activeForm, status }]
  })
  return {
    todos,
    done: todos.filter((todo) => todo.status === 'completed').length,
    active: todos.find((todo) => todo.status === 'in_progress') ?? null
  }
}
