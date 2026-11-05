// Muster's side of the Bots dictation bridge: voice settings and DictationController from the app store.
import { useAppStore } from '@/store'
import { dispatchDictationControl } from '../dictation/dictation-control-events'
import { openVoiceSettings, voiceDictationConfigured } from '../dictation/dictation-voice-settings'
import type { BotsDictationHost } from './bots-dictation-bridge'

export const botsDictationHost: BotsDictationHost = {
  voice: () => {
    const voice = useAppStore.getState().settings?.voice
    return { configured: voiceDictationConfigured(voice), hold: voice?.dictationMode === 'hold' }
  },
  listening: () => useAppStore.getState().dictationState !== 'idle',
  subscribe: (onChange) =>
    useAppStore.subscribe((state, prev) => {
      if (
        state.dictationState !== prev.dictationState ||
        state.settings?.voice !== prev.settings?.voice
      ) {
        onChange()
      }
    }),
  openVoiceSettings,
  control: dispatchDictationControl
}
