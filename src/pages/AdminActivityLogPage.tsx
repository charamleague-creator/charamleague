import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { subscribeAdminLog } from '@/features/adminLog/api'
import type { AdminLogEntry } from '@/features/adminLog/types'
import { notifyNewVersion } from '@/features/appVersion/api'
import { useAuth } from '@/hooks/useAuth'

export default function AdminActivityLogPage() {
  const { role, loading } = useAuth()
  const [entries, setEntries] = useState<AdminLogEntry[]>([])
  const [notified, setNotified] = useState(false)

  useEffect(() => {
    if (role !== 'admin') return
    return subscribeAdminLog(setEntries)
  }, [role])

  if (!loading && role !== 'admin') return <Navigate to="/" replace />

  async function handleNotifyNewVersion() {
    await notifyNewVersion()
    setNotified(true)
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
      <ul>
        {entries.length === 0 && <li>ยังไม่มีข้อมูล</li>}
        {entries.map((entry) => (
          <li key={entry.id}>
            {entry.createdAtMs ? new Date(entry.createdAtMs).toLocaleString('th-TH') : '(กำลังบันทึก)'}{' '}
            — {entry.actorEmail} — <strong>{entry.action}</strong> —{' '}
            {JSON.stringify(entry.details)}
          </li>
        ))}
      </ul>
    </main>
  )
}
