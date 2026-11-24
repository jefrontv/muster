// Page images: saving pasted, dropped or picked files to the project, and showing files/...
// references, which the file editor's image loader cannot resolve.
import type { Editor } from '@tiptap/react'
import type { AnyExtension } from '@tiptap/core'
import { Selection, TextSelection, type Transaction } from '@tiptap/pm/state'
import { toast } from 'sonner'

const IMAGE = /^image\/(png|jpe?g|gif|webp|avif|svg\+xml)$/
const MAX_BYTES = 20 * 1024 * 1024
const urls = new Map<string, Promise<string | null>>()

export function pageFileUrl(scopeKey: string, ref: string): Promise<string | null> {
  if (/^(https?:|data:|blob:)/.test(ref)) {
    return Promise.resolve(ref)
  }
  const key = `${scopeKey}\n${ref}`
  let url = urls.get(key)
  if (!url) {
    url = window.api.projectPages
      .readFile(scopeKey, ref)
      .then((result) =>
        result.ok
          ? URL.createObjectURL(
              new Blob([new Uint8Array(result.value.bytes)], { type: result.value.type })
            )
          : null
      )
    urls.set(key, url)
  }
  return url
}

/** The rich editor's image node, drawn from the project's files instead of the file system. */
export function withPageImages(extension: AnyExtension, scopeKey: string): AnyExtension {
  return extension.extend({
    addNodeView() {
      return ({ node }) => {
        const img = document.createElement('img')
        img.className = 'page-image'
        img.draggable = false
        let src = ''
        const show = (next: typeof node): void => {
          img.alt = String(next.attrs.alt ?? '')
          if (next.attrs.src !== src) {
            src = String(next.attrs.src ?? '')
            void pageFileUrl(scopeKey, src).then((url) => {
              if (url && src === next.attrs.src) {
                img.src = url
              }
            })
          }
        }
        show(node)
        return {
          dom: img,
          update: (next) => {
            if (next.type.name !== 'image') {
              return false
            }
            show(next)
            return true
          }
        }
      }
    }
  })
}

export function imageFiles(list: FileList | null | undefined): File[] {
  return [...(list ?? [])].filter((file) => IMAGE.test(file.type))
}

/** Saves each image and inserts it at pos (or the cursor). */
export async function insertPageImages(
  editor: Editor,
  scopeKey: string,
  images: File[],
  pos?: number
): Promise<void> {
  for (const file of images) {
    if (file.size > MAX_BYTES) {
      toast.error(`${file.name} is over 20 MB.`)
      continue
    }
    const bytes = new Uint8Array(await file.arrayBuffer())
    const result = await window.api.projectPages.saveFile(scopeKey, file.name || 'image.png', bytes)
    if (!result.ok) {
      toast.error(result.message)
      continue
    }
    insertPageImageRef(editor, { file: result.value, alt: file.name }, pos)
  }
}

/** Inserts an already stored image at pos (or the cursor) and leaves the caret after it. */
export function insertPageImageRef(
  editor: Editor,
  ref: { file: string; alt: string },
  pos?: number
): void {
  const image = { type: 'image', attrs: { src: ref.file, alt: ref.alt } }
  const chain = editor.chain().focus()
  const inserted =
    pos === undefined ? chain.insertContent(image) : chain.insertContentAt(pos, image)
  inserted.command(({ tr }) => caretAfterImage(tr)).run()
}

// The inserted image ends up node-selected, so the next keystroke would replace it.
function caretAfterImage(tr: Transaction): boolean {
  const end = tr.selection.to
  const next = Selection.findFrom(tr.doc.resolve(end), 1, true)
  if (next) {
    tr.setSelection(next)
  } else {
    tr.insert(end, tr.doc.type.schema.nodes.paragraph.create())
    tr.setSelection(TextSelection.create(tr.doc, end + 1))
  }
  return true
}

export function pickPageImages(editor: Editor, scopeKey: string): void {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = 'image/*'
  input.multiple = true
  input.onchange = () => void insertPageImages(editor, scopeKey, imageFiles(input.files))
  input.click()
}
