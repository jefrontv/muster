// Composer shown before the project has an Ask agent chat; sending the first message starts it.
import { ArrowUp } from 'lucide-react'
import type React from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { translate } from '@/i18n/i18n'

export function ProjectPagesAgentDraft({
  value,
  onChange,
  onSend,
  sending
}: {
  value: string
  onChange: (value: string) => void
  onSend: () => void
  sending: boolean
}): React.JSX.Element {
  const canSend = value.trim() !== '' && !sending
  return (
    <div className="flex min-h-0 flex-1 flex-col justify-end gap-3 p-3">
      <p className="text-sm text-muted-foreground">
        {translate(
          'auto.components.projectPages.agentDraftHint',
          'Ask about these pages, or ask the agent to write or edit one.'
        )}
      </p>
      <div className="relative">
        <Textarea
          autoFocus
          rows={3}
          value={value}
          disabled={sending}
          className="resize-none pr-11"
          aria-label={translate('auto.components.projectPages.agentDraftLabel', 'Message')}
          placeholder={translate(
            'auto.components.projectPages.agentDraftPlaceholder',
            'Ask agent…'
          )}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault()
              if (canSend) {
                onSend()
              }
            }
          }}
        />
        <Button
          size="icon-sm"
          className="absolute right-2 bottom-2"
          disabled={!canSend}
          aria-label={translate('auto.components.projectPages.agentDraftSend', 'Send')}
          onClick={onSend}
        >
          <ArrowUp className="size-4" />
        </Button>
      </div>
    </div>
  )
}
