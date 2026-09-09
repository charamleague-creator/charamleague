import { useEffect, useRef, useState } from 'react'
import { subscribeAppVersion } from '@/features/appVersion/api'

export function VersionBanner() {
  const baselineRef = useRef<number | null>(null)
  const baselineSetRef = useRef(false)
  const [latestMs, setLatestMs] = useState<number | null>(null)
  const [dismissedMs, setDismissedMs] = useState<number | null>(null)

  useEffect(() => {
    return subscribeAppVersion((updatedAtMs) => {
      if (!baselineSetRef.current) {
        baselineRef.current = updatedAtMs
        baselineSetRef.current = true
      }
      setLatestMs(updatedAtMs)
    })
  }, [])

  const hasNewVersion =
    latestMs !== null && latestMs !== baselineRef.current && latestMs !== dismissedMs

  if (!hasNewVersion) return null

  return (
    <div role="alert" style={{ background: '#fff3b0', padding: '0.5rem 1rem', textAlign: 'center' }}>
      มีเวอร์ชันใหม่ของระบบ{' '}
      <button type="button" onClick={() => window.location.reload()}>
        รีเฟรชตอนนี้
      </button>{' '}
      <button type="button" onClick={() => setDismissedMs(latestMs)}>
        ปิด
      </button>
    </div>
  )
}
