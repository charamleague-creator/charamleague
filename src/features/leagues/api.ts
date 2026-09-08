import {
  type DocumentData,
  type QueryDocumentSnapshot,
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  runTransaction,
  where,
  writeBatch,
} from 'firebase/firestore'
import { buildCurrentAdminLogWrite } from '@/features/adminLog/api'
import { db } from '@/lib/firebase'
import { generateRoundRobin } from './fixtures'
import { canReceive, canSell } from './quotas'
import type {
  AuctionListing,
  FreeAgent,
  League,
  LeagueStatus,
  Match,
  Player,
  SaleOffer,
  Team,
  Transfer,
} from './types'

const BATCH_CHUNK_SIZE = 450

function leaguesCol() {
  return collection(db, 'leagues')
}
function teamsCol(leagueId: string) {
  return collection(db, 'leagues', leagueId, 'teams')
}
function matchesCol(leagueId: string) {
  return collection(db, 'leagues', leagueId, 'matches')
}
function playersCol(leagueId: string, teamId: string) {
  return collection(db, 'leagues', leagueId, 'teams', teamId, 'players')
}
function freeAgentsCol(leagueId: string) {
  return collection(db, 'leagues', leagueId, 'freeAgents')
}
function auctionListingsCol(leagueId: string) {
  return collection(db, 'leagues', leagueId, 'auctionListings')
}
function saleOffersCol(leagueId: string) {
  return collection(db, 'leagues', leagueId, 'saleOffers')
}
function transfersCol(leagueId: string) {
  return collection(db, 'leagues', leagueId, 'transfers')
}

function toLeague(snap: QueryDocumentSnapshot<DocumentData>): League {
  const data = snap.data()
  return {
    id: snap.id,
    name: data.name,
    status: data.status,
    currentSeason: data.currentSeason,
  }
}
function toTeam(snap: QueryDocumentSnapshot<DocumentData>): Team {
  const data = snap.data()
  return {
    id: snap.id,
    name: data.name,
    managerUid: data.managerUid,
    managerName: data.managerName,
    isForfeited: data.isForfeited,
  }
}
function toMatch(snap: QueryDocumentSnapshot<DocumentData>): Match {
  const data = snap.data()
  return {
    id: snap.id,
    season: data.season,
    matchday: data.matchday,
    homeTeamId: data.homeTeamId,
    awayTeamId: data.awayTeamId,
    involvedManagerUids: data.involvedManagerUids,
    status: data.status,
    homeScore: data.homeScore,
    awayScore: data.awayScore,
    winnerTeamId: data.winnerTeamId,
  }
}

function toPlayer(snap: QueryDocumentSnapshot<DocumentData>): Player {
  const data = snap.data()
  return {
    id: snap.id,
    name: data.name,
    position: data.position,
    age: data.age,
    joinedSeason: data.joinedSeason,
  }
}

export function subscribePlayers(
  leagueId: string,
  teamId: string,
  onChange: (players: Player[]) => void,
) {
  return onSnapshot(playersCol(leagueId, teamId), (snap) => onChange(snap.docs.map(toPlayer)))
}

export async function addPlayer(
  leagueId: string,
  teamId: string,
  input: { name: string; position: Player['position']; age: number; joinedSeason: number },
): Promise<void> {
  await addDoc(playersCol(leagueId, teamId), input)
}

export async function removePlayer(
  leagueId: string,
  teamId: string,
  playerId: string,
): Promise<void> {
  await deleteDoc(doc(db, 'leagues', leagueId, 'teams', teamId, 'players', playerId))
}

function toFreeAgent(snap: QueryDocumentSnapshot<DocumentData>): FreeAgent {
  const data = snap.data()
  return {
    id: snap.id,
    name: data.name,
    position: data.position,
    age: data.age,
    joinedSeason: data.joinedSeason,
    releasedFromTeamId: data.releasedFromTeamId,
    releasedFromTeamName: data.releasedFromTeamName,
    releasedSeason: data.releasedSeason,
  }
}

