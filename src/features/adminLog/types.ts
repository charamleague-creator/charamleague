export interface AdminLogEntry {
  id: string
  actorUid: string
  actorEmail: string
  action: string
  details: Record<string, unknown>
  createdAtMs: number | null
}
