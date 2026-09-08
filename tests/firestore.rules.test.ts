import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing'
import { readFileSync } from 'node:fs'
import { deleteDoc, doc, getDoc, setDoc, updateDoc } from 'firebase/firestore'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

let testEnv: RulesTestEnvironment

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'demo-charam-league',
    firestore: {
      rules: readFileSync('firestore.rules', 'utf8'),
      host: '127.0.0.1',
      port: 8080,
    },
  })
})

afterAll(async () => {
  await testEnv.cleanup()
})

beforeEach(async () => {
  await testEnv.clearFirestore()
})

describe('leagues/{leagueId}', () => {
  it('อ่านได้แม้ไม่ login', async () => {
    const unauth = testEnv.unauthenticatedContext()
    await assertSucceeds(getDoc(doc(unauth.firestore(), 'leagues/superleague')))
  })

  it('เขียนไม่ได้ถ้าไม่ login', async () => {
    const unauth = testEnv.unauthenticatedContext()
    await assertFails(
      setDoc(doc(unauth.firestore(), 'leagues/superleague'), { status: 'in_season' }),
    )
  })

  it('เขียนไม่ได้ถ้า login แต่ role ไม่ใช่ admin', async () => {
    const manager = testEnv.authenticatedContext('manager-1', { role: 'manager' })
    await assertFails(
      setDoc(doc(manager.firestore(), 'leagues/superleague'), { status: 'in_season' }),
    )
  })

  it('เขียนได้ถ้า login และ role เป็น admin', async () => {
    const admin = testEnv.authenticatedContext('admin-1', { role: 'admin' })
    await assertSucceeds(
      setDoc(doc(admin.firestore(), 'leagues/superleague'), { status: 'in_season' }),
    )
  })
})

describe('leagues/{leagueId}/teams/{teamId}', () => {
  it('อ่านได้แม้ไม่ login', async () => {
    const unauth = testEnv.unauthenticatedContext()
    await assertSucceeds(getDoc(doc(unauth.firestore(), 'leagues/superleague/teams/t1')))
  })

  it('manager เขียนไม่ได้', async () => {
    const manager = testEnv.authenticatedContext('manager-1', { role: 'manager' })
    await assertFails(
      setDoc(doc(manager.firestore(), 'leagues/superleague/teams/t1'), {
        name: 'Team 1',
        managerUid: 'manager-1',
        managerName: 'Manager 1',
        isForfeited: false,
      }),
    )
  })

  it('admin เขียนได้', async () => {
    const admin = testEnv.authenticatedContext('admin-1', { role: 'admin' })
    await assertSucceeds(
      setDoc(doc(admin.firestore(), 'leagues/superleague/teams/t1'), {
        name: 'Team 1',
        managerUid: 'manager-1',
        managerName: 'Manager 1',
        isForfeited: false,
      }),
    )
  })
})

describe('leagues/{leagueId}/teams/{teamId}/players/{playerId}', () => {
  it('อ่านได้แม้ไม่ login', async () => {
    const unauth = testEnv.unauthenticatedContext()
    await assertSucceeds(
      getDoc(doc(unauth.firestore(), 'leagues/superleague/teams/t1/players/p1')),
    )
  })

  it('manager (แม้เจ้าของทีม) เขียนไม่ได้', async () => {
    const manager = testEnv.authenticatedContext('manager-1', { role: 'manager' })
    await assertFails(
      setDoc(doc(manager.firestore(), 'leagues/superleague/teams/t1/players/p1'), {
        name: 'Player 1',
        position: 'MF',
        age: 20,
        joinedSeason: 1,
      }),
    )
  })

  it('admin เขียนได้', async () => {
    const admin = testEnv.authenticatedContext('admin-1', { role: 'admin' })
    await assertSucceeds(
      setDoc(doc(admin.firestore(), 'leagues/superleague/teams/t1/players/p1'), {
        name: 'Player 1',
        position: 'MF',
        age: 20,
        joinedSeason: 1,
      }),
    )
  })
})