export function subscribeFreeAgents(leagueId: string, onChange: (agents: FreeAgent[]) => void) {
  return onSnapshot(freeAgentsCol(leagueId), (snap) => onChange(snap.docs.map(toFreeAgent)))
}

/**
 * ฉีกสัญญา — ปล่อยผู้เล่นออกจากทีมไปเป็นผู้เล่นอิสระ (free agent)
 * คง playerId เดิมตลอดการย้าย เพื่อให้ตรวจ ping-pong (guideline #4/#6) และรักษา identity ได้
 */
export async function releasePlayer(leagueId: string, teamId: string, playerId: string) {
  const leagueSnap = await getDoc(doc(db, 'leagues', leagueId))
  if (!leagueSnap.exists()) throw new Error('ไม่พบลีก')
  const league = toLeague(leagueSnap as QueryDocumentSnapshot<DocumentData>)
  if (league.status !== 'in_season')
    throw new Error('ฉีกสัญญาได้เฉพาะตอนลีกกำลังแข่งขันเท่านั้น')

  const [teamSnap, playerSnap] = await Promise.all([
    getDoc(doc(db, 'leagues', leagueId, 'teams', teamId)),
    getDoc(doc(db, 'leagues', leagueId, 'teams', teamId, 'players', playerId)),
  ])
  if (!teamSnap.exists()) throw new Error('ไม่พบทีม')
  if (!playerSnap.exists()) throw new Error('ไม่พบผู้เล่น')
  const team = toTeam(teamSnap as QueryDocumentSnapshot<DocumentData>)
  const player = toPlayer(playerSnap as QueryDocumentSnapshot<DocumentData>)

  const releaseLogId = `${league.currentSeason}_${teamId}_${playerId}`
  const existingRelease = await getDoc(doc(db, 'leagues', leagueId, 'releaseLog', releaseLogId))
  if (existingRelease.exists()) {
    throw new Error(
      `ห้ามฉีกสัญญา "${player.name}" ซ้ำจากทีมเดียวกันในฤดูกาลนี้ (ป้องกัน ping-pong)`,
    )
  }

  await commitInChunks([
    (batch) => batch.delete(doc(db, 'leagues', leagueId, 'teams', teamId, 'players', playerId)),
    (batch) =>
      batch.set(doc(db, 'leagues', leagueId, 'freeAgents', playerId), {
        name: player.name,
        position: player.position,
        age: player.age,
        joinedSeason: player.joinedSeason,
        releasedFromTeamId: teamId,
        releasedFromTeamName: team.name,
        releasedSeason: league.currentSeason,
      }),
    (batch) =>
      batch.set(doc(db, 'leagues', leagueId, 'releaseLog', releaseLogId), {
        playerId,
        playerName: player.name,
        fromTeamId: teamId,
        season: league.currentSeason,
      }),
  ])
}

function toSaleOffer(snap: QueryDocumentSnapshot<DocumentData>): SaleOffer {
  const data = snap.data()
  return {
    id: snap.id,
    season: data.season,
    fromTeamId: data.fromTeamId,
    fromTeamName: data.fromTeamName,
    toTeamId: data.toTeamId,
    toTeamName: data.toTeamName,
    playerId: data.playerId,
    playerName: data.playerName,
    playerPosition: data.playerPosition,
    playerAge: data.playerAge,
    price: data.price,
    status: data.status,
    proposedBy: data.proposedBy,
  }
}

function toTransfer(snap: QueryDocumentSnapshot<DocumentData>): Transfer {
  const data = snap.data()
  return {
    id: snap.id,
    season: data.season,
    type: data.type,
    fromTeamId: data.fromTeamId,
    toTeamId: data.toTeamId,
    playerId: data.playerId,
    playerName: data.playerName,
    price: data.price,
  }
}

