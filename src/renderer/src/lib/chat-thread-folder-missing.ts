// A chat's workspace folder was moved or deleted. Spawning there fails with a bare
// `spawn /bin/zsh ENOENT`, so the launcher checks first and the thread asks for the new location.

export class ChatThreadFolderMissingError extends Error {
  constructor(readonly folder: string) {
    super(`Folder not found: ${folder}`)
    this.name = 'ChatThreadFolderMissingError'
  }
}
