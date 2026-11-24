// Paste a Mermaid flowchart and get editable shapes and connectors.
import type { Graph } from '@maxgraph/core'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { translate } from '@/i18n/i18n'
import { parseMermaidFlowchart } from '../../../../shared/project-pages-diagram-mermaid'
import { insertMermaid } from './project-pages-diagram-mermaid-insert'

const t = (key: string, fallback: string): string =>
  translate(`auto.components.projectPages.diagram.${key}`, fallback)

const EXAMPLE =
  'flowchart LR\n  A[Request] --> B{Approved?}\n  B -->|yes| C[Ship]\n  B -->|no| D[Revise]'

/** Inserts Mermaid text; returns an error message instead of throwing. */
export function insertMermaidText(graph: Graph, text: string): string | null {
  try {
    insertMermaid(graph, parseMermaidFlowchart(text))
    return null
  } catch (err) {
    return err instanceof Error ? err.message : String(err)
  }
}

export function ProjectPageDiagramMermaidDialog(props: {
  graph: Graph
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const insert = (): void => {
    const problem = insertMermaidText(props.graph, text)
    setError(problem)
    if (!problem) {
      setText('')
      props.onOpenChange(false)
    }
  }
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('mermaidTitle', 'Insert from Mermaid')}</DialogTitle>
          <DialogDescription>
            {t('mermaidHint', 'Paste a flowchart. It becomes shapes you can move and edit.')}
          </DialogDescription>
        </DialogHeader>
        <Textarea
          value={text}
          rows={10}
          className="font-mono text-xs"
          placeholder={EXAMPLE}
          onChange={(event) => setText(event.target.value)}
        />
        {error ? <p className="text-xs text-destructive">{error}</p> : null}
        <DialogFooter>
          <Button variant="ghost" onClick={() => props.onOpenChange(false)}>
            {t('cancel', 'Cancel')}
          </Button>
          <Button disabled={!text.trim()} onClick={insert}>
            {t('insert', 'Insert')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
