import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing'
import { readFileSync } from 'node:fs'
import { setDoc, doc, getDoc } from 'firebase/firestore'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'

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
      setDoc(doc(unauth.firestore(), 'leagues/superleague'), { status: 'in-season' }),
    )
  })

  it('เขียนไม่ได้ถ้า login แต่ role ไม่ใช่ admin', async () => {
    const manager = testEnv.authenticatedContext('manager-1', { role: 'manager' })
    await assertFails(
      setDoc(doc(manager.firestore(), 'leagues/superleague'), { status: 'in-season' }),
    )
  })

  it('เขียนได้ถ้า login และ role เป็น admin', async () => {
    const admin = testEnv.authenticatedContext('admin-1', { role: 'admin' })
    await assertSucceeds(
      setDoc(doc(admin.firestore(), 'leagues/superleague'), { status: 'in-season' }),
    )
  })
})

describe('leagues/{leagueId}/matches/{matchId}', () => {
  it('manager ที่เกี่ยวข้องกับนัดนี้เขียนผลได้', async () => {
    const manager = testEnv.authenticatedContext('manager-1', { role: 'manager' })
    await assertSucceeds(
      setDoc(doc(manager.firestore(), 'leagues/superleague/matches/m1'), {
        involvedManagerUids: ['manager-1', 'manager-2'],
        goalEvents: [],
      }),
    )
  })

  it('manager ที่ไม่เกี่ยวข้องกับนัดนี้เขียนผลไม่ได้', async () => {
    const outsider = testEnv.authenticatedContext('manager-3', { role: 'manager' })
    await assertFails(
      setDoc(doc(outsider.firestore(), 'leagues/superleague/matches/m1'), {
        involvedManagerUids: ['manager-1', 'manager-2'],
        goalEvents: [],
      }),
    )
  })
})

describe('deny-by-default', () => {
  it('collection ที่ไม่ได้กำหนด rule ไว้ ต้องถูกปฏิเสธเสมอ', async () => {
    const admin = testEnv.authenticatedContext('admin-1', { role: 'admin' })
    await assertFails(setDoc(doc(admin.firestore(), 'somethingUndefined/doc1'), { a: 1 }))
  })
})