export function subscribeSaleOffers(leagueId: string, onChange: (offers: SaleOffer[]) => void) {
  return onSnapshot(saleOffersCol(leagueId), (snap) => onChange(snap.docs.map(toSaleOffer)))
}

export function subscribeSeasonTransfers(
  leagueId: string,
  season: number,
  onChange: (transfers: Transfer[]) => void,
) {
  const q = query(transfersCol(leagueId), where('season', '==', season))
  return onSnapshot(q, (snap) => onChange(snap.docs.map(toTransfer)))
}

/**
 * เสนอขายตรง (ขายย่อย) — ทีมใดทีมหนึ่ง (ผู้ขายหรือผู้ซื้อ) เสนอราคาก่อน
 * ยังไม่ย้ายผู้เล่นจริงจนกว่าอีกฝ่ายจะกด "ยอมรับ" แล้วแอดมิน "ปิดการขาย" (completeSale)
 */
export async function createSaleOffer(
  leagueId: string,
  input: {
    fromTeamId: string
    fromTeamName: string
    toTeamId: string
    toTeamName: string
    playerId: string
    playerName: string
    playerPosition: Player['position']
    playerAge: number
    price: number
    proposedBy: 'seller' | 'buyer'
  },
): Promise<void> {
  const leagueSnap = await getDoc(doc(db, 'leagues', leagueId))
  if (!leagueSnap.exists()) throw new Error('ไม่พบลีก')
  const league = toLeague(leagueSnap as QueryDocumentSnapshot<DocumentData>)
  if (league.status !== 'in_season')
    throw new Error('เสนอซื้อ-ขายนักเตะได้เฉพาะตอนลีกกำลังแข่งขันเท่านั้น')
  if (input.fromTeamId === input.toTeamId) throw new Error('ทีมต้นทางและปลายทางต้องไม่ใช่ทีมเดียวกัน')

  await addDoc(saleOffersCol(leagueId), {
    ...input,
    season: league.currentSeason,
    status: 'pending',
  })
}

export async function respondToSaleOffer(
  leagueId: string,
  offerId: string,
  status: 'accepted' | 'rejected' | 'cancelled',
): Promise<void> {
  await commitInChunks([
    (batch) => batch.update(doc(db, 'leagues', leagueId, 'saleOffers', offerId), { status }),
  ])
}

/**
 * แอดมินปิดการขาย — ย้ายผู้เล่นจริง (คง playerId เดิม) + เช็คโควตาก่อนบันทึกเสมอ (guideline #5)
 * ต้องทำโดยแอดมินเพราะ Firestore Rules ตรวจข้าม "ทีมสองทีม" พร้อมกัน (ลบจากทีม A + สร้างในทีม B)
 * ในการเขียนเดียวกันไม่ได้ ถ้าไม่ผ่านสิทธิ์ admin ที่ bypass ทั้งสองฝั่งอยู่แล้ว
 */
