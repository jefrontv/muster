// Drag-to-reorder list of thread rows. Drag state lives per list instance, so
// rows can only reorder within their own section (standalone list or one
// workspace); the moved thread persists a midpoint sortOrder.

import type React from 'react'
import { useState } from 'react'
import type { ChatThread } from '../../../../shared/chat-mode-types'
import { useAppStore } from '@/store'
import { ChatThreadRow, type ChatThreadRowDragProps } from './ChatThreadRow'
import { ORCA_INTERNAL_FILE_DRAG_TYPE } from '../../../../shared/native-file-drop'
import { computeDropSortOrder } from './chat-thread-ordering'

export function ChatThreadDragList({ threads }: { threads: ChatThread[] }): React.JSX.Element {
  const updateChatThread = useAppStore((s) => s.updateChatThread)
  const [dragId, setDragId] = useState<string | null>(null)
  const [over, setOver] = useState<{ id: string; after: boolean } | null>(null)

  const reset = (): void => {
    setDragId(null)
    setOver(null)
  }

  return (
    <ul className="space-y-px">
      {threads.map((thread) => {
        const dragProps: ChatThreadRowDragProps = {
          draggable: true,
          onDragStart: (event) => {
            setDragId(thread.id)
            // Why: preload's capture-phase native-file-drop guard swallows any
            // drop whose types lack this marker; without it drops never land.
            event.dataTransfer.setData(ORCA_INTERNAL_FILE_DRAG_TYPE, thread.id)
            event.dataTransfer.effectAllowed = 'move'
          },
          onDragOver: (event) => {
            if (!dragId || dragId === thread.id) {
              return
            }
            event.preventDefault()
            event.dataTransfer.dropEffect = 'move'
            const rect = event.currentTarget.getBoundingClientRect()
            const after = event.clientY > rect.top + rect.height / 2
            setOver((current) =>
              current?.id === thread.id && current.after === after
                ? current
                : { id: thread.id, after }
            )
          },
          onDragLeave: () => {
            setOver((current) => (current?.id === thread.id ? null : current))
          },
          onDrop: (event) => {
            event.preventDefault()
            if (dragId) {
              const placeAfter = over?.id === thread.id ? over.after : false
              const sortOrder = computeDropSortOrder(threads, dragId, thread.id, placeAfter)
              if (sortOrder !== null) {
                void updateChatThread(dragId, { sortOrder })
              }
            }
            reset()
          },
          onDragEnd: reset
        }
        return (
          <ChatThreadRow
            key={thread.id}
            thread={thread}
            dragProps={dragProps}
            isDragging={dragId === thread.id}
            dropEdge={over?.id === thread.id ? (over.after ? 'below' : 'above') : null}
          />
        )
      })}
    </ul>
  )
}
