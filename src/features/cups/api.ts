import {
  type DocumentData,
  type QueryDocumentSnapshot,
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  writeBatch,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { generateBracket, updateCupMatchResult } from './bracket'
import type { Cup, CupMatch, CupType } from './types'

const BATCH_CHUNK_SIZE = 450

function cupsCol(leagueId: string) {
  return collection(db, 'leagues', leagueId, 'cups')
}
function cupMatchesCol(leagueId: string, cupId: string) {
  return collection(db, 'leagues', leagueId, 'cups', cupId, 'matches')
}
function matchId(round: number, slot: number) {
  return `r${round}_s${slot}`
}

function toCup(snap: QueryDocumentSnapshot<DocumentData>): Cup {
  const data = snap.data()
  return { id: snap.id, name: data.name, type: data.type, season: data.season, status: data.status }
}

function toCupMatch(snap: QueryDocumentSnapshot<DocumentData>): CupMatch {
  const data = snap.data()
  return {
    round: data.round,
    slot: data.slot,
    homeTeamId: data.homeTeamId,
    awayTeamId: data.awayTeamId,
    status: data.status,
    homeScore: data.homeScore,
    awayScore: data.awayScore,
    winnerTeamId: data.winnerTeamId,
  }
}

export function subscribeCups(leagueId: string, onChange: (cups: Cup[]) => void) {
  return onSnapshot(cupsCol(leagueId), (snap) => onChange(snap.docs.map(toCup)))
}

export function subscribeCupMatches(
  leagueId: string,
  cupId: string,
  onChange: (matches: CupMatch[]) => void,
) {
  return onSnapshot(cupMatchesCol(leagueId, cupId), (snap) =>
    onChange(snap.docs.map(toCupMatch).sort((a, b) => a.round - b.round || a.slot - b.slot)),
  )
}

async function commitInChunks(writes: Array<(batch: ReturnType<typeof writeBatch>) => void>) {
  for (let i = 0; i < writes.length; i += BATCH_CHUNK_SIZE) {
    const batch = writeBatch(db)
    for (const write of writes.slice(i, i + BATCH_CHUNK_SIZE)) write(batch)
    await batch.commit()
  }
}

async function getLeagueStatus(leagueId: string) {
  const snap = await getDoc(doc(db, 'leagues', leagueId))
  if (!snap.exists()) throw new Error('ไม่พบลีก')
  return snap.data().status as string
}

/** สร้างถ้วยใหม่ + bracket แพ้คัดออกทั้งชุด (ยังไม่รองรับบอลโลก — ดู OVERNIGHT-NOTES.md) */
export async function createCup(
  leagueId: string,
  input: { name: string; type: CupType; season: number; teamIds: string[] },
): Promise<string> {
  const status = await getLeagueStatus(leagueId)
  if (status !== 'in_season') throw new Error('สร้างถ้วยได้เฉพาะตอนลีกกำลังแข่งขันเท่านั้น')
  if (input.teamIds.length < 2) throw new Error('ต้องมีทีมอย่างน้อย 2 ทีม')

  const cupRef = doc(cupsCol(leagueId))
  const matches = generateBracket(input.teamIds)

  await commitInChunks([
    (batch) =>
      batch.set(cupRef, {
        name: input.name,
        type: input.type,
        season: input.season,
        status: 'in_progress',
      }),
    ...matches.map(
      (m) => (batch: ReturnType<typeof writeBatch>) =>
        batch.set(doc(cupMatchesCol(leagueId, cupRef.id), matchId(m.round, m.slot)), m),
    ),
  ])
  return cupRef.id
}

/**
 * รายงาน/แก้ผลนัดบอลถ้วย — เป็นสิทธิ์ admin เท่านั้นเสมอ (ต่างจากนัดลีกที่ manager รายงานเองได้)
 * เพราะการ propagate ผู้ชนะ + cascade ล้างรอบถัดไปต้องเขียนหลาย document พร้อมกันข้ามคู่ทีมที่ไม่เกี่ยวกับ
 * ผู้รายงานเลย (เช่นรอบชิงที่ทีมคนละคู่กับที่กำลังรายงาน) — Firestore Rules ตรวจสิทธิ์ข้ามแบบนี้ไม่ได้
 * ปลอดภัยเหมือนที่ทำกับตลาดซื้อขาย จึงให้ admin เป็นคนกดเสมอ
 */
export async function reportCupMatchResult(
  leagueId: string,
  cupId: string,
  round: number,
  slot: number,
  homeScore: number,
  awayScore: number,
): Promise<void> {
  const status = await getLeagueStatus(leagueId)
  if (status !== 'in_season') throw new Error('รายงานผลบอลถ้วยได้เฉพาะตอนลีกกำลังแข่งขันเท่านั้น')

  const matchesSnap = await getDocs(cupMatchesCol(leagueId, cupId))
  const before = matchesSnap.docs.map(toCupMatch)
  const after = updateCupMatchResult(before, round, slot, homeScore, awayScore)

  const beforeById = new Map(before.map((m) => [matchId(m.round, m.slot), m]))
  const writes: Array<(batch: ReturnType<typeof writeBatch>) => void> = []
  for (const m of after) {
    const id = matchId(m.round, m.slot)
    if (JSON.stringify(beforeById.get(id)) !== JSON.stringify(m)) {
      writes.push((batch) => batch.set(doc(cupMatchesCol(leagueId, cupId), id), m))
    }
  }

  const numRounds = Math.max(...after.map((m) => m.round))
  const final = after.find((m) => m.round === numRounds)
  writes.push((batch) =>
    batch.update(doc(db, 'leagues', leagueId, 'cups', cupId), {
      status: final?.winnerTeamId ? 'completed' : 'in_progress',
    }),
  )

  await commitInChunks(writes)
}
