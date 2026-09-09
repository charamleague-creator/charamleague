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

  it('manager สร้างทีมเองไม่ได้', async () => {
    const manager = testEnv.authenticatedContext('manager-1', { role: 'manager' })
    await assertFails(
      setDoc(doc(manager.firestore(), 'leagues/superleague/teams/t1'), {
        name: 'Team 1',
        managerUid: 'manager-1',
        managerName: 'Manager 1',
        isForfeited: false,
        balance: 100,
      }),
    )
  })

  it('admin สร้างได้', async () => {
    const admin = testEnv.authenticatedContext('admin-1', { role: 'admin' })
    await assertSucceeds(
      setDoc(doc(admin.firestore(), 'leagues/superleague/teams/t1'), {
        name: 'Team 1',
        managerUid: 'manager-1',
        managerName: 'Manager 1',
        isForfeited: false,
        balance: 100,
      }),
    )
  })

  async function seedTeams() {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'leagues/superleague/teams/t1'), {
        name: 'Team 1',
        managerUid: 'manager-1',
        managerName: 'Manager 1',
        isForfeited: false,
        balance: 10,
      })
      await setDoc(doc(context.firestore(), 'leagues/superleague/teams/t2'), {
        name: 'Team 2',
        managerUid: 'manager-2',
        managerName: 'Manager 2',
        isForfeited: false,
        balance: 10,
      })
    })
  }

  it('manager เจ้าของทีมเพิ่ม balance ตัวเองได้ (ย่อยนักเตะ)', async () => {
    await seedTeams()
    const manager = testEnv.authenticatedContext('manager-1', { role: 'manager' })
    await assertSucceeds(
      updateDoc(doc(manager.firestore(), 'leagues/superleague/teams/t1'), { balance: 12 }),
    )
  })

  it('manager เจ้าของทีมลด balance ตัวเองไม่ได้', async () => {
    await seedTeams()
    const manager = testEnv.authenticatedContext('manager-1', { role: 'manager' })
    await assertFails(
      updateDoc(doc(manager.firestore(), 'leagues/superleague/teams/t1'), { balance: 8 }),
    )
  })

  it('manager แก้ field อื่นพ่วงไปกับ balance ไม่ได้', async () => {
    await seedTeams()
    const manager = testEnv.authenticatedContext('manager-1', { role: 'manager' })
    await assertFails(
      updateDoc(doc(manager.firestore(), 'leagues/superleague/teams/t1'), {
        balance: 12,
        name: 'Hacked',
      }),
    )
  })

  it('manager ทีมอื่นเพิ่ม balance ของทีมนี้ไม่ได้', async () => {
    await seedTeams()
    const outsider = testEnv.authenticatedContext('manager-2', { role: 'manager' })
    await assertFails(
      updateDoc(doc(outsider.firestore(), 'leagues/superleague/teams/t1'), { balance: 12 }),
    )
  })

  it('admin ลด/แก้ balance ได้ตามปกติ', async () => {
    await seedTeams()
    const admin = testEnv.authenticatedContext('admin-1', { role: 'admin' })
    await assertSucceeds(
      updateDoc(doc(admin.firestore(), 'leagues/superleague/teams/t1'), { balance: 0 }),
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

  it('manager (แม้เจ้าของทีม) สร้าง/แก้ผู้เล่นไม่ได้', async () => {
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

  it('admin สร้างได้', async () => {
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

  async function seedTeamAndPlayer() {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'leagues/superleague/teams/t1'), {
        name: 'Team 1',
        managerUid: 'manager-1',
        managerName: 'Manager 1',
        isForfeited: false,
      })
      await setDoc(doc(context.firestore(), 'leagues/superleague/teams/t1/players/p1'), {
        name: 'Player 1',
        position: 'MF',
        age: 20,
        joinedSeason: 1,
      })
    })
  }

  it('manager ที่คุมทีมนี้เอง ลบผู้เล่นในทีมตัวเองได้ (ฉีกสัญญา)', async () => {
    await seedTeamAndPlayer()
    const manager = testEnv.authenticatedContext('manager-1', { role: 'manager' })
    await assertSucceeds(
      deleteDoc(doc(manager.firestore(), 'leagues/superleague/teams/t1/players/p1')),
    )
  })

  it('manager ทีมอื่น ลบผู้เล่นทีมนี้ไม่ได้', async () => {
    await seedTeamAndPlayer()
    const outsider = testEnv.authenticatedContext('manager-2', { role: 'manager' })
    await assertFails(
      deleteDoc(doc(outsider.firestore(), 'leagues/superleague/teams/t1/players/p1')),
    )
  })
})

describe('leagues/{leagueId}/teams/{teamId}/transactions/{txId}', () => {
  const txDoc = {
    type: 'income',
    category: 'sell_off',
    desc: 'ย่อยนักเตะ Player 1',
    amount: 2,
    season: 1,
  }

  async function seedTeams() {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'leagues/superleague/teams/t1'), {
        name: 'Team 1',
        managerUid: 'manager-1',
        managerName: 'Manager 1',
        isForfeited: false,
        balance: 10,
      })
    })
  }

  it('อ่านได้แม้ไม่ login', async () => {
    await seedTeams()
    const unauth = testEnv.unauthenticatedContext()
    await assertSucceeds(
      getDoc(doc(unauth.firestore(), 'leagues/superleague/teams/t1/transactions/tx1')),
    )
  })

  it('manager เจ้าของทีมสร้าง transaction ของทีมตัวเองได้ (ย่อยนักเตะ)', async () => {
    await seedTeams()
    const manager = testEnv.authenticatedContext('manager-1', { role: 'manager' })
    await assertSucceeds(
      setDoc(doc(manager.firestore(), 'leagues/superleague/teams/t1/transactions/tx1'), txDoc),
    )
  })

  it('manager ทีมอื่นสร้าง transaction แทนทีมนี้ไม่ได้', async () => {
    await seedTeams()
    const outsider = testEnv.authenticatedContext('manager-2', { role: 'manager' })
    await assertFails(
      setDoc(doc(outsider.firestore(), 'leagues/superleague/teams/t1/transactions/tx1'), txDoc),
    )
  })

  it('admin สร้างได้', async () => {
    await seedTeams()
    const admin = testEnv.authenticatedContext('admin-1', { role: 'admin' })
    await assertSucceeds(
      setDoc(doc(admin.firestore(), 'leagues/superleague/teams/t1/transactions/tx1'), txDoc),
    )
  })

  it('แก้/ลบไม่ได้แม้เป็น admin (immutable ledger)', async () => {
    await seedTeams()
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'leagues/superleague/teams/t1/transactions/tx1'), txDoc)
    })
    const admin = testEnv.authenticatedContext('admin-1', { role: 'admin' })
    await assertFails(
      updateDoc(doc(admin.firestore(), 'leagues/superleague/teams/t1/transactions/tx1'), {
        amount: 999,
      }),
    )
    await assertFails(
      deleteDoc(doc(admin.firestore(), 'leagues/superleague/teams/t1/transactions/tx1')),
    )
  })
})

