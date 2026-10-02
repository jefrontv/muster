// Folder paths shown in site setup, joined with the separator the root already uses so a Windows
// root (C:\Sites) does not read "C:\Sites/flex".

export function joinDisplayPath(root: string, name: string): string {
  const separator = root.includes('\\') && !root.includes('/') ? '\\' : '/'
  return `${root.replace(/[\\/]+$/, '')}${separator}${name}`
}
