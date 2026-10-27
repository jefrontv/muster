export function getCliCommandNameForPlatform(platform: NodeJS.Platform): string {
  return platform === 'win32' ? 'muster.cmd' : 'muster'
}
