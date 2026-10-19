import type React from 'react'
import { Check, Circle, CircleDot } from 'lucide-react'
import { cn } from '@/lib/utils'
import { todoModel } from './chat-tool-todo-model'
import type { ChatToolBodyProps } from './chat-tool-body-types'

const STATUS_ICON = { completed: Check, in_progress: CircleDot, pending: Circle } as const

export function ChatTodoBody({ item }: ChatToolBodyProps): React.JSX.Element | null {
  const { todos } = todoModel(item.input)
  if (todos.length === 0) {
    return null
  }
  return (
    <ul className="space-y-0.5 py-1 pl-[22px] text-[13px]">
      {todos.map((todo, index) => {
        const Icon = STATUS_ICON[todo.status]
        return (
          <li
            key={index}
            className={cn(
              'flex items-start gap-2',
              todo.status === 'completed' ? 'text-muted-foreground line-through' : 'text-foreground'
            )}
          >
            <Icon className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            <span>{todo.status === 'in_progress' ? todo.activeForm : todo.content}</span>
          </li>
        )
      })}
    </ul>
  )
}
