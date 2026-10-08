import { toast } from 'sonner'
import { translate } from '@/i18n/i18n'
import { extractIpcErrorMessage } from '@/lib/ipc-error'

export type IndexWriteKind = 'stage' | 'unstage' | 'discard'

function indexWriteFailureTitle(kind: IndexWriteKind): string {
  switch (kind) {
    case 'stage':
      return translate(
        'auto.components.right.sidebar.SourceControl.indexWriteFailed.stage',
        "Couldn't stage changes"
      )
    case 'unstage':
      return translate(
        'auto.components.right.sidebar.SourceControl.indexWriteFailed.unstage',
        "Couldn't unstage changes"
      )
    case 'discard':
      return translate(
        'auto.components.right.sidebar.SourceControl.indexWriteFailed.discard',
        "Couldn't discard changes"
      )
  }
}

export function toastIndexWriteFailure(kind: IndexWriteKind, error: unknown): void {
  const message = extractIpcErrorMessage(error, '').trim()
  toast.error(indexWriteFailureTitle(kind), message ? { description: message } : undefined)
}
