// Chat spawns Claude by argv, which is unverified on Windows, so Chat stays off there for now.
export function chatModeSupported(
  userAgent: string = typeof navigator === 'undefined' ? '' : navigator.userAgent
): boolean {
  return !userAgent.includes('Windows')
}
