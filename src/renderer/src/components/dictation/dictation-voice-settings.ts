// Voice typing setup state, and where Chat mode and the Bots composer send someone who has not set it up.
import { useAppStore } from '@/store'
import type { VoiceSettings } from '../../../../shared/speech-types'

export function voiceDictationConfigured(voice: VoiceSettings | undefined): boolean {
  return voice?.enabled === true && !!voice.sttModel
}

export function openVoiceSettings(): void {
  const store = useAppStore.getState()
  store.openSettingsPage()
  store.setSettingsSearchQuery('voice')
}
