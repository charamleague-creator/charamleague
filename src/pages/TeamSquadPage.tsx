import { type FormEvent, useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import {
  addPlayer,
  adjustTeamBalance,
  approveLineup,
  createAuctionListing,
  createTearRequest,
  removePlayer,
  sellOffPlayer,
  setPlayerVeteranTag,
  subscribeAuctionListings,
  subscribeLeague,
  subscribePlayers,
  subscribeSeasonTransfers,
  subscribeTeams,
  subscribeTransactions,
  submitLineup,
} from '@/features/leagues/api'
import { sellOffPayout } from '@/features/leagues/finance'
import { canReceive, canSell, countReceived, countSoldTotal, countSoldViaAuction } from '@/features/leagues/quotas'
import type {
  AuctionListing,
  League,
  Player,
  PlayerPosition,
  PlayerTag,
  Team,
  Transaction,
  Transfer,
} from '@/features/leagues/types'
import { useAuth } from '@/hooks/useAuth'

const POSITIONS: PlayerPosition[] = ['GK', 'DF', 'MF', 'FW']
const TAGS: PlayerTag[] = ['Academy', 'Academy72', 'Worldcup', 'นักเตะ65', 'Free']

export default function TeamSquadPage() {
  const { leagueId, teamId } = useParams<{ leagueId: string; teamId: string }>()
  const { role, user } = useAuth()
  const [league, setLeague] = useState<League | null>(null)
  const [teams, setTeams] = useState<Team[]>([])
  const [players, setPlayers] = useState<Player[]>([])
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!leagueId) return
    return subscribeLeague(leagueId, setLeague)
  }, [leagueId])

  useEffect(() => {
    if (!leagueId) return
    return subscribeTeams(leagueId, setTeams)
  }, [leagueId])

  useEffect(() => {
    if (!leagueId || !teamId) return
    return subscribePlayers(leagueId, teamId, setPlayers)
  }, [leagueId, teamId])

  useEffect(() => {
    if (!leagueId || !teamId) return
    return subscribeTransactions(leagueId, teamId, setTransactions)
  }, [leagueId, teamId])

  if (!leagueId || !teamId) return null
  const currentLeagueId: string = leagueId
  const currentTeamId: string = teamId
  const team = teams.find((t) => t.id === teamId)
  const myTeam = teams.find((t) => t.managerUid === user?.uid)

  async function handleAdd(input: {
    name: string
    position: PlayerPosition
    age: number
    tag: PlayerTag
  }) {
    setError(null)
    try {
      await addPlayer(currentLeagueId, currentTeamId, {
        ...input,
        joinedSeason: league?.currentSeason ?? 1,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  async function handleRemove(playerId: string) {
    setError(null)
    try {
      await removePlayer(currentLeagueId, currentTeamId, playerId)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  async function handleSellOff(playerId: string) {
    setError(null)
    try {
      await sellOffPlayer(currentLeagueId, currentTeamId, playerId)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  async function handleToggleVeteran(playerId: string, isVeteran: boolean) {
    setError(null)
    try {
      await setPlayerVeteranTag(currentLeagueId, currentTeamId, playerId, isVeteran)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  const isOwnManager = !!user && !!team && user.uid === team.managerUid
  const canManageSquad = role === 'admin' || isOwnManager
  const otherTeams = teams.filter((t) => t.id !== teamId)

  async function handleListForAuction(
    player: Player,
    startingPrice: number,
    guaranteedBuyerTeamId?: string,
  ) {
    setError(null)
    if (!team) return
    const guaranteedBuyerTeam = teams.find((t) => t.id === guaranteedBuyerTeamId)
    try {
      await createAuctionListing(currentLeagueId, {
        sellerTeamId: currentTeamId,
        sellerTeamName: team.name,
        playerId: player.id,
        playerName: player.name,
        playerPosition: player.position,
        playerAge: player.age,
        startingPrice,
        guaranteedBuyerTeamId: guaranteedBuyerTeam?.id,
        guaranteedBuyerTeamName: guaranteedBuyerTeam?.name,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  async function handleTear(player: Player, requesterTeamId: string) {
    setError(null)
    const requesterTeam = teams.find((t) => t.id === requesterTeamId)
    if (!team || !requesterTeam) return
    try {
      await createTearRequest(currentLeagueId, {
        requesterTeamId: requesterTeam.id,
        requesterTeamName: requesterTeam.name,
        targetTeamId: team.id,
        targetTeamName: team.name,
        playerId: player.id,
        playerName: player.name,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  async function handleAdjustBalance(delta: number, desc: string) {
    setError(null)
    try {
      await adjustTeamBalance(currentLeagueId, currentTeamId, delta, desc)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  async function handleSubmitLineup() {
    setError(null)
    try {
      await submitLineup(currentLeagueId, currentTeamId)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  async function handleApproveLineup() {
    setError(null)
    try {
      await approveLineup(currentLeagueId, currentTeamId)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  const canRequestTearAsOwnTeam = !!myTeam && myTeam.id !== teamId
  const canRequestTearAsAdmin = role === 'admin' && otherTeams.length > 0

  return (
    <main style={{ maxWidth: 640, margin: '2rem auto' }}>
      <h1>{team?.name ?? 'ทีม'} — รายชื่อผู้เล่น</h1>
      <p>
        จำนวนผู้เล่นในทีม: {players.length} · Balance: {team?.balance ?? '-'}M · Lineup:{' '}
        {team?.lineupApproved
          ? 'อนุมัติแล้ว'
          : team?.lineupSubmitted
            ? 'ส่งแล้ว รออนุมัติ'
            : 'ยังไม่ส่ง'}
        {canManageSquad && !team?.lineupApproved && (
          <button type="button" onClick={handleSubmitLineup}>
            ส่ง Lineup
          </button>
        )}
        {role === 'admin' && team?.lineupSubmitted && !team?.lineupApproved && (
          <button type="button" onClick={handleApproveLineup}>
            อนุมัติ Lineup
          </button>
        )}
      </p>
      {error && <p role="alert">{error}</p>}
      <ul>
        {players.map((player) => (
          <li key={player.id}>
            {player.name} ({player.position}, อายุ {player.age}, Tag: {player.tag}
            {player.isVeteran && ' + veteran'} — ย่อยได้ {sellOffPayout(player.tag, player.isVeteran)}M)
            {canManageSquad && (
              <button type="button" onClick={() => handleSellOff(player.id)}>
                ย่อยนักเตะ
              </button>
            )}
            {role === 'admin' && (
              <button type="button" onClick={() => handleRemove(player.id)}>
                ลบ (แก้ข้อมูลผิด)
              </button>
            )}
            {role === 'admin' && (
              <button
                type="button"
                onClick={() => handleToggleVeteran(player.id, !player.isVeteran)}
              >
                {player.isVeteran ? 'เอา Tag พิเศษ (veteran) ออก' : 'ให้ Tag พิเศษ (veteran)'}
              </button>
            )}
            {canManageSquad && (
              <ListForAuctionForm
                otherTeams={otherTeams}
                onSubmit={(startingPrice, guaranteedBuyerTeamId) =>
                  handleListForAuction(player, startingPrice, guaranteedBuyerTeamId)
                }
              />
            )}
            {canRequestTearAsOwnTeam && myTeam && (
              <button type="button" onClick={() => handleTear(player, myTeam.id)}>
                ฉีกสัญญาดึงตัวไปทีมของฉัน (80M)
              </button>
            )}
            {canRequestTearAsAdmin && !canRequestTearAsOwnTeam && (
              <TearAsAdminForm
                teams={otherTeams}
                onSubmit={(requesterTeamId) => handleTear(player, requesterTeamId)}
              />
            )}
          </li>
        ))}
      </ul>
      {role === 'admin' && <AddPlayerForm onSubmit={handleAdd} />}
      {role === 'admin' && <AdjustBalanceForm onSubmit={handleAdjustBalance} />}
      {canManageSquad && transactions.length > 0 && (
        <>
          <h2>ประวัติธุรกรรม</h2>
          <ul>
            {transactions.map((t) => (
              <li key={t.id}>
                ฤดูกาล {t.season} — {t.category} — {t.desc} —{' '}
                {t.type === 'income' ? '+' : '-'}
                {t.amount}M
              </li>
            ))}
          </ul>
        </>
      )}
      {role === 'admin' && league && (
        <QuotaInspector leagueId={currentLeagueId} teamId={currentTeamId} league={league} />
      )}
    </main>
  )
}

function ListForAuctionForm({
  otherTeams,
  onSubmit,
}: {
  otherTeams: Team[]
  onSubmit: (startingPrice: number, guaranteedBuyerTeamId?: string) => void
}) {
  const [startingPrice, setStartingPrice] = useState('')
  const [guaranteedBuyerTeamId, setGuaranteedBuyerTeamId] = useState('')

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    onSubmit(Number(startingPrice), guaranteedBuyerTeamId || undefined)
    setStartingPrice('')
    setGuaranteedBuyerTeamId('')
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'inline' }}>
      <input
        type="number"
        min={0}
        placeholder="ราคาเริ่มประมูล"
        value={startingPrice}
        onChange={(e) => setStartingPrice(e.target.value)}
        required
        style={{ width: '7em' }}
      />
      <select
        value={guaranteedBuyerTeamId}
        onChange={(e) => setGuaranteedBuyerTeamId(e.target.value)}
      >
        <option value="">ไม่มีการันตี</option>
        {otherTeams.map((t) => (
          <option key={t.id} value={t.id}>
            การันตีโดย {t.name}
          </option>
        ))}
      </select>
      <button type="submit">ส่งเข้าประมูล</button>
    </form>
  )
}

function TearAsAdminForm({
  teams,
  onSubmit,
}: {
  teams: Team[]
  onSubmit: (requesterTeamId: string) => void
}) {
  const [requesterTeamId, setRequesterTeamId] = useState(teams[0]?.id ?? '')

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!requesterTeamId) return
    onSubmit(requesterTeamId)
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'inline' }}>
      <select value={requesterTeamId} onChange={(e) => setRequesterTeamId(e.target.value)}>
        {teams.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </select>
      <button type="submit">ยื่นฉีกสัญญาแทนทีมนี้</button>
    </form>
  )
}

function AddPlayerForm({
  onSubmit,
}: {
  onSubmit: (input: { name: string; position: PlayerPosition; age: number; tag: PlayerTag }) => void
}) {
  const [name, setName] = useState('')
  const [position, setPosition] = useState<PlayerPosition>('MF')
  const [age, setAge] = useState('')
  const [tag, setTag] = useState<PlayerTag>('Free')

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    onSubmit({ name, position, age: Number(age), tag })
    setName('')
    setAge('')
  }

  return (
    <form onSubmit={handleSubmit}>
      <input
        placeholder="ชื่อผู้เล่น"
        value={name}
        onChange={(e) => setName(e.target.value)}
        required
      />
      <select value={position} onChange={(e) => setPosition(e.target.value as PlayerPosition)}>
        {POSITIONS.map((p) => (
          <option key={p} value={p}>
            {p}
          </option>
        ))}
      </select>
      <input
        type="number"
        placeholder="อายุ"
        min={0}
        value={age}
        onChange={(e) => setAge(e.target.value)}
        required
      />
      <select value={tag} onChange={(e) => setTag(e.target.value as PlayerTag)}>
        {TAGS.map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </select>
      <button type="submit">เพิ่มผู้เล่น</button>
    </form>
  )
}

function AdjustBalanceForm({ onSubmit }: { onSubmit: (delta: number, desc: string) => void }) {
  const [delta, setDelta] = useState('')
  const [desc, setDesc] = useState('')

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    onSubmit(Number(delta), desc)
    setDelta('')
    setDesc('')
  }

  return (
    <form onSubmit={handleSubmit}>
      <input
        type="number"
        placeholder="ปรับ balance (+/-)"
        value={delta}
        onChange={(e) => setDelta(e.target.value)}
        required
        style={{ width: '9em' }}
      />
      <input
        placeholder="เหตุผล"
        value={desc}
        onChange={(e) => setDesc(e.target.value)}
        required
      />
      <button type="submit">ปรับ Balance</button>
    </form>
  )
}

/**
 * เอกสาร phase 07 ข้อ 4: เครื่องมือดูรายละเอียดโควตาเจาะลึก — โชว์ทุกรายการที่เกี่ยวข้องกับทีมนี้
 * ในฤดูกาลปัจจุบัน ไม่ว่าสถานะไหน (transfer ที่สำเร็จแล้ว + auction listing ทุกสถานะ) พร้อมผลลัพธ์
 * canSell/canReceive ที่คำนวณจากรายการเดียวกันนี้เป๊ะๆ — มีประโยชน์ตอนตัวเลขที่โชว์ไม่ตรงกับที่คาด
 */
function QuotaInspector({
  leagueId,
  teamId,
  league,
}: {
  leagueId: string
  teamId: string
  league: League
}) {
  const [transfers, setTransfers] = useState<Transfer[]>([])
  const [allListings, setAllListings] = useState<AuctionListing[]>([])

  useEffect(() => {
    return subscribeSeasonTransfers(leagueId, league.currentSeason, setTransfers)
  }, [leagueId, league.currentSeason])

  useEffect(() => {
    return subscribeAuctionListings(leagueId, setAllListings)
  }, [leagueId])

  const listings = allListings.filter(
    (l) => l.sellerTeamId === teamId && l.season === league.currentSeason,
  )
  const pendingOrOpen = listings.filter(
    (l) => l.status === 'pending_approval' || l.status === 'open',
  ).length
  const soldTotal = countSoldTotal(transfers, teamId, league.currentSeason)
  const soldViaAuction = countSoldViaAuction(transfers, teamId, league.currentSeason)
  const received = countReceived(transfers, teamId, league.currentSeason)
  const sellCheck = canSell(transfers, teamId, league.currentSeason, 'auction', pendingOrOpen)
  const receiveCheck = canReceive(transfers, teamId, league.currentSeason)

  return (
    <details style={{ marginTop: '1rem' }}>
      <summary>ตรวจสอบโควตา (แอดมิน)</summary>
      <p>
        ขายรวม (transfer สำเร็จ): {soldTotal} — ขายผ่านประมูล: {soldViaAuction} — รับเข้า: {received} —
        รายการประมูลที่ยังไม่ปิด (pending/open): {pendingOrOpen}
      </p>
      <p>
        ผลตรวจ canSell (auction): {sellCheck.allowed ? 'ขายได้' : `ขายไม่ได้ — ${sellCheck.reason}`}
        <br />
        ผลตรวจ canReceive: {receiveCheck.allowed ? 'รับได้' : `รับไม่ได้ — ${receiveCheck.reason}`}
      </p>
      <h3>Transfer ทั้งหมด (ฤดูกาลนี้)</h3>
      <ul>
        {transfers
          .filter((t) => t.fromTeamId === teamId || t.toTeamId === teamId)
          .map((t) => (
            <li key={t.id}>
              {t.type} — {t.playerName} — จาก {t.fromTeamId} ไป {t.toTeamId} — {t.price}M
            </li>
          ))}
        {transfers.filter((t) => t.fromTeamId === teamId || t.toTeamId === teamId).length === 0 && (
          <li>ไม่มี</li>
        )}
      </ul>
      <h3>Auction Listing ทั้งหมด (ฤดูกาลนี้ ทุกสถานะ)</h3>
      <ul>
        {listings.map((l) => (
          <li key={l.id}>
            {l.playerName} — สถานะ: {l.status} — ราคาเริ่ม {l.startingPrice}M
            {l.highestBid !== null && ` — สูงสุด ${l.highestBid}M โดย ${l.highestBidderTeamName}`}
          </li>
        ))}
        {listings.length === 0 && <li>ไม่มี</li>}
      </ul>
    </details>
  )
}
