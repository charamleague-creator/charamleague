import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { subscribeAdminLog } from '@/features/adminLog/api'
import type { AdminLogEntry } from '@/features/adminLog/types'
import { downloadAsJsonFile, exportAllData } from '@/features/admin/backup'
import { notifyNewVersion } from '@/features/appVersion/api'
import { useAuth } from '@/hooks/useAuth'

export default function AdminActivityLogPage() {
  const { role, loading } = useAuth()
  const [entries, setEntries] = useState<AdminLogEntry[]>([])
  const [notified, setNotified] = useState(false)
  const [backingUp, setBackingUp] = useState(false)
  const [backupError, setBackupError] = useState<string | null>(null)

  useEffect(() => {
    if (role !== 'admin') return
    return subscribeAdminLog(setEntries)
  }, [role])

  if (!loading && role !== 'admin') return <Navigate to="/" replace />

  async function handleNotifyNewVersion() {
    await notifyNewVersion()
    setNotified(true)
  }

  async function handleBackup() {
    setBackingUp(true)
    setBackupError(null)
    try {
      const data = await exportAllData()
      const stamp = new Date().toISOString().replace(/[:.]/g, '-')
      downloadAsJsonFile(data, `charam-league-backup-${stamp}.json`)
    } catch (err) {
      setBackupError(err instanceof Error ? err.message : String(err))
    } finally {
      setBackingUp(false)
    }
  }

  return (
    <main style={{ maxWidth: 800, margin: '2rem auto' }}>
      <h1>Log กิจกรรมแอดมิน</h1>
      <p>
        <button type="button" onClick={handleNotifyNewVersion}>
          แจ้งเวอร์ชันใหม่
        </button>{' '}
        {notified && 'แจ้งแล้ว — ผู้ใช้ที่เปิดหน้าค้างไว้จะเห็นแถบแจ้งเตือน'}
      </p>
      <p>
        <button type="button" onClick={handleBackup} disabled={backingUp}>
          {backingUp ? 'กำลังเตรียมไฟล์...' : 'ดาวน์โหลดข้อมูลสำรอง'}
        </button>
        {backupError && <span role="alert"> {backupError}</span>}
      </p>
      <table>
        <thead>
          <tr>
            <th>เวลา</th>
            <th>แอดมิน</th>
            <th>การกระทำ</th>
            <th>รายละเอียด</th>
          </tr>
        </thead>
        <tbody>
          {entries.length === 0 && (
            <tr>
              <td colSpan={4}>ยังไม่มีข้อมูล</td>
            </tr>
          )}
          {entries.map((entry) => (
            <tr key={entry.id}>
              <td>{entry.createdAtMs ? new Date(entry.createdAtMs).toLocaleString('th-TH') : '(กำลังบันทึก)'}</td>
              <td>{entry.actorEmail}</td>
              <td>{entry.action}</td>
              <td>{JSON.stringify(entry.details)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  )
}
