import { app } from 'electron'

type UpdateFileRef = { url: string }

// Why: electron-updater's MacUpdater treats Rosetta as arm64 too, so an x64 build on Apple Silicon can take arm64 assets.
export function isArm64MacHost(): boolean {
  return process.arch === 'arm64' || app.runningUnderARM64Translation === true
}

/**
 * Whether the manifest lists an asset electron-updater's MacUpdater.filterFilesForArch would keep.
 * arm64 assets carry "arm64" in the name; x64 ones carry no marker (e.g. Muster-1.14.9-mac.zip), so
 * never match on process.arch. arm64 hosts accept either slice.
 */
export function hasMacUpdateAssetForHost(
  files: readonly UpdateFileRef[] | undefined,
  isArm64Host: boolean
): boolean {
  // Why: no file list means we can't tell; leave the call to electron-updater.
  if (!files || files.length === 0 || isArm64Host) {
    return true
  }
  return files.some((file) => !file.url.includes('arm64'))
}
