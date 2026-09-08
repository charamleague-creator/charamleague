import {
  type DocumentData,
  type QueryDocumentSnapshot,
  type Timestamp,
  type WriteBatch,
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
} from 'firebase/firestore'
import { auth, db } from '@/lib/firebase'
import type { AdminLogEntry } from './types'

function logCol() {
  return collection(db, 'adminActivityLog')
}

function toEntry(snap: QueryDocumentSnapshot<DocumentData>): AdminLogEntry {
  const data = snap.data()
  const createdAt = data.createdAt as Timestamp | undefined
  return {
    id: snap.id,
    actorUid: data.actorUid,
    actorEmail: data.actorEmail,
    action: data.action,
    details: data.details ?? {},
    createdAtMs: createdAt ? createdAt.toMillis() : null,
  }
}

export function subscribeAdminLog(onChange: (entries: AdminLogEntry[]) => void) {
  const q = query(logCol(), orderBy('createdAt', 'desc'))
  return onSnapshot(q, (snap) => onChange(snap.docs.map(toEntry)))
}

/**
 * ต่อเข้ากับ writeBatch ที่มีอยู่แล้วของฟังก์ชัน admin action อื่นๆ (log กิจกรรมแอดมิน ตามข้อ 5.6)
 * ใช้ serverTimestamp เสมอ กัน client ปลอมเวลาได้
 */
export function buildAdminLogWrite(
  actorUid: string,
  actorEmail: string,
  action: string,
  details: Record<string, unknown>,
): (batch: WriteBatch) => void {
  return (batch) =>
    batch.set(doc(logCol()), {
      actorUid,
      actorEmail,
      action,
      details,
      createdAt: serverTimestamp(),
    })
}

/**
 * ใช้ auth.currentUser ปัจจุบันเป็นผู้ทำ (เรียกจาก api.ts ของฟีเจอร์อื่นๆ ที่เป็น admin action)
 * ถ้าไม่มี currentUser (ไม่ควรเกิดในทางปฏิบัติ) จะไม่เขียน log แต่ไม่ทำให้ batch หลักพังไปด้วย —
 * เพราะ batch เป็น atomic ถ้า write log ตัวเดียวถูก rules ปฏิเสธ จะฉุดให้ action หลักที่สำคัญกว่าพังตามไปด้วย
 */
export function buildCurrentAdminLogWrite(
  action: string,
  details: Record<string, unknown>,
): (batch: WriteBatch) => void {
  const user = auth.currentUser
  if (!user) return () => {}
  return buildAdminLogWrite(user.uid, user.email ?? '(no email)', action, details)
}
