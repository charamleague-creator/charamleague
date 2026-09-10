import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/Button'
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
    <div
      role="alert"
      style={{
        background: 'var(--warning-bg)',
        borderBottom: '1px solid var(--warning-border)',
        color: 'var(--warning)',
        padding: '10px 16px',
        textAlign: 'center',
      }}
    >
      มีเวอร์ชันใหม่ของระบบ{' '}
      <Button variant="primary" onClick={() => window.location.reload()}>
        รีเฟรชตอนนี้
      </Button>{' '}
      <Button variant="ghost" onClick={() => setDismissedMs(latestMs)}>
        ปิด
      </Button>
    </div>
  )
}