describe('leagues/{leagueId}/tearRequests/{requestId}', () => {
  const tearDoc = {
    season: 1,
    requesterTeamId: 't1',
    requesterTeamName: 'Team 1',
    targetTeamId: 't2',
    targetTeamName: 'Team 2',
    playerId: 'p1',
    playerName: 'Player 1',
    status: 'pending',
  }

  it('อ่านได้แม้ไม่ login', async () => {
    const unauth = testEnv.unauthenticatedContext()
    await assertSucceeds(getDoc(doc(unauth.firestore(), 'leagues/superleague/tearRequests/r1')))
  })

  it('manager ที่ signed in ยื่นคำขอได้ (ทีมไหนก็ได้ รวมถึงยื่นแทนทีมอื่น)', async () => {
    const manager = testEnv.authenticatedContext('manager-3', { role: 'manager' })
    await assertSucceeds(
      setDoc(doc(manager.firestore(), 'leagues/superleague/tearRequests/r1'), tearDoc),
    )
  })

  it('ไม่ login ยื่นไม่ได้', async () => {
    const unauth = testEnv.unauthenticatedContext()
    await assertFails(
      setDoc(doc(unauth.firestore(), 'leagues/superleague/tearRequests/r1'), tearDoc),
    )
  })

  it('manager แก้สถานะ (ประมวลผล) เองไม่ได้ ต้องเป็น admin ตอนจบฤดูกาลเท่านั้น', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'leagues/superleague/tearRequests/r1'), tearDoc)
    })
    const manager = testEnv.authenticatedContext('manager-1', { role: 'manager' })
    await assertFails(
      updateDoc(doc(manager.firestore(), 'leagues/superleague/tearRequests/r1'), {
        status: 'success',
      }),
    )
  })

  it('admin แก้สถานะได้ (เปิดเผยผลตอนจบฤดูกาล)', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'leagues/superleague/tearRequests/r1'), tearDoc)
    })
    const admin = testEnv.authenticatedContext('admin-1', { role: 'admin' })
    await assertSucceeds(
      updateDoc(doc(admin.firestore(), 'leagues/superleague/tearRequests/r1'), {
        status: 'success',
      }),
    )
  })
})

