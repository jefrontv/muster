// Muster Bots ships for macOS and Linux first; the bundled bots server is unverified on Windows.
export function botsSupported(
  userAgent: string = typeof navigator === 'undefined' ? '' : navigator.userAgent
): boolean {
  return !userAgent.includes('Windows')
}