export async function completeSale(leagueId: string, offerId: string): Promise<void> {
  const [leagueSnap, offerSnap] = await Promise.all([
    getDoc(doc(db, 'leagues', leagueId)),
    getDoc(doc(db, 'leagues', leagueId, 'saleOffers', offerId)),
  ])
  if (!leagueSnap.exists()) throw new Error('ไม่พบลีก')
  if (!offerSnap.exists()) throw new Error('ไม่พบข้อเสนอ')
  const league = toLeague(leagueSnap as QueryDocumentSnapshot<DocumentData>)
  const offer = toSaleOffer(offerSnap as QueryDocumentSnapshot<DocumentData>)
  if (league.status !== 'in_season')
    throw new Error('ปิดการขายได้เฉพาะตอนลีกกำลังแข่งขันเท่านั้น')
  if (offer.status !== 'accepted') throw new Error('ต้องรอให้อีกทีมยอมรับข้อเสนอก่อน')

  const transfersSnap = await getDocs(
    query(transfersCol(leagueId), where('season', '==', league.currentSeason)),
  )
  const transfers = transfersSnap.docs.map(toTransfer)

  const sellCheck = canSell(transfers, offer.fromTeamId, league.currentSeason, 'simple_sale')
  if (!sellCheck.allowed) throw new Error(sellCheck.reason)
  const receiveCheck = canReceive(transfers, offer.toTeamId, league.currentSeason)
  if (!receiveCheck.allowed) throw new Error(receiveCheck.reason)

  const playerSnap = await getDoc(
    doc(db, 'leagues', leagueId, 'teams', offer.fromTeamId, 'players', offer.playerId),
  )
  if (!playerSnap.exists()) throw new Error('ไม่พบผู้เล่นในทีมต้นทาง (อาจถูกย้ายไปแล้ว)')
  const player = toPlayer(playerSnap as QueryDocumentSnapshot<DocumentData>)

  await commitInChunks([
    (batch) =>
      batch.delete(
        doc(db, 'leagues', leagueId, 'teams', offer.fromTeamId, 'players', offer.playerId),
      ),
    (batch) =>
      batch.set(doc(db, 'leagues', leagueId, 'teams', offer.toTeamId, 'players', offer.playerId), {
        name: player.name,
        position: player.position,
        age: player.age,
        joinedSeason: player.joinedSeason,
      }),
    (batch) =>
      batch.set(doc(transfersCol(leagueId)), {
        season: league.currentSeason,
        type: 'simple_sale',
        fromTeamId: offer.fromTeamId,
        toTeamId: offer.toTeamId,
        playerId: offer.playerId,
        playerName: player.name,
        price: offer.price,
      }),
    (batch) =>
      batch.update(doc(db, 'leagues', leagueId, 'saleOffers', offerId), { status: 'completed' }),
    buildCurrentAdminLogWrite('complete_sale', {
      leagueId,
      offerId,
      fromTeamId: offer.fromTeamId,
      toTeamId: offer.toTeamId,
      playerId: offer.playerId,
      price: offer.price,
    }),
  ])
}

function toAuctionListing(snap: QueryDocumentSnapshot<DocumentData>): AuctionListing {
  const data = snap.data()
  return {
    id: snap.id,
    season: data.season,
    sellerTeamId: data.sellerTeamId,
    sellerTeamName: data.sellerTeamName,
    playerId: data.playerId,
    playerName: data.playerName,
    playerPosition: data.playerPosition,
    playerAge: data.playerAge,
    startingPrice: data.startingPrice,
    status: data.status,
    highestBid: data.highestBid,
    highestBidderTeamId: data.highestBidderTeamId,
    highestBidderTeamName: data.highestBidderTeamName,
  }
}

export function subscribeAuctionListings(
  leagueId: string,
  onChange: (listings: AuctionListing[]) => void,
) {
  return onSnapshot(auctionListingsCol(leagueId), (snap) =>
    onChange(snap.docs.map(toAuctionListing)),
  )
}

/** ทีมที่จะขายส่งเข้าคิวรอแอดมินอนุมัติ — ยังไม่นับเข้าโควตาจนกว่าจะอนุมัติ (ตามเอกสารข้อ 5.2) */
export async function createAuctionListing(
  leagueId: string,
  input: {
    sellerTeamId: string
    sellerTeamName: string
    playerId: string
    playerName: string
    playerPosition: Player['position']
    playerAge: number
    startingPrice: number
  },
): Promise<void> {
  const leagueSnap = await getDoc(doc(db, 'leagues', leagueId))
  if (!leagueSnap.exists()) throw new Error('ไม่พบลีก')
  const league = toLeague(leagueSnap as QueryDocumentSnapshot<DocumentData>)
  if (league.status !== 'in_season')
    throw new Error('ส่งเข้าประมูลได้เฉพาะตอนลีกกำลังแข่งขันเท่านั้น')

  await addDoc(auctionListingsCol(leagueId), {
    ...input,
    season: league.currentSeason,
    status: 'pending_approval',
    highestBid: null,
    highestBidderTeamId: null,
    highestBidderTeamName: null,
  })
}

