// Images dropped from Finder onto a page. Preload consumes native drops and hands over paths.
import type { Editor } from '@tiptap/react'
import { useEffect } from 'react'
import { toast } from 'sonner'
import { NATIVE_FILE_DROP_TARGET } from '../../../../shared/native-file-drop'
import { insertPageImageRef } from './project-pages-files'

export const PAGE_FILE_DROP_PROPS = {
  'data-native-file-drop-target': NATIVE_FILE_DROP_TARGET.projectPage
}

export function useProjectPageFileDrop(liveEditor: () => Editor | null, scopeKey: string): void {
  useEffect(
    () =>
      window.api.ui.onFileDrop((payload) => {
        const editor = liveEditor()
        if (payload.target !== NATIVE_FILE_DROP_TARGET.projectPage || !editor) {
          return
        }
        void window.api.projectPages.attachPaths(scopeKey, payload.paths).then((result) => {
          if (!result.ok) {
            toast.error(result.message)
            return
          }
          result.value.forEach((ref) => insertPageImageRef(editor, ref))
        })
      }),
    // liveEditor reads a ref, so it never needs to re-subscribe.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scopeKey]
  )
}