describe('leagues/{leagueId}/transfers/{transferId}', () => {
  const transferDoc = {
    season: 1,
    type: 'auction',
    fromTeamId: 't1',
    toTeamId: 't2',
    playerId: 'p1',
    playerName: 'Player 1',
    price: 100,
  }

  it('อ่านได้แม้ไม่ login', async () => {
    const unauth = testEnv.unauthenticatedContext()
    await assertSucceeds(getDoc(doc(unauth.firestore(), 'leagues/superleague/transfers/x1')))
  })

  it('manager สร้างเองไม่ได้ (ต้องผ่าน completeSale ของ admin เท่านั้น)', async () => {
    const manager = testEnv.authenticatedContext('manager-1', { role: 'manager' })
    await assertFails(
      setDoc(doc(manager.firestore(), 'leagues/superleague/transfers/x1'), transferDoc),
    )
  })

  it('admin สร้างได้ แต่แก้/ลบไม่ได้ (immutable event log)', async () => {
    const admin = testEnv.authenticatedContext('admin-1', { role: 'admin' })
    await assertSucceeds(
      setDoc(doc(admin.firestore(), 'leagues/superleague/transfers/x1'), transferDoc),
    )
    await assertFails(
      updateDoc(doc(admin.firestore(), 'leagues/superleague/transfers/x1'), { price: 1 }),
    )
    await assertFails(deleteDoc(doc(admin.firestore(), 'leagues/superleague/transfers/x1')))
  })
})