async function getOpenAuctionCountForTeam(leagueId: string, teamId: string, season: number) {
  const snap = await getDocs(
    query(
      auctionListingsCol(leagueId),
      where('season', '==', season),
      where('sellerTeamId', '==', teamId),
      where('status', '==', 'open'),
    ),
  )
  return snap.size
}

/**
 * แอดมินอนุมัติเข้าคิวประมูล — "ยืนยันแล้วแต่ยังไม่ปิด" ต้องนับเข้าโควตาทันที (เอกสารข้อ 5.2)
 * เช็คก่อนอนุมัติเสมอ (guideline #5) เพราะพอ approve แล้วนับเข้าโควตาแล้ว จะย้อนไม่ได้ถ้าไม่ reject
 */
export async function approveAuctionListing(leagueId: string, listingId: string): Promise<void> {
  const [leagueSnap, listingSnap] = await Promise.all([
    getDoc(doc(db, 'leagues', leagueId)),
    getDoc(doc(db, 'leagues', leagueId, 'auctionListings', listingId)),
  ])
  if (!leagueSnap.exists()) throw new Error('ไม่พบลีก')
  if (!listingSnap.exists()) throw new Error('ไม่พบรายการประมูล')
  const league = toLeague(leagueSnap as QueryDocumentSnapshot<DocumentData>)
  const listing = toAuctionListing(listingSnap as QueryDocumentSnapshot<DocumentData>)
  if (listing.status !== 'pending_approval') throw new Error('รายการนี้ไม่ได้รออนุมัติอยู่')

  const [transfersSnap, openCount] = await Promise.all([
    getDocs(query(transfersCol(leagueId), where('season', '==', league.currentSeason))),
    getOpenAuctionCountForTeam(leagueId, listing.sellerTeamId, league.currentSeason),
  ])
  const transfers = transfersSnap.docs.map(toTransfer)
  const sellCheck = canSell(transfers, listing.sellerTeamId, league.currentSeason, 'auction', openCount)
  if (!sellCheck.allowed) throw new Error(sellCheck.reason)

  await commitInChunks([
    (batch) =>
      batch.update(doc(db, 'leagues', leagueId, 'auctionListings', listingId), { status: 'open' }),
    buildCurrentAdminLogWrite('approve_auction_listing', { leagueId, listingId }),
  ])
}

export async function rejectAuctionListing(leagueId: string, listingId: string): Promise<void> {
  await commitInChunks([
    (batch) =>
      batch.update(doc(db, 'leagues', leagueId, 'auctionListings', listingId), {
        status: 'rejected',
      }),
    buildCurrentAdminLogWrite('reject_auction_listing', { leagueId, listingId }),
  ])
}

/** ประมูล — ใช้ Firestore transaction กัน race condition ตอนมีคนประมูลพร้อมกัน (guideline #3) */
export async function placeBid(
  leagueId: string,
  listingId: string,
  teamId: string,
  teamName: string,
  amount: number,
): Promise<void> {
  const listingRef = doc(db, 'leagues', leagueId, 'auctionListings', listingId)
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(listingRef)
    if (!snap.exists()) throw new Error('ไม่พบรายการประมูล')
    const listing = toAuctionListing(snap as QueryDocumentSnapshot<DocumentData>)
    if (listing.status !== 'open') throw new Error('ประมูลนี้ไม่ได้เปิดอยู่')
    if (teamId === listing.sellerTeamId) throw new Error('ทีมที่ขายห้ามประมูลนักเตะตัวเอง')
    const minAcceptable = listing.highestBid === null ? listing.startingPrice : listing.highestBid + 1
    if (amount < minAcceptable) {
      throw new Error(`ราคาประมูลต้องอย่างน้อย ${minAcceptable}`)
    }
    tx.update(listingRef, {
      highestBid: amount,
      highestBidderTeamId: teamId,
      highestBidderTeamName: teamName,
    })
  })
}

