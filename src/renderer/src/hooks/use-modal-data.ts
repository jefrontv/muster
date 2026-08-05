import { useAppStore } from '@/store'
import { getModalData, type ModalId, type ModalPayloads } from '@/store/slices/modal-payloads'

/** Payload for `modal`, narrowed to its declared shape, or null when a
 *  different modal is active. The selector returns the stored payload object
 *  itself (never a fresh one) so subscribers only re-render on real changes. */
export function useModalData<K extends ModalId>(modal: K): ModalPayloads[K] | null {
  return useAppStore((s) => getModalData(s, modal))
}
