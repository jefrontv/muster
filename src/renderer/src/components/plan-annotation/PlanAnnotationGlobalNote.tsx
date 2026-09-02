// Feedback about the plan as a whole, rather than any one passage.
//
// A dedicated box rather than window.prompt: prompt() is modal to the whole app, unstyled, and
// silently truncates multi-line input — none of which suits the note that usually carries the
// reviewer's actual verdict.

import type React from 'react'
import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'

export function PlanAnnotationGlobalNote({
  onCancel,
  onSave
}: {
  onCancel: () => void
  onSave: (body: string) => void
}): React.JSX.Element {
  const [body, setBody] = useState('')
  const textarea = useRef<HTMLTextAreaElement | null>(null)

  useEffect(() => {
    textarea.current?.focus()
  }, [])

  const save = (): void => {
    const text = body.trim()
    if (text.length > 0) {
      onSave(text)
    }
  }

  return (
    <div className="border-b border-border/60 bg-muted/20 px-4 py-3">
      <label className="mb-1.5 block text-[11px] font-medium text-muted-foreground">
        Comment on the whole plan
      </label>
      <textarea
        ref={textarea}
        value={body}
        onChange={(event) => setBody(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
            event.preventDefault()
            save()
          }
          if (event.key === 'Escape') {
            event.preventDefault()
            onCancel()
          }
        }}
        rows={3}
        placeholder="Overall direction, missing context, anything not tied to one passage…"
        className="block w-full resize-none rounded-md border border-input bg-background px-2.5 py-2 text-xs leading-relaxed outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 placeholder:text-muted-foreground/70"
      />
      <div className="mt-2 flex items-center justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button size="sm" disabled={body.trim().length === 0} onClick={save}>
          Add note
        </Button>
      </div>
    </div>
  )
}