/**
 * แอดมินปิดประมูล — กำหนดผู้ชนะจากราคาสูงสุด ย้ายผู้เล่นจริง + เช็คโควตาผู้ชนะก่อนบันทึก (guideline #5)
 */
export async function closeAuction(leagueId: string, listingId: string): Promise<void> {
  const [leagueSnap, listingSnap] = await Promise.all([
    getDoc(doc(db, 'leagues', leagueId)),
    getDoc(doc(db, 'leagues', leagueId, 'auctionListings', listingId)),
  ])
  if (!leagueSnap.exists()) throw new Error('ไม่พบลีก')
  if (!listingSnap.exists()) throw new Error('ไม่พบรายการประมูล')
  const league = toLeague(leagueSnap as QueryDocumentSnapshot<DocumentData>)
  const listing = toAuctionListing(listingSnap as QueryDocumentSnapshot<DocumentData>)
  if (listing.status !== 'open') throw new Error('ประมูลนี้ไม่ได้เปิดอยู่')

  if (listing.highestBidderTeamId === null) {
    await commitInChunks([
      (batch) =>
        batch.update(doc(db, 'leagues', leagueId, 'auctionListings', listingId), {
          status: 'closed_no_winner',
        }),
      buildCurrentAdminLogWrite('close_auction_no_winner', { leagueId, listingId }),
    ])
    return
  }

  const transfersSnap = await getDocs(
    query(transfersCol(leagueId), where('season', '==', league.currentSeason)),
  )
  const transfers = transfersSnap.docs.map(toTransfer)
  const receiveCheck = canReceive(transfers, listing.highestBidderTeamId, league.currentSeason)
  if (!receiveCheck.allowed) throw new Error(receiveCheck.reason)

  const playerSnap = await getDoc(
    doc(db, 'leagues', leagueId, 'teams', listing.sellerTeamId, 'players', listing.playerId),
  )
  if (!playerSnap.exists()) throw new Error('ไม่พบผู้เล่นในทีมต้นทาง (อาจถูกย้ายไปแล้ว)')
  const player = toPlayer(playerSnap as QueryDocumentSnapshot<DocumentData>)

  await commitInChunks([
    (batch) =>
      batch.delete(
        doc(db, 'leagues', leagueId, 'teams', listing.sellerTeamId, 'players', listing.playerId),
      ),
    (batch) =>
      batch.set(
        doc(
          db,
          'leagues',
          leagueId,
          'teams',
          listing.highestBidderTeamId as string,
          'players',
          listing.playerId,
        ),
        {
          name: player.name,
          position: player.position,
          age: player.age,
          joinedSeason: player.joinedSeason,
        },
      ),
    (batch) =>
      batch.set(doc(transfersCol(leagueId)), {
        season: league.currentSeason,
        type: 'auction',
        fromTeamId: listing.sellerTeamId,
        toTeamId: listing.highestBidderTeamId,
        playerId: listing.playerId,
        playerName: player.name,
        price: listing.highestBid,
      }),
    (batch) =>
      batch.update(doc(db, 'leagues', leagueId, 'auctionListings', listingId), {
        status: 'closed',
      }),
    buildCurrentAdminLogWrite('close_auction', {
      leagueId,
      listingId,
      winnerTeamId: listing.highestBidderTeamId,
      price: listing.highestBid,
    }),
  ])
}

export function subscribeLeagues(onChange: (leagues: League[]) => void) {
  return onSnapshot(leaguesCol(), (snap) => onChange(snap.docs.map(toLeague)))
}

export function subscribeLeague(leagueId: string, onChange: (league: League | null) => void) {
  return onSnapshot(doc(db, 'leagues', leagueId), (snap) =>
    onChange(snap.exists() ? toLeague(snap as QueryDocumentSnapshot<DocumentData>) : null),
  )
}

export function subscribeTeams(leagueId: string, onChange: (teams: Team[]) => void) {
  return onSnapshot(teamsCol(leagueId), (snap) => onChange(snap.docs.map(toTeam)))
}

