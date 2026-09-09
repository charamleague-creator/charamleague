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
  serverTimestamp,
  where,
  writeBatch,
} from 'firebase/firestore'
import { buildCurrentAdminLogWrite } from '@/features/adminLog/api'
import { db } from '@/lib/firebase'
import { generateRoundRobin } from './fixtures'
import {
  DEFAULT_FORFEIT_PENALTY,
  TEAR_BUYER_COST,
  TEAR_ORIGIN_COMPENSATION,
  auctionSellerProceeds,
  blockedTearPairKey,
  resolveTearRequests,
  sellOffPayout,
} from './finance'
import { canReceive, canSell } from './quotas'
import type {
  AuctionListing,
  League,
  LeagueStatus,
  Match,
  Player,
  Team,
  TearRequest,
  Transaction,
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
function auctionListingsCol(leagueId: string) {
  return collection(db, 'leagues', leagueId, 'auctionListings')
}
function transfersCol(leagueId: string) {
  return collection(db, 'leagues', leagueId, 'transfers')
}
function transactionsCol(leagueId: string, teamId: string) {
  return collection(db, 'leagues', leagueId, 'teams', teamId, 'transactions')
}
function tearRequestsCol(leagueId: string) {
  return collection(db, 'leagues', leagueId, 'tearRequests')
}

function toLeague(snap: QueryDocumentSnapshot<DocumentData>): League {
  const data = snap.data()
  return {
    id: snap.id,
    name: data.name,
    status: data.status,
    currentSeason: data.currentSeason,
    forfeitPenalty: data.forfeitPenalty ?? DEFAULT_FORFEIT_PENALTY,
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
    balance: data.balance,
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
    tag: data.tag,
    isVeteran: data.isVeteran ?? false,
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
  input: {
    name: string
    position: Player['position']
    age: number
    joinedSeason: number
    tag: Player['tag']
  },
): Promise<void> {
  await addDoc(playersCol(leagueId, teamId), { ...input, isVeteran: false })
}

/** แอดมินเลือกแจก/เอา tag พิเศษ "veteran" ให้ผู้เล่นเอง (สุ่มเลือกเองนอกระบบ ไม่มี auto) */
export async function setPlayerVeteranTag(
  leagueId: string,
  teamId: string,
  playerId: string,
  isVeteran: boolean,
): Promise<void> {
  await commitInChunks([
    (batch) =>
      batch.update(doc(db, 'leagues', leagueId, 'teams', teamId, 'players', playerId), {
        isVeteran,
      }),
    buildCurrentAdminLogWrite('set_player_veteran_tag', { leagueId, teamId, playerId, isVeteran }),
  ])
}

export async function removePlayer(
  leagueId: string,
  teamId: string,
  playerId: string,
): Promise<void> {
  await deleteDoc(doc(db, 'leagues', leagueId, 'teams', teamId, 'players', playerId))
}

function toTransaction(snap: QueryDocumentSnapshot<DocumentData>): Transaction {
  const data = snap.data()
  return {
    id: snap.id,
    type: data.type,
    category: data.category,
    desc: data.desc,
    amount: data.amount,
    season: data.season,
  }
}

export function subscribeTransactions(
  leagueId: string,
  teamId: string,
  onChange: (transactions: Transaction[]) => void,
) {
  return onSnapshot(transactionsCol(leagueId, teamId), (snap) =>
    onChange(snap.docs.map(toTransaction)),
  )
}

/**
 * ย่อยนักเตะ — ลบผู้เล่นออกจากระบบถาวร (ไม่มีทีมผู้ซื้อ ไม่เข้า free agent pool ใดๆ)
 * แลกเงินคงที่ตาม Tag (TAG_VALUE, หน่วย M) เข้าบัญชีทีม
 */
export async function sellOffPlayer(leagueId: string, teamId: string, playerId: string) {
  const leagueSnap = await getDoc(doc(db, 'leagues', leagueId))
  if (!leagueSnap.exists()) throw new Error('ไม่พบลีก')
  const league = toLeague(leagueSnap as QueryDocumentSnapshot<DocumentData>)
  if (league.status !== 'in_season') throw new Error('ย่อยนักเตะได้เฉพาะตอนลีกกำลังแข่งขันเท่านั้น')

  const [playerSnap, teamSnap] = await Promise.all([
    getDoc(doc(db, 'leagues', leagueId, 'teams', teamId, 'players', playerId)),
    getDoc(doc(db, 'leagues', leagueId, 'teams', teamId)),
  ])
  if (!playerSnap.exists()) throw new Error('ไม่พบผู้เล่น')
  if (!teamSnap.exists()) throw new Error('ไม่พบทีม')
  const player = toPlayer(playerSnap as QueryDocumentSnapshot<DocumentData>)
  const team = toTeam(teamSnap as QueryDocumentSnapshot<DocumentData>)

  const payout = sellOffPayout(player.tag, player.isVeteran)

  await commitInChunks([
    (batch) => batch.delete(doc(db, 'leagues', leagueId, 'teams', teamId, 'players', playerId)),
    (batch) =>
      batch.update(doc(db, 'leagues', leagueId, 'teams', teamId), {
        balance: team.balance + payout,
      }),
    (batch) =>
      batch.set(doc(transactionsCol(leagueId, teamId)), {
        type: 'income',
        category: 'sell_off',
        desc: `ย่อยนักเตะ ${player.name} (Tag: ${player.tag}${player.isVeteran ? ' + veteran' : ''})`,
        amount: payout,
        season: league.currentSeason,
      }),
  ])
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

export function subscribeSeasonTransfers(
  leagueId: string,
  season: number,
  onChange: (transfers: Transfer[]) => void,
) {
  const q = query(transfersCol(leagueId), where('season', '==', season))
  return onSnapshot(q, (snap) => onChange(snap.docs.map(toTransfer)))
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

/**
 * ทีมที่จะขายส่งเข้าคิวรอแอดมินอนุมัติ — ยังไม่นับเข้าโควตาจนกว่าจะอนุมัติ (ตามเอกสารข้อ 5.2)
 * "การันตี" (guaranteedBuyerTeamId/Price) = ราคาเริ่มต้นที่ตกลงกันไว้ล่วงหน้าระหว่าง 2 ทีม
 * ยังต้องผ่านประมูลปกติ ทีมอื่นเสนอราคาสูงกว่าแย่งไปได้ตามระบบเดิม
 */
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
    guaranteedBuyerTeamId?: string
    guaranteedBuyerTeamName?: string
  },
): Promise<void> {
  const leagueSnap = await getDoc(doc(db, 'leagues', leagueId))
  if (!leagueSnap.exists()) throw new Error('ไม่พบลีก')
  const league = toLeague(leagueSnap as QueryDocumentSnapshot<DocumentData>)
  if (league.status !== 'in_season')
    throw new Error('ส่งเข้าประมูลได้เฉพาะตอนลีกกำลังแข่งขันเท่านั้น')
  if (input.guaranteedBuyerTeamId && input.guaranteedBuyerTeamId === input.sellerTeamId) {
    throw new Error('ทีมที่การันตีซื้อต้องไม่ใช่ทีมผู้ขาย')
  }

  const hasGuarantee = Boolean(input.guaranteedBuyerTeamId)

  await addDoc(auctionListingsCol(leagueId), {
    sellerTeamId: input.sellerTeamId,
    sellerTeamName: input.sellerTeamName,
    playerId: input.playerId,
    playerName: input.playerName,
    playerPosition: input.playerPosition,
    playerAge: input.playerAge,
    startingPrice: input.startingPrice,
    season: league.currentSeason,
    status: 'pending_approval',
    highestBid: hasGuarantee ? input.startingPrice : null,
    highestBidderTeamId: hasGuarantee ? input.guaranteedBuyerTeamId : null,
    highestBidderTeamName: hasGuarantee ? input.guaranteedBuyerTeamName : null,
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
 * หักภาษี 30% จากผู้ขาย: ผู้ซื้อจ่ายเต็มราคา ผู้ขายได้รับ 70% เข้าบัญชี ทั้งสองฝั่งบันทึกเป็น transaction
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

  const winnerTeamId = listing.highestBidderTeamId
  const winnerPrice = listing.highestBid as number

  const transfersSnap = await getDocs(
    query(transfersCol(leagueId), where('season', '==', league.currentSeason)),
  )
  const transfers = transfersSnap.docs.map(toTransfer)
  const receiveCheck = canReceive(transfers, winnerTeamId, league.currentSeason)
  if (!receiveCheck.allowed) throw new Error(receiveCheck.reason)

  const [playerSnap, sellerTeamSnap, buyerTeamSnap] = await Promise.all([
    getDoc(doc(db, 'leagues', leagueId, 'teams', listing.sellerTeamId, 'players', listing.playerId)),
    getDoc(doc(db, 'leagues', leagueId, 'teams', listing.sellerTeamId)),
    getDoc(doc(db, 'leagues', leagueId, 'teams', winnerTeamId)),
  ])
  if (!playerSnap.exists()) throw new Error('ไม่พบผู้เล่นในทีมต้นทาง (อาจถูกย้ายไปแล้ว)')
  if (!sellerTeamSnap.exists() || !buyerTeamSnap.exists()) throw new Error('ไม่พบทีมที่เกี่ยวข้อง')
  const player = toPlayer(playerSnap as QueryDocumentSnapshot<DocumentData>)
  const sellerTeam = toTeam(sellerTeamSnap as QueryDocumentSnapshot<DocumentData>)
  const buyerTeam = toTeam(buyerTeamSnap as QueryDocumentSnapshot<DocumentData>)
  const sellerProceeds = auctionSellerProceeds(winnerPrice)

  await commitInChunks([
    (batch) =>
      batch.delete(
        doc(db, 'leagues', leagueId, 'teams', listing.sellerTeamId, 'players', listing.playerId),
      ),
    (batch) =>
      batch.set(doc(db, 'leagues', leagueId, 'teams', winnerTeamId, 'players', listing.playerId), {
        name: player.name,
        position: player.position,
        age: player.age,
        joinedSeason: player.joinedSeason,
        tag: player.tag,
        isVeteran: player.isVeteran,
      }),
    (batch) =>
      batch.set(doc(transfersCol(leagueId)), {
        season: league.currentSeason,
        type: 'auction',
        fromTeamId: listing.sellerTeamId,
        toTeamId: winnerTeamId,
        playerId: listing.playerId,
        playerName: player.name,
        price: winnerPrice,
      }),
    (batch) =>
      batch.update(doc(db, 'leagues', leagueId, 'auctionListings', listingId), {
        status: 'closed',
      }),
    (batch) =>
      batch.update(doc(db, 'leagues', leagueId, 'teams', listing.sellerTeamId), {
        balance: sellerTeam.balance + sellerProceeds,
      }),
    (batch) =>
      batch.update(doc(db, 'leagues', leagueId, 'teams', winnerTeamId), {
        balance: buyerTeam.balance - winnerPrice,
      }),
    (batch) =>
      batch.set(doc(transactionsCol(leagueId, listing.sellerTeamId)), {
        type: 'income',
        category: 'auction_sale',
        desc: `ขาย ${player.name} ผ่านประมูล (ราคาเต็ม ${winnerPrice}, หักภาษี 30%)`,
        amount: sellerProceeds,
        season: league.currentSeason,
      }),
    (batch) =>
      batch.set(doc(transactionsCol(leagueId, winnerTeamId)), {
        type: 'expense',
        category: 'auction_purchase',
        desc: `ซื้อ ${player.name} ผ่านประมูล`,
        amount: winnerPrice,
        season: league.currentSeason,
      }),
    buildCurrentAdminLogWrite('close_auction', {
      leagueId,
      listingId,
      winnerTeamId,
      price: winnerPrice,
      sellerProceeds,
    }),
  ])
}

function toTearRequest(snap: QueryDocumentSnapshot<DocumentData>): TearRequest {
  const data = snap.data()
  return {
    id: snap.id,
    season: data.season,
    requesterTeamId: data.requesterTeamId,
    requesterTeamName: data.requesterTeamName,
    targetTeamId: data.targetTeamId,
    targetTeamName: data.targetTeamName,
    playerId: data.playerId,
    playerName: data.playerName,
    status: data.status,
    requestedAtMs: data.requestedAt ? data.requestedAt.toMillis() : null,
  }
}

export function subscribeTearRequests(
  leagueId: string,
  onChange: (requests: TearRequest[]) => void,
) {
  return onSnapshot(tearRequestsCol(leagueId), (snap) => onChange(snap.docs.map(toTearRequest)))
}

/**
 * ยื่นคำขอฉีกสัญญา — คิวรอ ไม่ประมวลผลทันที เปิดเผยพร้อมกันหมดตอนจบฤดูกาล (endSeason)
 */
export async function createTearRequest(
  leagueId: string,
  input: {
    requesterTeamId: string
    requesterTeamName: string
    targetTeamId: string
    targetTeamName: string
    playerId: string
    playerName: string
  },
): Promise<void> {
  const leagueSnap = await getDoc(doc(db, 'leagues', leagueId))
  if (!leagueSnap.exists()) throw new Error('ไม่พบลีก')
  const league = toLeague(leagueSnap as QueryDocumentSnapshot<DocumentData>)
  if (league.status !== 'in_season') throw new Error('ยื่นฉีกสัญญาได้เฉพาะตอนลีกกำลังแข่งขันเท่านั้น')
  if (input.requesterTeamId === input.targetTeamId)
    throw new Error('ทีมที่ยื่นและทีมเจ้าของนักเตะต้องไม่ใช่ทีมเดียวกัน')

  await addDoc(tearRequestsCol(leagueId), {
    ...input,
    season: league.currentSeason,
    status: 'pending',
    requestedAt: serverTimestamp(),
  })
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

export interface TeamPickerEntry {
  leagueId: string
  leagueName: string
  teamId: string
  teamName: string
}

/** ใช้แค่หน้า login — ให้ผู้จัดการทีมเลือกทีมตัวเองจากทุกลีก (ทีม/ลีก read: true อยู่แล้ว) */
export async function listAllTeamsForLogin(): Promise<TeamPickerEntry[]> {
  const leaguesSnap = await getDocs(leaguesCol())
  const leagues = leaguesSnap.docs.map(toLeague)
  const perLeague = await Promise.all(
    leagues.map(async (league) => {
      const teamsSnap = await getDocs(teamsCol(league.id))
      return teamsSnap.docs.map(toTeam).map((team) => ({
        leagueId: league.id,
        leagueName: league.name,
        teamId: team.id,
        teamName: team.name,
      }))
    }),
  )
  return perLeague.flat()
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

export async function createLeague(
  name: string,
  forfeitPenalty: number = DEFAULT_FORFEIT_PENALTY,
): Promise<string> {
  const ref = doc(leaguesCol())
  await commitInChunks([
    (batch) =>
      batch.set(ref, {
        name,
        status: 'transfer_window' satisfies LeagueStatus,
        currentSeason: 1,
        forfeitPenalty,
      }),
    buildCurrentAdminLogWrite('create_league', { leagueId: ref.id, name, forfeitPenalty }),
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

/**
 * balance เริ่มต้น: แอดมินกรอกเองตามความเหมาะสม (ไม่มีสูตรตายตัว เพราะทีมเข้าร่วมคนละฤดูกาลกัน)
 * balance สะสมข้ามฤดูกาล ไม่รีเซ็ตตอนเริ่มฤดูกาลใหม่
 */
export async function createTeam(
  leagueId: string,
  input: { name: string; managerUid: string; managerName: string; balance: number },
): Promise<void> {
  await addDoc(teamsCol(leagueId), { ...input, isForfeited: false })
}

/** แอดมินปรับ balance มือ (เช่น แก้ไขข้อผิดพลาด, ปรับตามกรณีพิเศษ) — บันทึกเป็น transaction เสมอ */
export async function adjustTeamBalance(
  leagueId: string,
  teamId: string,
  delta: number,
  desc: string,
): Promise<void> {
  const [leagueSnap, teamSnap] = await Promise.all([
    getDoc(doc(db, 'leagues', leagueId)),
    getDoc(doc(db, 'leagues', leagueId, 'teams', teamId)),
  ])
  if (!leagueSnap.exists()) throw new Error('ไม่พบลีก')
  if (!teamSnap.exists()) throw new Error('ไม่พบทีม')
  const league = toLeague(leagueSnap as QueryDocumentSnapshot<DocumentData>)
  const team = toTeam(teamSnap as QueryDocumentSnapshot<DocumentData>)

  await commitInChunks([
    (batch) =>
      batch.update(doc(db, 'leagues', leagueId, 'teams', teamId), { balance: team.balance + delta }),
    (batch) =>
      batch.set(doc(transactionsCol(leagueId, teamId)), {
        type: delta >= 0 ? 'income' : 'expense',
        category: 'admin_adjustment',
        desc,
        amount: Math.abs(delta),
        season: league.currentSeason,
      }),
    buildCurrentAdminLogWrite('adjust_team_balance', { leagueId, teamId, delta, desc }),
  ])
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

/**
 * เปิดเผยผลฉีกสัญญาทั้งหมดของฤดูกาล พร้อมกันตอนจบฤดูกาล (เอกสารข้อ 4)
 * กันปิงปอง: เทียบกับ tear ที่สำเร็จ "ครั้งล่าสุด" ของผู้เล่นแต่ละคน (ถ้ามี) ห้ามทีมที่เพิ่งเสียผู้เล่นไป
 * ยื่นฉีกคืนจากทีมที่เพิ่งได้ไปในทันที
 */
async function resolveTearRequestsForSeason(leagueId: string, season: number) {
  const [pendingSnap, allTearSnap, teamsSnap] = await Promise.all([
    getDocs(query(tearRequestsCol(leagueId), where('season', '==', season), where('status', '==', 'pending'))),
    getDocs(query(tearRequestsCol(leagueId), where('status', '==', 'success'))),
    getDocs(teamsCol(leagueId)),
  ])
  const pending = pendingSnap.docs.map(toTearRequest)
  if (pending.length === 0) return { writes: [] as Array<(batch: ReturnType<typeof writeBatch>) => void> }

  const pastSuccesses = allTearSnap.docs.map(toTearRequest)
  const lastSuccessByPlayer = new Map<string, TearRequest>()
  for (const t of pastSuccesses) {
    const existing = lastSuccessByPlayer.get(t.playerId)
    if (!existing || (t.requestedAtMs ?? 0) > (existing.requestedAtMs ?? 0)) {
      lastSuccessByPlayer.set(t.playerId, t)
    }
  }
  const blockedPairs = new Set<string>()
  for (const t of lastSuccessByPlayer.values()) {
    blockedPairs.add(blockedTearPairKey(t.playerId, t.targetTeamId, t.requesterTeamId))
  }

  const teamById = new Map(teamsSnap.docs.map((d) => [d.id, toTeam(d)]))
  const results = resolveTearRequests(
    pending.map((r) => ({
      id: r.id,
      playerId: r.playerId,
      requesterTeamId: r.requesterTeamId,
      targetTeamId: r.targetTeamId,
      requestedAtMs: r.requestedAtMs ?? 0,
    })),
    (teamId) => teamById.get(teamId)?.balance ?? 0,
    blockedPairs,
  )

  const writes: Array<(batch: ReturnType<typeof writeBatch>) => void> = []
  const balanceDelta = new Map<string, number>()
  for (const result of results) {
    const req = pending.find((r) => r.id === result.id) as TearRequest
    writes.push((batch) =>
      batch.update(doc(db, 'leagues', leagueId, 'tearRequests', result.id), {
        status: result.status,
      }),
    )
    if (result.status !== 'success') continue

    balanceDelta.set(
      req.requesterTeamId,
      (balanceDelta.get(req.requesterTeamId) ?? 0) - TEAR_BUYER_COST,
    )
    balanceDelta.set(
      req.targetTeamId,
      (balanceDelta.get(req.targetTeamId) ?? 0) + TEAR_ORIGIN_COMPENSATION,
    )

    const playerSnap = await getDoc(
      doc(db, 'leagues', leagueId, 'teams', req.targetTeamId, 'players', req.playerId),
    )
    if (!playerSnap.exists()) continue
    const player = toPlayer(playerSnap as QueryDocumentSnapshot<DocumentData>)

    writes.push((batch) =>
      batch.delete(doc(db, 'leagues', leagueId, 'teams', req.targetTeamId, 'players', req.playerId)),
    )
    writes.push((batch) =>
      batch.set(doc(db, 'leagues', leagueId, 'teams', req.requesterTeamId, 'players', req.playerId), {
        name: player.name,
        position: player.position,
        age: player.age,
        joinedSeason: player.joinedSeason,
        tag: player.tag,
        isVeteran: player.isVeteran,
      }),
    )
    writes.push((batch) =>
      batch.set(doc(transactionsCol(leagueId, req.requesterTeamId)), {
        type: 'expense',
        category: 'tear_paid',
        desc: `ฉีกสัญญาดึง ${player.name} จาก ${req.targetTeamName}`,
        amount: TEAR_BUYER_COST,
        season,
      }),
    )
    writes.push((batch) =>
      batch.set(doc(transactionsCol(leagueId, req.targetTeamId)), {
        type: 'income',
        category: 'tear_compensation',
        desc: `ถูกฉีกสัญญา ${player.name} โดย ${req.requesterTeamName} (ค่าชดเชย)`,
        amount: TEAR_ORIGIN_COMPENSATION,
        season,
      }),
    )
  }

  for (const [teamId, delta] of balanceDelta) {
    const team = teamById.get(teamId)
    if (!team) continue
    writes.push((batch) =>
      batch.update(doc(db, 'leagues', leagueId, 'teams', teamId), { balance: team.balance + delta }),
    )
  }

  return { writes }
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

  const writes: Array<(batch: ReturnType<typeof writeBatch>) => void> = []
  const penaltyDelta = new Map<string, number>()
  let unreportedCount = 0

  for (const m of scheduled) {
    const home = teamById.get(m.homeTeamId)
    const away = teamById.get(m.awayTeamId)
    const homeForfeited = home?.isForfeited ?? false
    const awayForfeited = away?.isForfeited ?? false

    if (homeForfeited && !awayForfeited) {
      writes.push((batch) =>
        batch.update(doc(db, 'leagues', leagueId, 'matches', m.id), {
          status: 'bye',
          winnerTeamId: m.awayTeamId,
        }),
      )
    } else if (awayForfeited && !homeForfeited) {
      writes.push((batch) =>
        batch.update(doc(db, 'leagues', leagueId, 'matches', m.id), {
          status: 'bye',
          winnerTeamId: m.homeTeamId,
        }),
      )
    } else if (!homeForfeited && !awayForfeited) {
      // ไม่มีทีมไหนฟอส แต่ไม่ส่งผล — บังคับเป็น 0-0 double-bye + ปรับเงินทั้ง 2 ทีม (เอกสารข้อ 5, ขั้น 1)
      unreportedCount++
      writes.push((batch) =>
        batch.update(doc(db, 'leagues', leagueId, 'matches', m.id), {
          status: 'bye',
          winnerTeamId: null,
          homeScore: 0,
          awayScore: 0,
        }),
      )
      penaltyDelta.set(m.homeTeamId, (penaltyDelta.get(m.homeTeamId) ?? 0) + league.forfeitPenalty)
      penaltyDelta.set(m.awayTeamId, (penaltyDelta.get(m.awayTeamId) ?? 0) + league.forfeitPenalty)
      writes.push((batch) =>
        batch.set(doc(transactionsCol(leagueId, m.homeTeamId)), {
          type: 'expense',
          category: 'forfeit_penalty',
          desc: `ไม่ส่งผลนัดที่ ${m.matchday} กับ ${away?.name ?? m.awayTeamId}`,
          amount: league.forfeitPenalty,
          season: league.currentSeason,
        }),
      )
      writes.push((batch) =>
        batch.set(doc(transactionsCol(leagueId, m.awayTeamId)), {
          type: 'expense',
          category: 'forfeit_penalty',
          desc: `ไม่ส่งผลนัดที่ ${m.matchday} กับ ${home?.name ?? m.homeTeamId}`,
          amount: league.forfeitPenalty,
          season: league.currentSeason,
        }),
      )
    } else {
      // ทั้งสองทีมฟอสพร้อมกัน — ไม่มีผู้ชนะ ไม่ปรับเงินซ้ำ (แต่ละทีมฟอสเสียแค่แข่งแพ้บายอื่นๆอยู่แล้ว)
      writes.push((batch) =>
        batch.update(doc(db, 'leagues', leagueId, 'matches', m.id), {
          status: 'bye',
          winnerTeamId: null,
        }),
      )
    }
  }

  for (const [teamId, delta] of penaltyDelta) {
    const team = teamById.get(teamId)
    if (!team) continue
    writes.push((batch) =>
      batch.update(doc(db, 'leagues', leagueId, 'teams', teamId), {
        balance: team.balance - delta,
      }),
    )
  }

  const { writes: tearWrites } = await resolveTearRequestsForSeason(leagueId, league.currentSeason)
  writes.push(...tearWrites)

  writes.push((batch) =>
    batch.update(doc(db, 'leagues', leagueId), { status: 'transfer_window' }),
  )
  writes.push(
    buildCurrentAdminLogWrite('end_season', {
      leagueId,
      season: league.currentSeason,
      byeMatches: scheduled.length,
      unreportedMatches: unreportedCount,
      tearRequestsResolved: tearWrites.length,
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