describe('leagues/{leagueId}/auctionListings/{listingId}', () => {
  const listingDoc = {
    season: 1,
    sellerTeamId: 't1',
    sellerTeamName: 'Team 1',
    playerId: 'p1',
    playerName: 'Player 1',
    playerPosition: 'MF',
    playerAge: 20,
    startingPrice: 100,
    status: 'pending_approval',
    highestBid: null,
    highestBidderTeamId: null,
    highestBidderTeamName: null,
  }

  async function seedTeams() {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'leagues/superleague/teams/t1'), {
        name: 'Team 1',
        managerUid: 'manager-1',
        managerName: 'Manager 1',
        isForfeited: false,
      })
      await setDoc(doc(context.firestore(), 'leagues/superleague/teams/t2'), {
        name: 'Team 2',
        managerUid: 'manager-2',
        managerName: 'Manager 2',
        isForfeited: false,
      })
    })
  }

  it('ทีมผู้ขายสร้างรายการประมูลได้', async () => {
    await seedTeams()
    const seller = testEnv.authenticatedContext('manager-1', { role: 'manager' })
    await assertSucceeds(
      setDoc(doc(seller.firestore(), 'leagues/superleague/auctionListings/l1'), listingDoc),
    )
  })

  it('ทีมอื่นสร้างแทนไม่ได้', async () => {
    await seedTeams()
    const outsider = testEnv.authenticatedContext('manager-2', { role: 'manager' })
    await assertFails(
      setDoc(doc(outsider.firestore(), 'leagues/superleague/auctionListings/l1'), listingDoc),
    )
  })

  it('manager อนุมัติ/ปฏิเสธเองไม่ได้ (สิทธิ์ admin เท่านั้น)', async () => {
    await seedTeams()
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'leagues/superleague/auctionListings/l1'), listingDoc)
    })
    const seller = testEnv.authenticatedContext('manager-1', { role: 'manager' })
    await assertFails(
      updateDoc(doc(seller.firestore(), 'leagues/superleague/auctionListings/l1'), {
        status: 'open',
      }),
    )
  })

  async function seedOpenListing() {
    await seedTeams()
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'leagues/superleague/auctionListings/l1'), {
        ...listingDoc,
        status: 'open',
      })
    })
  }

  it('ทีมอื่น (ไม่ใช่ผู้ขาย) ประมูลได้ ถ้าราคาสูงกว่าราคาเริ่ม', async () => {
    await seedOpenListing()
    const bidder = testEnv.authenticatedContext('manager-2', { role: 'manager' })
    await assertSucceeds(
      updateDoc(doc(bidder.firestore(), 'leagues/superleague/auctionListings/l1'), {
        highestBid: 150,
        highestBidderTeamId: 't2',
        highestBidderTeamName: 'Team 2',
      }),
    )
  })

  it('ทีมผู้ขายประมูลนักเตะตัวเองไม่ได้', async () => {
    await seedOpenListing()
    const seller = testEnv.authenticatedContext('manager-1', { role: 'manager' })
    await assertFails(
      updateDoc(doc(seller.firestore(), 'leagues/superleague/auctionListings/l1'), {
        highestBid: 150,
        highestBidderTeamId: 't1',
        highestBidderTeamName: 'Team 1',
      }),
    )
  })

  it('ประมูลราคาเท่าราคาเริ่มได้ (บิดแรกเปิดที่ราคาตั้งได้)', async () => {
    await seedOpenListing()
    const bidder = testEnv.authenticatedContext('manager-2', { role: 'manager' })
    await assertSucceeds(
      updateDoc(doc(bidder.firestore(), 'leagues/superleague/auctionListings/l1'), {
        highestBid: 100,
        highestBidderTeamId: 't2',
        highestBidderTeamName: 'Team 2',
      }),
    )
  })

  it('ประมูลราคาต่ำกว่าราคาเริ่มไม่ได้', async () => {
    await seedOpenListing()
    const bidder = testEnv.authenticatedContext('manager-2', { role: 'manager' })
    await assertFails(
      updateDoc(doc(bidder.firestore(), 'leagues/superleague/auctionListings/l1'), {
        highestBid: 99,
        highestBidderTeamId: 't2',
        highestBidderTeamName: 'Team 2',
      }),
    )
  })

  it('บิดครั้งถัดไปต้องสูงกว่าบิดปัจจุบันจริง (เท่ากันไม่ได้)', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'leagues/superleague/auctionListings/l1'), {
        ...listingDoc,
        status: 'open',
        highestBid: 150,
        highestBidderTeamId: 't2',
        highestBidderTeamName: 'Team 2',
      })
    })
    await seedTeams()
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'leagues/superleague/teams/t3'), {
        name: 'Team 3',
        managerUid: 'manager-3',
        managerName: 'Manager 3',
        isForfeited: false,
      })
    })
    const bidder = testEnv.authenticatedContext('manager-3', { role: 'manager' })
    await assertFails(
      updateDoc(doc(bidder.firestore(), 'leagues/superleague/auctionListings/l1'), {
        highestBid: 150,
        highestBidderTeamId: 't3',
        highestBidderTeamName: 'Team 3',
      }),
    )
  })

  it('แก้ field อื่นพ่วงไปกับการประมูลไม่ได้', async () => {
    await seedOpenListing()
    const bidder = testEnv.authenticatedContext('manager-2', { role: 'manager' })
    await assertFails(
      updateDoc(doc(bidder.firestore(), 'leagues/superleague/auctionListings/l1'), {
        highestBid: 150,
        highestBidderTeamId: 't2',
        highestBidderTeamName: 'Team 2',
        startingPrice: 1,
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

describe('leagues/{leagueId}/cups/{cupId}', () => {
  it('อ่านได้แม้ไม่ login', async () => {
    const unauth = testEnv.unauthenticatedContext()
    await assertSucceeds(getDoc(doc(unauth.firestore(), 'leagues/superleague/cups/c1')))
  })

  it('manager สร้าง/แก้ถ้วยเองไม่ได้', async () => {
    const manager = testEnv.authenticatedContext('manager-1', { role: 'manager' })
    await assertFails(
      setDoc(doc(manager.firestore(), 'leagues/superleague/cups/c1'), {
        name: 'ถ้วยใหญ่',
        type: 'major',
        season: 1,
        status: 'in_progress',
      }),
    )
  })

  it('admin สร้างได้', async () => {
    const admin = testEnv.authenticatedContext('admin-1', { role: 'admin' })
    await assertSucceeds(
      setDoc(doc(admin.firestore(), 'leagues/superleague/cups/c1'), {
        name: 'ถ้วยใหญ่',
        type: 'major',
        season: 1,
        status: 'in_progress',
      }),
    )
  })
})

describe('leagues/{leagueId}/cups/{cupId}/matches/{matchId}', () => {
  const cupMatchDoc = {
    round: 1,
    slot: 0,
    homeTeamId: 't1',
    awayTeamId: 't2',
    status: 'scheduled',
    homeScore: null,
    awayScore: null,
    winnerTeamId: null,
  }

  it('อ่านได้แม้ไม่ login', async () => {
    const unauth = testEnv.unauthenticatedContext()
    await assertSucceeds(
      getDoc(doc(unauth.firestore(), 'leagues/superleague/cups/c1/matches/r1_s0')),
    )
  })

  it('manager (แม้เป็นทีมที่แข่งอยู่) รายงานผลเองไม่ได้ — ต่างจากนัดลีก', async () => {
    const manager = testEnv.authenticatedContext('manager-1', { role: 'manager' })
    await assertFails(
      setDoc(doc(manager.firestore(), 'leagues/superleague/cups/c1/matches/r1_s0'), cupMatchDoc),
    )
  })

  it('admin เขียนได้', async () => {
    const admin = testEnv.authenticatedContext('admin-1', { role: 'admin' })
    await assertSucceeds(
      setDoc(doc(admin.firestore(), 'leagues/superleague/cups/c1/matches/r1_s0'), cupMatchDoc),
    )
  })
})

describe('hallOfFame/{entryId}', () => {
  const entryDoc = {
    category: 'league_primary',
    season: 1,
    leagueId: 'superleague',
    teamId: 't1',
    teamName: 'Team 1',
    managerUid: 'manager-1',
    managerName: 'Manager 1',
  }

  it('อ่านได้แม้ไม่ login', async () => {
    const unauth = testEnv.unauthenticatedContext()
    await assertSucceeds(getDoc(doc(unauth.firestore(), 'hallOfFame/e1')))
  })

  it('manager สร้างเองไม่ได้', async () => {
    const manager = testEnv.authenticatedContext('manager-1', { role: 'manager' })
    await assertFails(setDoc(doc(manager.firestore(), 'hallOfFame/e1'), entryDoc))
  })

  it('admin สร้างได้', async () => {
    const admin = testEnv.authenticatedContext('admin-1', { role: 'admin' })
    await assertSucceeds(setDoc(doc(admin.firestore(), 'hallOfFame/e1'), entryDoc))
  })

  it('แก้ไม่ได้แม้เป็น admin (ผิดให้ลบสร้างใหม่ กันประวัติ snapshot ถูกแก้เงียบๆ)', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'hallOfFame/e1'), entryDoc)
    })
    const admin = testEnv.authenticatedContext('admin-1', { role: 'admin' })
    await assertFails(updateDoc(doc(admin.firestore(), 'hallOfFame/e1'), { season: 2 }))
  })

  it('admin ลบได้ (เผื่อกรอกผิด)', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'hallOfFame/e1'), entryDoc)
    })
    const admin = testEnv.authenticatedContext('admin-1', { role: 'admin' })
    await assertSucceeds(deleteDoc(doc(admin.firestore(), 'hallOfFame/e1')))
  })
})

