import {
  type DocumentData,
  type QueryDocumentSnapshot,
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { isFirstChampionshipForManager } from './helpers'
import type { HallOfFameEntry } from './types'

function hallOfFameCol() {
  return collection(db, 'hallOfFame')
}

function toEntry(snap: QueryDocumentSnapshot<DocumentData>): HallOfFameEntry {
  const data = snap.data()
  return {
    id: snap.id,
    category: data.category,
    season: data.season,
    leagueId: data.leagueId,
    teamId: data.teamId,
    teamName: data.teamName,
    managerUid: data.managerUid,
    managerName: data.managerName,
  }
}

export function subscribeHallOfFame(onChange: (entries: HallOfFameEntry[]) => void) {
  return onSnapshot(hallOfFameCol(), (snap) => onChange(snap.docs.map(toEntry)))
}

/**
 * บันทึกแชมป์ — เก็บ managerUid/managerName/teamName ณ ขณะบันทึกไว้เป็น snapshot เสมอ
 * (guideline #6 — ถ้าทีมเปลี่ยนผู้จัดการทีมในอนาคต ประวัตินี้ต้องไม่เปลี่ยนตามไปด้วย)
 * คืนค่า isFirstChampionship ให้ UI แสดงผลได้ (การแจกคูปองโบนัสจริงยังไม่ทำ — รอระบบเงิน)
 */
export async function addHallOfFameEntry(input: {
  category: HallOfFameEntry['category']
  season: number
  leagueId: string | null
  teamId: string | null
  teamName: string
  managerUid: string
  managerName: string
}): Promise<{ isFirstChampionship: boolean }> {
  const existingSnap = await getDocs(hallOfFameCol())
  const existing = existingSnap.docs.map(toEntry)
  const isFirstChampionship = isFirstChampionshipForManager(
    existing,
    input.managerUid,
    input.category,
  )

  await addDoc(hallOfFameCol(), input)
  return { isFirstChampionship }
}

export async function removeHallOfFameEntry(entryId: string): Promise<void> {
  await deleteDoc(doc(db, 'hallOfFame', entryId))
}
