import { toast } from 'sonner'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import type { OpenFile } from '@/store/slices/editor'
import { canAutoSaveOpenFile, requestEditorFileSave } from './editor-autosave'

export type SaveAllPlan = { save: OpenFile[]; untitled: OpenFile[] }

export function planSaveAllDirtyFiles(openFiles: OpenFile[]): SaveAllPlan {
  const save: OpenFile[] = []
  const untitled: OpenFile[] = []
  const seen = new Set<string>()
  // Why: edit tabs first, so an edit tab wins over an unstaged-diff tab of the same file.
  const ordered = [...openFiles].sort(
    (a, b) => Number(a.mode !== 'edit') - Number(b.mode !== 'edit')
  )
  for (const file of ordered) {
    if (!file.isDirty) {
      continue
    }
    if (file.isUntitled) {
      untitled.push(file)
      continue
    }
    const key = `${file.worktreeId}:${file.filePath}`
    if (!canAutoSaveOpenFile(file) || seen.has(key)) {
      continue
    }
    seen.add(key)
    save.push(file)
  }
  return { save, untitled }
}

export async function saveAllDirtyEditorFiles(): Promise<void> {
  const { save, untitled } = planSaveAllDirtyFiles(useAppStore.getState().openFiles)
  const results = await Promise.allSettled(
    save.map((file) => requestEditorFileSave({ fileId: file.id }))
  )
  const failed = results.filter((result) => result.status === 'rejected')
  for (const result of failed) {
    console.error('[editor] save all: file save failed', (result as PromiseRejectedResult).reason)
  }
  const saved = results.length - failed.length
  if (failed.length > 0) {
    toast.error(
      translate(
        'auto.components.editor.saveAll.failed',
        '{{count}} files failed to save. Try again.',
        {
          count: failed.length
        }
      )
    )
  } else if (saved > 0) {
    toast.success(
      translate('auto.components.editor.saveAll.saved', 'Saved {{count}} files', { count: saved })
    )
  }
  if (untitled.length > 0) {
    toast.info(
      translate(
        'auto.components.editor.saveAll.untitledSkipped',
        '{{count}} new files need a name. Save them with Cmd/Ctrl+S.',
        { count: untitled.length }
      )
    )
  }
}
