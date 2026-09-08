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

describe('leagues/{leagueId}/freeAgents/{playerId}', () => {
  const freeAgentDoc = {
    name: 'Player 1',
    position: 'MF',
    age: 20,
    joinedSeason: 1,
    releasedFromTeamId: 't1',
    releasedFromTeamName: 'Team 1',
    releasedSeason: 1,
  }

  async function seedTeam() {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'leagues/superleague/teams/t1'), {
        name: 'Team 1',
        managerUid: 'manager-1',
        managerName: 'Manager 1',
        isForfeited: false,
      })
    })
  }

  it('อ่านได้แม้ไม่ login', async () => {
    const unauth = testEnv.unauthenticatedContext()
    await assertSucceeds(getDoc(doc(unauth.firestore(), 'leagues/superleague/freeAgents/p1')))
  })

  it('manager ที่คุมทีมที่ปล่อยผู้เล่นจริง สร้างได้', async () => {
    await seedTeam()
    const manager = testEnv.authenticatedContext('manager-1', { role: 'manager' })
    await assertSucceeds(
      setDoc(doc(manager.firestore(), 'leagues/superleague/freeAgents/p1'), freeAgentDoc),
    )
  })

  it('manager ทีมอื่น สร้างแทนไม่ได้ (ปลอมว่าเป็นทีมที่ปล่อยจริง)', async () => {
    await seedTeam()
    const outsider = testEnv.authenticatedContext('manager-2', { role: 'manager' })
    await assertFails(
      setDoc(doc(outsider.firestore(), 'leagues/superleague/freeAgents/p1'), freeAgentDoc),
    )
  })

  it('manager แก้/ลบ free agent ที่มีอยู่แล้วไม่ได้ (สิทธิ์ admin เท่านั้น)', async () => {
    await seedTeam()
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'leagues/superleague/freeAgents/p1'), freeAgentDoc)
    })
    const manager = testEnv.authenticatedContext('manager-1', { role: 'manager' })
    await assertFails(
      updateDoc(doc(manager.firestore(), 'leagues/superleague/freeAgents/p1'), { age: 21 }),
    )
  })
})

describe('leagues/{leagueId}/releaseLog/{logId}', () => {
  const releaseLogDoc = { playerId: 'p1', playerName: 'Player 1', fromTeamId: 't1', season: 1 }

  async function seedTeam() {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'leagues/superleague/teams/t1'), {
        name: 'Team 1',
        managerUid: 'manager-1',
        managerName: 'Manager 1',
        isForfeited: false,
      })
    })
  }

  it('manager ที่คุมทีมที่ปล่อยผู้เล่นจริง สร้าง log ได้', async () => {
    await seedTeam()
    const manager = testEnv.authenticatedContext('manager-1', { role: 'manager' })
    await assertSucceeds(
      setDoc(doc(manager.firestore(), 'leagues/superleague/releaseLog/1_t1_p1'), releaseLogDoc),
    )
  })

  it('manager ทีมอื่น สร้าง log แทนทีมนี้ไม่ได้', async () => {
    await seedTeam()
    const outsider = testEnv.authenticatedContext('manager-2', { role: 'manager' })
    await assertFails(
      setDoc(doc(outsider.firestore(), 'leagues/superleague/releaseLog/1_t1_p1'), releaseLogDoc),
    )
  })

  it('แก้/ลบ log ไม่ได้แม้เป็น admin (immutable event ตาม guideline #6)', async () => {
    await seedTeam()
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(
        doc(context.firestore(), 'leagues/superleague/releaseLog/1_t1_p1'),
        releaseLogDoc,
      )
    })
    const admin = testEnv.authenticatedContext('admin-1', { role: 'admin' })
    await assertFails(
      updateDoc(doc(admin.firestore(), 'leagues/superleague/releaseLog/1_t1_p1'), { season: 2 }),
    )
    await assertFails(
      deleteDoc(doc(admin.firestore(), 'leagues/superleague/releaseLog/1_t1_p1')),
    )
  })
})

describe('leagues/{leagueId}/saleOffers/{offerId}', () => {
  const offerDoc = {
    season: 1,
    fromTeamId: 't1',
    fromTeamName: 'Team 1',
    toTeamId: 't2',
    toTeamName: 'Team 2',
    playerId: 'p1',
    playerName: 'Player 1',
    playerPosition: 'MF',
    playerAge: 20,
    price: 100,
    status: 'pending',
    proposedBy: 'seller',
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

  it('ผู้ขาย (fromTeam) สร้างข้อเสนอได้', async () => {
    await seedTeams()
    const seller = testEnv.authenticatedContext('manager-1', { role: 'manager' })
    await assertSucceeds(
      setDoc(doc(seller.firestore(), 'leagues/superleague/saleOffers/o1'), offerDoc),
    )
  })

  it('ผู้ซื้อ (toTeam) สร้างข้อเสนอได้เหมือนกัน', async () => {
    await seedTeams()
    const buyer = testEnv.authenticatedContext('manager-2', { role: 'manager' })
    await assertSucceeds(
      setDoc(doc(buyer.firestore(), 'leagues/superleague/saleOffers/o1'), {
        ...offerDoc,
        proposedBy: 'buyer',
      }),
    )
  })

  it('ทีมที่ไม่เกี่ยวข้องสร้างข้อเสนอแทนไม่ได้', async () => {
    await seedTeams()
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'leagues/superleague/teams/t3'), {
        name: 'Team 3',
        managerUid: 'manager-3',
        managerName: 'Manager 3',
        isForfeited: false,
      })
    })
    const outsider = testEnv.authenticatedContext('manager-3', { role: 'manager' })
    await assertFails(
      setDoc(doc(outsider.firestore(), 'leagues/superleague/saleOffers/o1'), offerDoc),
    )
  })

  async function seedPendingOffer() {
    await seedTeams()
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'leagues/superleague/saleOffers/o1'), offerDoc)
    })
  }

  it('อีกฝ่าย (toTeam) ยอมรับได้ (แก้แค่ status)', async () => {
    await seedPendingOffer()
    const buyer = testEnv.authenticatedContext('manager-2', { role: 'manager' })
    await assertSucceeds(
      updateDoc(doc(buyer.firestore(), 'leagues/superleague/saleOffers/o1'), {
        status: 'accepted',
      }),
    )
  })

  it('แก้ field อื่นพ่วงไปกับ status ไม่ได้ (เช่นสวมราคาใหม่)', async () => {
    await seedPendingOffer()
    const buyer = testEnv.authenticatedContext('manager-2', { role: 'manager' })
    await assertFails(
      updateDoc(doc(buyer.firestore(), 'leagues/superleague/saleOffers/o1'), {
        status: 'accepted',
        price: 1,
      }),
    )
  })

  it('ทีมที่ไม่เกี่ยวข้องแก้สถานะไม่ได้', async () => {
    await seedPendingOffer()
    const outsider = testEnv.authenticatedContext('manager-3', { role: 'manager' })
    await assertFails(
      updateDoc(doc(outsider.firestore(), 'leagues/superleague/saleOffers/o1'), {
        status: 'accepted',
      }),
    )
  })
})

describe('leagues/{leagueId}/transfers/{transferId}', () => {
  const transferDoc = {
    season: 1,
    type: 'simple_sale',
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

describe('deny-by-default', () => {
  it('collection ที่ไม่ได้กำหนด rule ไว้ ต้องถูกปฏิเสธเสมอ', async () => {
    const admin = testEnv.authenticatedContext('admin-1', { role: 'admin' })
    await assertFails(setDoc(doc(admin.firestore(), 'somethingUndefined/doc1'), { a: 1 }))
  })
})
