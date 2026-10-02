// Mic state for a composer textarea: whether voice typing is set up, whether it is
// listening, and the toggle/hold actions. Shared by the chat hero and the thread composer.

import { useCallback, useState, type RefObject } from 'react'
import { useAppStore } from '@/store'
import { useNativeChatDictationActions } from './use-native-chat-dictation-actions'

export type NativeChatDictation = {
  configured: boolean
  isDictating: boolean
  isHoldMode: boolean
  toggle: () => void
  holdStart: () => void
  holdEnd: () => void
  openSetup: () => void
}

export function useNativeChatDictation(
  textareaRef: RefObject<HTMLTextAreaElement | null>
): NativeChatDictation {
  const [pressed, setPressed] = useState(false)
  const dictationState = useAppStore((store) => store.dictationState)
  const voiceSettings = useAppStore((store) => store.settings?.voice)
  const { toggleDictation, startHoldDictation, stopHoldDictation } = useNativeChatDictationActions({
    textareaRef,
    setDictationPressed: setPressed
  })
  const openSetup = useCallback(() => {
    const store = useAppStore.getState()
    store.openSettingsPage()
    store.setSettingsSearchQuery('voice')
  }, [])
  return {
    configured: voiceSettings?.enabled === true && !!voiceSettings.sttModel,
    isDictating:
      pressed ||
      dictationState === 'starting' ||
      dictationState === 'listening' ||
      dictationState === 'stopping',
    isHoldMode: voiceSettings?.dictationMode === 'hold',
    toggle: toggleDictation,
    holdStart: startHoldDictation,
    holdEnd: stopHoldDictation,
    openSetup
  }
}
