// Which mac slices to package. Kept out of electron-builder.config.cjs: electron-builder validates
// that export against its schema and rejects any extra property, even a helper function.
function readMacTargetArchs(rawValue) {
  const archs = (rawValue ?? '')
    .split(',')
    .map((arch) => arch.trim())
    .filter(Boolean)
  for (const arch of archs) {
    if (arch !== 'x64' && arch !== 'arm64') {
      throw new Error(`MUSTER_MAC_ARCHS: unsupported mac arch '${arch}' (use x64, arm64)`)
    }
  }
  return archs.length > 0 ? archs : ['x64', 'arm64']
}

module.exports = { readMacTargetArchs }
