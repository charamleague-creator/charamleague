import { type Timestamp, doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase'

function versionDoc() {
  return doc(db, 'system', 'appVersion')
}

/**
 * แจ้งเตือนเวอร์ชันใหม่ (ไฟล์สเปค 01, ข้อ 6) — ทุก client เปิดค้างไว้ subscribe เอกสารนี้แบบ realtime
 * เปรียบเทียบกับค่าตอน mount ครั้งแรก ถ้าเปลี่ยนแสดงว่ามีเวอร์ชันใหม่ (ไม่บังคับรีเฟรชทันที)
 */
export function subscribeAppVersion(onChange: (updatedAtMs: number | null) => void) {
  return onSnapshot(versionDoc(), (snap) => {
    const updatedAt = snap.data()?.updatedAt as Timestamp | undefined
    onChange(updatedAt ? updatedAt.toMillis() : null)
  })
}

/** แอดมินกดแจ้งเวอร์ชันใหม่เอง — ใช้ serverTimestamp() เป็นค่าเวอร์ชัน กันปัญหานาฬิกา client เพี้ยน */
export async function notifyNewVersion(): Promise<void> {
  await setDoc(versionDoc(), { updatedAt: serverTimestamp() })
}
