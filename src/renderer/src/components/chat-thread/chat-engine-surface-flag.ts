// Opt-in for the engine-drawn chat surface until it replaces NativeChatView in
// chat mode. Set from devtools: localStorage.setItem('muster:chat-engine-surface', '1').

const FLAG_KEY = 'muster:chat-engine-surface'

export function chatEngineSurfaceEnabled(): boolean {
  try {
    return localStorage.getItem(FLAG_KEY) === '1'
  } catch {
    return false
  }
}