export function subscribeSeasonMatches(
  leagueId: string,
  season: number,
  onChange: (matches: Match[]) => void,
) {
  const q = query(matchesCol(leagueId), where('season', '==', season))
  return onSnapshot(q, (snap) =>
    onChange(snap.docs.map(toMatch).sort((a, b) => a.matchday - b.matchday)),
  )
}

export async function createLeague(name: string): Promise<string> {
  const ref = doc(leaguesCol())
  await commitInChunks([
    (batch) =>
      batch.set(ref, {
        name,
        status: 'transfer_window' satisfies LeagueStatus,
        currentSeason: 1,
      }),
    buildCurrentAdminLogWrite('create_league', { leagueId: ref.id, name }),
  ])
  return ref.id
}

export async function deleteLeague(leagueId: string): Promise<void> {
  const [teamDocs, matchDocs] = await Promise.all([
    getDocs(teamsCol(leagueId)),
    getDocs(matchesCol(leagueId)),
  ])
  const refsToDelete = [
    ...teamDocs.docs.map((d) => d.ref),
    ...matchDocs.docs.map((d) => d.ref),
    doc(db, 'leagues', leagueId),
  ]
  await commitInChunks([
    ...refsToDelete.map((ref) => (batch: ReturnType<typeof writeBatch>) => batch.delete(ref)),
    buildCurrentAdminLogWrite('delete_league', { leagueId }),
  ])
}

export async function createTeam(
  leagueId: string,
  input: { name: string; managerUid: string; managerName: string },
): Promise<void> {
  await addDoc(teamsCol(leagueId), { ...input, isForfeited: false })
}

export async function setTeamForfeited(
  leagueId: string,
  teamId: string,
  isForfeited: boolean,
): Promise<void> {
  await commitInChunks([
    (batch) => batch.update(doc(db, 'leagues', leagueId, 'teams', teamId), { isForfeited }),
    buildCurrentAdminLogWrite('set_team_forfeited', { leagueId, teamId, isForfeited }),
  ])
}

export async function reportMatchResult(
  leagueId: string,
  matchId: string,
  homeScore: number,
  awayScore: number,
): Promise<void> {
  await commitInChunks([
    (batch) =>
      batch.update(doc(db, 'leagues', leagueId, 'matches', matchId), {
        status: 'played',
        homeScore,
        awayScore,
      }),
  ])
}

async function commitInChunks(writes: Array<(batch: ReturnType<typeof writeBatch>) => void>) {
  for (let i = 0; i < writes.length; i += BATCH_CHUNK_SIZE) {
    const batch = writeBatch(db)
    for (const write of writes.slice(i, i + BATCH_CHUNK_SIZE)) write(batch)
    await batch.commit()
  }
}

