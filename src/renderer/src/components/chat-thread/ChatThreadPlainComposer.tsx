// Stand-in composer so the engine surface can be driven before the real one
// (pickers, attachments, takeovers) lands with the visual layer.

import { useState } from 'react'
import type React from 'react'
import { ArrowUp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import type { ChatThreadSendOutcome } from '../../../../shared/chat-thread-stream-types'

export function ChatThreadPlainComposer(props: {
  onSend: (text: string) => Promise<ChatThreadSendOutcome>
}): React.JSX.Element {
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const submit = async (): Promise<void> => {
    const message = text.trim()
    if (!message || sending) {
      return
    }
    setSending(true)
    try {
      if ((await props.onSend(message)) !== 'failed') {
        setText('')
      }
    } finally {
      setSending(false)
    }
  }
  const label = translate('components.chat-thread.send', 'Send')
  return (
    <div className="mx-auto w-[clamp(680px,64%,920px)] max-w-full px-4 pb-4">
      <div className="flex items-end gap-2 rounded-xl border border-border bg-card p-2 shadow-xs">
        <textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault()
              void submit()
            }
          }}
          rows={2}
          aria-label={translate('components.chat-thread.message', 'Message')}
          placeholder={translate('components.chat-thread.placeholder', 'Ask Claude')}
          className="min-h-10 flex-1 resize-none bg-transparent px-2 py-1.5 text-sm outline-none placeholder:text-muted-foreground"
        />
        <Button
          size="icon-sm"
          aria-label={label}
          disabled={!text.trim() || sending}
          onClick={() => void submit()}
          className="rounded-full"
        >
          <ArrowUp />
        </Button>
      </div>
    </div>
  )
}