describe('leagues/{leagueId}/matches/{matchId} — สร้าง fixture', () => {
  it('admin สร้าง match ได้', async () => {
    const admin = testEnv.authenticatedContext('admin-1', { role: 'admin' })
    await assertSucceeds(
      setDoc(doc(admin.firestore(), 'leagues/superleague/matches/m1'), {
        season: 1,
        matchday: 1,
        homeTeamId: 't1',
        awayTeamId: 't2',
        involvedManagerUids: ['manager-1', 'manager-2'],
        status: 'scheduled',
        homeScore: null,
        awayScore: null,
        winnerTeamId: null,
      }),
    )
  })

  it('manager สร้าง match เองไม่ได้ แม้จะใส่ตัวเองใน involvedManagerUids', async () => {
    const manager = testEnv.authenticatedContext('manager-1', { role: 'manager' })
    await assertFails(
      setDoc(doc(manager.firestore(), 'leagues/superleague/matches/m1'), {
        season: 1,
        matchday: 1,
        homeTeamId: 't1',
        awayTeamId: 't2',
        involvedManagerUids: ['manager-1', 'manager-2'],
        status: 'scheduled',
        homeScore: null,
        awayScore: null,
        winnerTeamId: null,
      }),
    )
  })
})

describe('leagues/{leagueId}/matches/{matchId} — รายงานผล', () => {
  const scheduledMatch = {
    season: 1,
    matchday: 1,
    homeTeamId: 't1',
    awayTeamId: 't2',
    involvedManagerUids: ['manager-1', 'manager-2'],
    status: 'scheduled',
    homeScore: null,
    awayScore: null,
    winnerTeamId: null,
  }

  async function seedScheduledMatch() {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'leagues/superleague/matches/m1'), scheduledMatch)
    })
  }

  it('manager ที่เกี่ยวข้องกรอกผลได้ (scheduled -> played แก้แค่ score/status)', async () => {
    await seedScheduledMatch()
    const manager = testEnv.authenticatedContext('manager-1', { role: 'manager' })
    await assertSucceeds(
      updateDoc(doc(manager.firestore(), 'leagues/superleague/matches/m1'), {
        status: 'played',
        homeScore: 2,
        awayScore: 1,
      }),
    )
  })

  it('manager ที่ไม่เกี่ยวข้องกรอกผลไม่ได้', async () => {
    await seedScheduledMatch()
    const outsider = testEnv.authenticatedContext('manager-3', { role: 'manager' })
    await assertFails(
      updateDoc(doc(outsider.firestore(), 'leagues/superleague/matches/m1'), {
        status: 'played',
        homeScore: 2,
        awayScore: 1,
      }),
    )
  })

  it('manager แก้ field อื่นพ่วงไปกับสกอร์ไม่ได้ (เช่นสวม homeTeamId ใหม่)', async () => {
    await seedScheduledMatch()
    const manager = testEnv.authenticatedContext('manager-1', { role: 'manager' })
    await assertFails(
      updateDoc(doc(manager.firestore(), 'leagues/superleague/matches/m1'), {
        status: 'played',
        homeScore: 2,
        awayScore: 1,
        homeTeamId: 't3',
      }),
    )
  })

  it('manager ตั้งสถานะเป็น bye เองไม่ได้ (สิทธิ์ admin เท่านั้น เช่นตอนจบฤดูกาล)', async () => {
    await seedScheduledMatch()
    const manager = testEnv.authenticatedContext('manager-1', { role: 'manager' })
    await assertFails(
      updateDoc(doc(manager.firestore(), 'leagues/superleague/matches/m1'), {
        status: 'bye',
        winnerTeamId: 't1',
      }),
    )
  })

  it('admin แก้ได้ทุกอย่างรวมถึงลบ', async () => {
    await seedScheduledMatch()
    const admin = testEnv.authenticatedContext('admin-1', { role: 'admin' })
    await assertSucceeds(
      updateDoc(doc(admin.firestore(), 'leagues/superleague/matches/m1'), {
        status: 'bye',
        winnerTeamId: 't1',
      }),
    )
    await assertSucceeds(deleteDoc(doc(admin.firestore(), 'leagues/superleague/matches/m1')))
  })
})

describe('deny-by-default', () => {
  it('collection ที่ไม่ได้กำหนด rule ไว้ ต้องถูกปฏิเสธเสมอ', async () => {
    const admin = testEnv.authenticatedContext('admin-1', { role: 'admin' })
    await assertFails(setDoc(doc(admin.firestore(), 'somethingUndefined/doc1'), { a: 1 }))
  })
})