export async function endSeason(leagueId: string): Promise<void> {
  const leagueSnap = await getDoc(doc(db, 'leagues', leagueId))
  if (!leagueSnap.exists()) throw new Error('ไม่พบลีก')
  const league = toLeague(leagueSnap as QueryDocumentSnapshot<DocumentData>)
  if (league.status !== 'in_season') throw new Error('จบฤดูกาลได้เฉพาะตอนลีกกำลังแข่งขันเท่านั้น')

  const [teamsSnap, scheduledSnap] = await Promise.all([
    getDocs(teamsCol(leagueId)),
    getDocs(
      query(
        matchesCol(leagueId),
        where('season', '==', league.currentSeason),
        where('status', '==', 'scheduled'),
      ),
    ),
  ])
  const teamById = new Map(teamsSnap.docs.map((d) => [d.id, toTeam(d)]))
  const scheduled = scheduledSnap.docs.map(toMatch)

  const unresolved = scheduled.filter((m) => {
    const home = teamById.get(m.homeTeamId)
    const away = teamById.get(m.awayTeamId)
    return !home?.isForfeited && !away?.isForfeited
  })
  if (unresolved.length > 0) {
    throw new Error(
      `มีนัดที่ยังไม่กรอกผล ${unresolved.length} นัด (ทีมที่แข่งอยู่ปกติ) กรุณากรอกผลให้ครบก่อนจบฤดูกาล`,
    )
  }

  const writes: Array<(batch: ReturnType<typeof writeBatch>) => void> = []
  for (const m of scheduled) {
    const home = teamById.get(m.homeTeamId)
    const away = teamById.get(m.awayTeamId)
    let winnerTeamId: string | null = null
    if (home?.isForfeited && !away?.isForfeited) winnerTeamId = m.awayTeamId
    else if (away?.isForfeited && !home?.isForfeited) winnerTeamId = m.homeTeamId
    writes.push((batch) =>
      batch.update(doc(db, 'leagues', leagueId, 'matches', m.id), {
        status: 'bye',
        winnerTeamId,
      }),
    )
  }
  writes.push((batch) =>
    batch.update(doc(db, 'leagues', leagueId), { status: 'transfer_window' }),
  )
  writes.push(
    buildCurrentAdminLogWrite('end_season', {
      leagueId,
      season: league.currentSeason,
      byeMatches: scheduled.length,
    }),
  )
  await commitInChunks(writes)
}

export async function startNewSeason(leagueId: string): Promise<void> {
  const leagueSnap = await getDoc(doc(db, 'leagues', leagueId))
  if (!leagueSnap.exists()) throw new Error('ไม่พบลีก')
  const league = toLeague(leagueSnap as QueryDocumentSnapshot<DocumentData>)
  if (league.status !== 'transfer_window')
    throw new Error('เริ่มฤดูกาลใหม่ได้เฉพาะตอนตลาดเปิดเท่านั้น')

  const teamsSnap = await getDocs(teamsCol(leagueId))
  const teams = teamsSnap.docs.map(toTeam)
  if (teams.length < 2) throw new Error('ต้องมีทีมอย่างน้อย 2 ทีมก่อนเริ่มฤดูกาลใหม่')

  const stillScheduled = await getDocs(
    query(
      matchesCol(leagueId),
      where('season', '==', league.currentSeason),
      where('status', '==', 'scheduled'),
    ),
  )
  if (!stillScheduled.empty) {
    throw new Error('ยังมีนัดที่ยังไม่จบของฤดูกาลปัจจุบัน — กรุณาจบฤดูกาลก่อน')
  }

  const newSeason = league.currentSeason + 1
  const teamById = new Map(teams.map((t) => [t.id, t]))
  const fixtures = generateRoundRobin(teams.map((t) => t.id), newSeason)

  const writes: Array<(batch: ReturnType<typeof writeBatch>) => void> = []
  for (const team of teams) {
    writes.push((batch) =>
      batch.update(doc(db, 'leagues', leagueId, 'teams', team.id), { isForfeited: false }),
    )
  }
  for (const fixture of fixtures) {
    const matchId = `${fixture.season}_${fixture.homeTeamId}_${fixture.awayTeamId}`
    const home = teamById.get(fixture.homeTeamId)
    const away = teamById.get(fixture.awayTeamId)
    writes.push((batch) =>
      batch.set(doc(db, 'leagues', leagueId, 'matches', matchId), {
        season: fixture.season,
        matchday: fixture.matchday,
        homeTeamId: fixture.homeTeamId,
        awayTeamId: fixture.awayTeamId,
        involvedManagerUids: [home?.managerUid, away?.managerUid].filter(Boolean),
        status: 'scheduled',
        homeScore: null,
        awayScore: null,
        winnerTeamId: null,
      }),
    )
  }
  writes.push((batch) =>
    batch.update(doc(db, 'leagues', leagueId), { currentSeason: newSeason, status: 'in_season' }),
  )
  writes.push(
    buildCurrentAdminLogWrite('start_new_season', { leagueId, newSeason, teamCount: teams.length }),
  )
  await commitInChunks(writes)
}
