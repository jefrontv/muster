// Local-database snapshot metadata, shared across main/preload/renderer.

export type SiteDbSnapshot = {
  id: string
  siteId: string
  dbName: string
  takenAt: number
  sizeBytes: number
  reason: 'pre-import' | 'manual'
}
