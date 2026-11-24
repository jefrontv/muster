import { nativeImage, type NativeImage } from 'electron'
import trayIcon from '../../../resources/tray/tray.png?asset'
import trayDarkIcon from '../../../resources/tray/tray-dark.png?asset'
import { normalizeAppIconId } from '../../shared/app-icon'

// Why: hand-fit small marks; scaling the 256px app icon to 16px blurs the 25-dot grid.
// The @1.25x to @3x siblings beside each file cover scaled Windows displays.
export function createTrayIconImage(appIcon: unknown): NativeImage {
  return nativeImage.createFromPath(
    normalizeAppIconId(appIcon) === 'dark' ? trayDarkIcon : trayIcon
  )
}