describe('adminActivityLog/{logId}', () => {
  const logDoc = {
    actorUid: 'admin-1',
    actorEmail: 'admin1@test.local',
    action: 'end_season',
    details: { leagueId: 'superleague' },
  }

  it('manager อ่านไม่ได้ (ไม่ public)', async () => {
    const manager = testEnv.authenticatedContext('manager-1', { role: 'manager' })
    await assertFails(getDoc(doc(manager.firestore(), 'adminActivityLog/x1')))
  })

  it('admin อ่านได้', async () => {
    const admin = testEnv.authenticatedContext('admin-1', { role: 'admin' })
    await assertSucceeds(getDoc(doc(admin.firestore(), 'adminActivityLog/x1')))
  })

  it('admin เขียน log ของตัวเองได้', async () => {
    const admin = testEnv.authenticatedContext('admin-1', { role: 'admin' })
    await assertSucceeds(setDoc(doc(admin.firestore(), 'adminActivityLog/x1'), logDoc))
  })

  it('admin ปลอม actorUid เป็นคนอื่นไม่ได้', async () => {
    const admin = testEnv.authenticatedContext('admin-1', { role: 'admin' })
    await assertFails(
      setDoc(doc(admin.firestore(), 'adminActivityLog/x1'), { ...logDoc, actorUid: 'admin-2' }),
    )
  })

  it('manager เขียนไม่ได้เลย', async () => {
    const manager = testEnv.authenticatedContext('manager-1', { role: 'manager' })
    await assertFails(
      setDoc(doc(manager.firestore(), 'adminActivityLog/x1'), { ...logDoc, actorUid: 'manager-1' }),
    )
  })

  it('แก้/ลบไม่ได้แม้เป็น admin (audit log ต้อง immutable)', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'adminActivityLog/x1'), logDoc)
    })
    const admin = testEnv.authenticatedContext('admin-1', { role: 'admin' })
    await assertFails(
      updateDoc(doc(admin.firestore(), 'adminActivityLog/x1'), { action: 'tampered' }),
    )
    await assertFails(deleteDoc(doc(admin.firestore(), 'adminActivityLog/x1')))
  })
})

describe('system/{docId} — แจ้งเวอร์ชันใหม่', () => {
  it('อ่านได้แม้ไม่ login', async () => {
    const unauth = testEnv.unauthenticatedContext()
    await assertSucceeds(getDoc(doc(unauth.firestore(), 'system/appVersion')))
  })

  it('manager เขียนไม่ได้', async () => {
    const manager = testEnv.authenticatedContext('manager-1', { role: 'manager' })
    await assertFails(
      setDoc(doc(manager.firestore(), 'system/appVersion'), { updatedAt: new Date() }),
    )
  })

  it('admin เขียนได้', async () => {
    const admin = testEnv.authenticatedContext('admin-1', { role: 'admin' })
    await assertSucceeds(
      setDoc(doc(admin.firestore(), 'system/appVersion'), { updatedAt: new Date() }),
    )
  })
})

describe('deny-by-default', () => {
  it('collection ที่ไม่ได้กำหนด rule ไว้ ต้องถูกปฏิเสธเสมอ', async () => {
    const admin = testEnv.authenticatedContext('admin-1', { role: 'admin' })
    await assertFails(setDoc(doc(admin.firestore(), 'somethingUndefined/doc1'), { a: 1 }))
  })
})
