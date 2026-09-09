import { collection, doc, getDoc, getDocs } from 'firebase/firestore'
import { db } from '@/lib/firebase'

async function colToArray(path: string[]): Promise<Array<Record<string, unknown>>> {
  const snap = await getDocs(collection(db, path.join('/')))
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
}

/**
 * ดาวน์โหลดข้อมูลทั้งหมดเป็นไฟล์สำรอง (เอกสาร phase 07 ข้อ 3) — อ่านทุก collection/subcollection
 * ที่มีในระบบ ไม่ต้องพึ่ง Cloud Functions ใดๆ (ทำได้ทั้งหมดจาก client เพราะ read เกือบทั้งหมด
 * เป็น public หรือ admin อ่านได้อยู่แล้ว) เหมาะสำหรับกดมือ ส่วน backup อัตโนมัติรายวันยังไม่ทำ
 * เพราะต้องสร้าง Cloud Scheduler + Functions ใหม่ (มีผลเรื่อง GCP cost — รอถามก่อน)
 */
export async function exportAllData(): Promise<Record<string, unknown>> {
  const leaguesSnap = await getDocs(collection(db, 'leagues'))
  const leagues = await Promise.all(
    leaguesSnap.docs.map(async (leagueDoc) => {
      const leagueId = leagueDoc.id
      const [teams, matches, auctionListings, tearRequests, transfers, cups] = await Promise.all([
        colToArray(['leagues', leagueId, 'teams']),
        colToArray(['leagues', leagueId, 'matches']),
        colToArray(['leagues', leagueId, 'auctionListings']),
        colToArray(['leagues', leagueId, 'tearRequests']),
        colToArray(['leagues', leagueId, 'transfers']),
        colToArray(['leagues', leagueId, 'cups']),
      ])

      const teamsWithSub = await Promise.all(
        teams.map(async (team) => {
          const [players, transactions] = await Promise.all([
            colToArray(['leagues', leagueId, 'teams', String(team.id), 'players']),
            colToArray(['leagues', leagueId, 'teams', String(team.id), 'transactions']),
          ])
          return { ...team, players, transactions }
        }),
      )

      const cupsWithMatches = await Promise.all(
        cups.map(async (cup) => {
          const cupMatches = await colToArray(['leagues', leagueId, 'cups', String(cup.id), 'matches'])
          return { ...cup, matches: cupMatches }
        }),
      )

      return {
        ...leagueDoc.data(),
        id: leagueId,
        teams: teamsWithSub,
        matches,
        auctionListings,
        tearRequests,
        transfers,
        cups: cupsWithMatches,
      }
    }),
  )

  const [hallOfFame, adminActivityLog, systemSnap] = await Promise.all([
    colToArray(['hallOfFame']),
    colToArray(['adminActivityLog']),
    getDoc(doc(db, 'system', 'appVersion')),
  ])

  return {
    exportedAt: new Date().toISOString(),
    leagues,
    hallOfFame,
    adminActivityLog,
    system: systemSnap.exists() ? { id: systemSnap.id, ...systemSnap.data() } : null,
  }
}

export function downloadAsJsonFile(data: unknown, filename: string): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
