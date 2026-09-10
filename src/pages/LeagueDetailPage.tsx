import { type FormEvent, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  approveAuctionListing,
  closeAuction,
  createTeam,
  endSeason,
  placeBid,
  rejectAuctionListing,
  reportMatchResult,
  setTeamForfeited,
  startNewSeason,
  subscribeAuctionListings,
  subscribeLeague,
  subscribeSeasonMatches,
  subscribeTeams,
  subscribeTearRequests,
  updateLeagueSettings,
  updateTeam,
} from '@/features/leagues/api'
import { computeStandings } from '@/features/leagues/standings'
import type { AuctionListing, League, Match, Team, TearRequest } from '@/features/leagues/types'
import { createCup, subscribeCups } from '@/features/cups/api'
import type { Cup, CupType } from '@/features/cups/types'
import { useAuth } from '@/hooks/useAuth'

export default function LeagueDetailPage() {
  const { leagueId } = useParams<{ leagueId: string }>()
  const { user, role } = useAuth()
  const [league, setLeague] = useState<League | null>(null)
  const [teams, setTeams] = useState<Team[]>([])
  const [matches, setMatches] = useState<Match[]>([])
  const [auctionListings, setAuctionListings] = useState<AuctionListing[]>([])
  const [tearRequests, setTearRequests] = useState<TearRequest[]>([])
  const [cups, setCups] = useState<Cup[]>([])
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
    if (!leagueId || !league) return
    return subscribeSeasonMatches(leagueId, league.currentSeason, setMatches)
  }, [leagueId, league?.currentSeason])

  useEffect(() => {
    if (!leagueId) return
    return subscribeCups(leagueId, setCups)
  }, [leagueId])

  useEffect(() => {
    if (!leagueId) return
    return subscribeAuctionListings(leagueId, setAuctionListings)
  }, [leagueId])

  useEffect(() => {
    if (!leagueId) return
    return subscribeTearRequests(leagueId, setTearRequests)
  }, [leagueId])

  if (!leagueId || !league) return <main style={{ margin: '2rem' }}>กำลังโหลด...</main>

  const teamsById = new Map(teams.map((t) => [t.id, t]))
  const standings = computeStandings(matches, teams)
  const myTeam = teams.find((t) => !!user && t.managerUid === user.uid)

  // การ์ดสรุป + คอลัมน์ "ฟอร์ม" (เอกสาร phase 08) — สรุป/จัดเรียงข้อมูลที่คำนวณจาก standings/matches
  // อยู่แล้วเพื่อแสดงผลเท่านั้น ไม่แตะตรรกะการคำนวณคะแนน/ผลแข่งใดๆ
  const playedMatches = matches.filter((m) => m.status === 'played')
  const totalGoals = playedMatches.reduce((sum, m) => sum + (m.homeScore ?? 0) + (m.awayScore ?? 0), 0)

  function last5Form(teamId: string): Array<'win' | 'draw' | 'loss'> {
    return playedMatches
      .filter((m) => m.homeTeamId === teamId || m.awayTeamId === teamId)
      .slice(-5)
      .map((m) => {
        const isHome = m.homeTeamId === teamId
        const my = isHome ? m.homeScore! : m.awayScore!
        const opp = isHome ? m.awayScore! : m.homeScore!
        return my > opp ? 'win' : my < opp ? 'loss' : 'draw'
      })
  }

  async function run(action: () => Promise<unknown>) {
    setError(null)
    try {
      await action()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <main style={{ maxWidth: 900, margin: '2rem auto' }}>
      <h1>
        {league.name} — ฤดูกาล {league.currentSeason}
      </h1>
      <p>สถานะ: {league.status === 'in_season' ? 'กำลังแข่งขัน' : 'ตลาดเปิด'}</p>
      {error && <p role="alert">{error}</p>}

      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-card__icon" style={{ background: 'var(--accent-bg)', color: 'var(--accent-strong)' }}>
            👥
          </div>
          <div>
            <div className="stat-card__value">{teams.length}</div>
            <p className="stat-card__label">ทีมทั้งหมด</p>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-card__icon" style={{ background: 'rgba(34, 197, 94, 0.15)', color: 'var(--success)' }}>
            📅
          </div>
          <div>
            <div className="stat-card__value">{playedMatches.length}</div>
            <p className="stat-card__label">นัดที่แข่งแล้ว</p>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-card__icon" style={{ background: 'rgba(242, 193, 78, 0.15)', color: 'var(--gold)' }}>
            ⚽
          </div>
          <div>
            <div className="stat-card__value">{totalGoals}</div>
            <p className="stat-card__label">ประตูรวม</p>
          </div>
        </div>
      </div>

      {role === 'admin' && (
        <section>
          {league.status === 'in_season' ? (
            <button type="button" onClick={() => run(() => endSeason(leagueId))}>
              จบฤดูกาล
            </button>
          ) : (
            <button type="button" onClick={() => run(() => startNewSeason(leagueId))}>
              เริ่มฤดูกาลใหม่
            </button>
          )}
        </section>
      )}

      {role === 'admin' && (
        <LeagueSettingsForm
          league={league}
          onSubmit={(settings) => run(() => updateLeagueSettings(leagueId, settings))}
        />
      )}

      <h2>ตารางคะแนน</h2>
      <table>
        <thead>
          <tr>
            <th>ทีม</th>
            <th>แข่ง</th>
            <th>ชนะ</th>
            <th>เสมอ</th>
            <th>แพ้</th>
            <th>+/-</th>
            <th>แต้ม</th>
            <th>ฟอร์ม</th>
          </tr>
        </thead>
        <tbody>
          {standings.map((row) => (
            <tr key={row.teamId}>
              <td>
                <Link to={`/leagues/${leagueId}/teams/${row.teamId}`}>{row.teamName}</Link>
                {teamsById.get(row.teamId)?.isForfeited && ' (ฟอส)'}
              </td>
              <td>{row.played}</td>
              <td>{row.won}</td>
              <td>{row.drawn}</td>
              <td>{row.lost}</td>
              <td>{row.goalDifference}</td>
              <td>{row.points}</td>
              <td>
                <span className="form-dots">
                  {last5Form(row.teamId).map((result, i) => (
                    <span key={i} className={`form-dot form-dot--${result}`} title={result} />
                  ))}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>ตารางแข่ง</h2>
      <ul>
        {matches.map((match) => (
          <li key={match.id}>
            นัดที่ {match.matchday}: {teamsById.get(match.homeTeamId)?.name ?? match.homeTeamId} vs{' '}
            {teamsById.get(match.awayTeamId)?.name ?? match.awayTeamId} —{' '}
            {match.status === 'played' && `${match.homeScore} - ${match.awayScore}`}
            {match.status === 'bye' && 'บาย'}
            {match.status === 'scheduled' &&
              (role === 'admin' || (user && match.involvedManagerUids.includes(user.uid))) && (
                <ScoreForm
                  onSubmit={(homeScore, awayScore) =>
                    run(() => reportMatchResult(leagueId, match.id, homeScore, awayScore))
                  }
                />
              )}
            {match.status === 'scheduled' &&
              role !== 'admin' &&
              !(user && match.involvedManagerUids.includes(user.uid)) &&
              'ยังไม่แข่ง'}
          </li>
        ))}
      </ul>

      <h2>คำขอฉีกสัญญา (คิวรอ เปิดเผยผลตอนจบฤดูกาล)</h2>
      <ul>
        {tearRequests.length === 0 && <li>ไม่มีคำขอ</li>}
        {tearRequests
          .filter((t) => t.season === league.currentSeason)
          .map((t) => (
            <li key={t.id}>
              {t.requesterTeamName} ยื่นฉีกสัญญาดึง {t.playerName} จาก {t.targetTeamName} — สถานะ:{' '}
              {t.status}
            </li>
          ))}
      </ul>

      <h2>ประมูล</h2>
      <ul>
        {auctionListings.length === 0 && <li>ไม่มีรายการประมูล</li>}
        {auctionListings.map((listing) => {
          const canBid =
            listing.status === 'open' && !!myTeam && myTeam.id !== listing.sellerTeamId
          return (
            <li key={listing.id}>
              {listing.sellerTeamName} ส่ง {listing.playerName} ({listing.playerPosition}) เข้าประมูล
              ราคาเริ่ม {listing.startingPrice} — สถานะ: {listing.status}
              {listing.highestBid !== null &&
                ` (สูงสุด ${listing.highestBid} โดย ${listing.highestBidderTeamName})`}
              {listing.status === 'pending_approval' && role === 'admin' && (
                <>
                  <button
                    type="button"
                    onClick={() => run(() => approveAuctionListing(leagueId, listing.id))}
                  >
                    อนุมัติ
                  </button>
                  <button
                    type="button"
                    onClick={() => run(() => rejectAuctionListing(leagueId, listing.id))}
                  >
                    ปฏิเสธ
                  </button>
                </>
              )}
              {canBid && myTeam && (
                <BidForm
                  minAmount={(listing.highestBid ?? listing.startingPrice - 1) + 1}
                  onSubmit={(amount) =>
                    run(() => placeBid(leagueId, listing.id, myTeam.id, myTeam.name, amount))
                  }
                />
              )}
              {listing.status === 'open' && role === 'admin' && (
                <button type="button" onClick={() => run(() => closeAuction(leagueId, listing.id))}>
                  ปิดประมูล
                </button>
              )}
            </li>
          )
        })}
      </ul>

      <h2>ถ้วย</h2>
      <ul>
        {cups.length === 0 && <li>ไม่มีถ้วย</li>}
        {cups.map((cup) => (
          <li key={cup.id}>
            <Link to={`/leagues/${leagueId}/cups/${cup.id}`}>
              {cup.name} ({cup.type === 'major' ? 'ถ้วยใหญ่' : 'ถ้วยเล็ก'})
            </Link>{' '}
            — สถานะ: {cup.status === 'completed' ? 'จบแล้ว' : 'กำลังแข่ง'}
          </li>
        ))}
      </ul>
      {role === 'admin' && (
        <CreateCupForm
          teams={teams}
          onSubmit={(input) =>
            run(() => createCup(leagueId, { ...input, season: league.currentSeason }))
          }
        />
      )}

      {role === 'admin' && (
        <section>
          <h2>จัดการทีม</h2>
          <ul>
            {teams.map((team) => (
              <li key={team.id}>
                {team.name} (ผู้จัดการทีม: {team.managerName}, Balance: {team.balance}M, Lineup:{' '}
                {team.isForfeited
                  ? 'ฟอส (ข้ามได้)'
                  : team.lineupApproved
                    ? 'อนุมัติแล้ว'
                    : team.lineupSubmitted
                      ? 'ส่งแล้ว รออนุมัติ'
                      : 'ยังไม่ส่ง'}
                ){' '}
                <label>
                  <input
                    type="checkbox"
                    checked={team.isForfeited}
                    onChange={(e) => run(() => setTeamForfeited(leagueId, team.id, e.target.checked))}
                  />
                  ฟอส
                </label>
                <EditTeamForm
                  team={team}
                  onSubmit={(input) => run(() => updateTeam(leagueId, team.id, input))}
                />
              </li>
            ))}
          </ul>
          <AddTeamForm
            onSubmit={(input) => run(() => createTeam(leagueId, input))}
          />
        </section>
      )}
    </main>
  )
}

/**
 * เอกสาร phase 07 ข้อ 1: ตัวเลขทางการเงินทั้งหมดปรับได้ในหน้าเดียว แก้ทีหลังได้ตลอด
 * ไม่ใช่กำหนดตายตัวตอนสร้างลีกครั้งเดียว
 */
function LeagueSettingsForm({
  league,
  onSubmit,
}: {
  league: League
  onSubmit: (settings: {
    forfeitPenalty: number
    academy72Limit: number
    unbeatenBonus: number
    auctionTaxRate: number
    tearBuyerCost: number
    tearOriginCompensation: number
  }) => void
}) {
  const [forfeitPenalty, setForfeitPenalty] = useState(String(league.forfeitPenalty))
  const [academy72Limit, setAcademy72Limit] = useState(String(league.academy72Limit))
  const [unbeatenBonus, setUnbeatenBonus] = useState(String(league.unbeatenBonus))
  const [auctionTaxPercent, setAuctionTaxPercent] = useState(String(league.auctionTaxRate * 100))
  const [tearBuyerCost, setTearBuyerCost] = useState(String(league.tearBuyerCost))
  const [tearOriginCompensation, setTearOriginCompensation] = useState(
    String(league.tearOriginCompensation),
  )

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    onSubmit({
      forfeitPenalty: Number(forfeitPenalty),
      academy72Limit: Number(academy72Limit),
      unbeatenBonus: Number(unbeatenBonus),
      auctionTaxRate: Number(auctionTaxPercent) / 100,
      tearBuyerCost: Number(tearBuyerCost),
      tearOriginCompensation: Number(tearOriginCompensation),
    })
  }

  return (
    <form onSubmit={handleSubmit}>
      <h2>ตั้งค่าลีก (ตัวเลขทางการเงิน)</h2>
      <label>
        ค่าปรับนัดไม่ส่งผล (M/ทีม){' '}
        <input
          type="number"
          min={0}
          value={forfeitPenalty}
          onChange={(e) => setForfeitPenalty(e.target.value)}
          required
          style={{ width: '7em' }}
        />
      </label>
      <br />
      <label>
        ถือ Academy72 ได้สูงสุด (คน){' '}
        <input
          type="number"
          min={0}
          value={academy72Limit}
          onChange={(e) => setAcademy72Limit(e.target.value)}
          required
          style={{ width: '7em' }}
        />
      </label>
      <br />
      <label>
        โบนัสแชมป์ไร้พ่าย (M){' '}
        <input
          type="number"
          min={0}
          value={unbeatenBonus}
          onChange={(e) => setUnbeatenBonus(e.target.value)}
          required
          style={{ width: '7em' }}
        />
      </label>
      <br />
      <label>
        ภาษีขายผ่านประมูล (%){' '}
        <input
          type="number"
          min={0}
          max={100}
          value={auctionTaxPercent}
          onChange={(e) => setAuctionTaxPercent(e.target.value)}
          required
          style={{ width: '7em' }}
        />
      </label>
      <br />
      <label>
        ค่าฉีกสัญญา ที่ผู้ฉีกจ่าย (M){' '}
        <input
          type="number"
          min={0}
          value={tearBuyerCost}
          onChange={(e) => setTearBuyerCost(e.target.value)}
          required
          style={{ width: '7em' }}
        />
      </label>
      <br />
      <label>
        ค่าชดเชยตอนโดนฉีก (M){' '}
        <input
          type="number"
          min={0}
          value={tearOriginCompensation}
          onChange={(e) => setTearOriginCompensation(e.target.value)}
          required
          style={{ width: '7em' }}
        />
      </label>
      <br />
      <button type="submit">บันทึกการตั้งค่า</button>
    </form>
  )
}

function EditTeamForm({
  team,
  onSubmit,
}: {
  team: Team
  onSubmit: (input: { name: string; managerUid: string; managerName: string }) => void
}) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(team.name)
  const [managerUid, setManagerUid] = useState(team.managerUid)
  const [managerName, setManagerName] = useState(team.managerName)

  if (!editing) {
    return (
      <button type="button" onClick={() => setEditing(true)}>
        แก้ไข
      </button>
    )
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    onSubmit({ name, managerUid, managerName })
    setEditing(false)
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'inline' }}>
      <input placeholder="ชื่อทีม" value={name} onChange={(e) => setName(e.target.value)} required />
      <input
        placeholder="Manager UID"
        value={managerUid}
        onChange={(e) => setManagerUid(e.target.value)}
        required
      />
      <input
        placeholder="ชื่อผู้จัดการทีม"
        value={managerName}
        onChange={(e) => setManagerName(e.target.value)}
        required
      />
      <button type="submit">บันทึก</button>
      <button type="button" onClick={() => setEditing(false)}>
        ยกเลิก
      </button>
    </form>
  )
}

function ScoreForm({ onSubmit }: { onSubmit: (homeScore: number, awayScore: number) => void }) {
  const [homeScore, setHomeScore] = useState('')
  const [awayScore, setAwayScore] = useState('')

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    onSubmit(Number(homeScore), Number(awayScore))
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'inline' }}>
      <input
        type="number"
        min={0}
        value={homeScore}
        onChange={(e) => setHomeScore(e.target.value)}
        required
        style={{ width: '3em' }}
      />
      -
      <input
        type="number"
        min={0}
        value={awayScore}
        onChange={(e) => setAwayScore(e.target.value)}
        required
        style={{ width: '3em' }}
      />
      <button type="submit">บันทึกผล</button>
    </form>
  )
}

function CreateCupForm({
  teams,
  onSubmit,
}: {
  teams: Team[]
  onSubmit: (input: { name: string; type: CupType; teamIds: string[] }) => void
}) {
  const [name, setName] = useState('')
  const [type, setType] = useState<CupType>('major')
  const [selected, setSelected] = useState<string[]>([])

  function toggle(teamId: string) {
    setSelected((prev) =>
      prev.includes(teamId) ? prev.filter((id) => id !== teamId) : [...prev, teamId],
    )
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    onSubmit({ name, type, teamIds: selected })
    setName('')
    setSelected([])
  }

  return (
    <form onSubmit={handleSubmit}>
      <input
        placeholder="ชื่อถ้วย"
        value={name}
        onChange={(e) => setName(e.target.value)}
        required
      />
      <select value={type} onChange={(e) => setType(e.target.value as CupType)}>
        <option value="major">ถ้วยใหญ่</option>
        <option value="minor">ถ้วยเล็ก</option>
      </select>
      {teams.map((t) => (
        <label key={t.id}>
          <input
            type="checkbox"
            checked={selected.includes(t.id)}
            onChange={() => toggle(t.id)}
          />
          {t.name}
        </label>
      ))}
      <button type="submit" disabled={selected.length < 2}>
        สร้างถ้วย
      </button>
    </form>
  )
}

function BidForm({
  minAmount,
  onSubmit,
}: {
  minAmount: number
  onSubmit: (amount: number) => void
}) {
  const [amount, setAmount] = useState(String(minAmount))

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    onSubmit(Number(amount))
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'inline' }}>
      <input
        type="number"
        min={minAmount}
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        required
        style={{ width: '6em' }}
      />
      <button type="submit">ประมูล</button>
    </form>
  )
}

function AddTeamForm({
  onSubmit,
}: {
  onSubmit: (input: {
    name: string
    managerUid: string
    managerName: string
    balance: number
  }) => void
}) {
  const [name, setName] = useState('')
  const [managerUid, setManagerUid] = useState('')
  const [managerName, setManagerName] = useState('')
  const [balance, setBalance] = useState('')

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    onSubmit({ name, managerUid, managerName, balance: Number(balance) })
    setName('')
    setManagerUid('')
    setManagerName('')
    setBalance('')
  }

  return (
    <form onSubmit={handleSubmit}>
      <input placeholder="ชื่อทีม" value={name} onChange={(e) => setName(e.target.value)} required />
      <input
        placeholder="Manager UID (จาก Firebase Console)"
        value={managerUid}
        onChange={(e) => setManagerUid(e.target.value)}
        required
      />
      <input
        placeholder="ชื่อผู้จัดการทีม"
        value={managerName}
        onChange={(e) => setManagerName(e.target.value)}
        required
      />
      <input
        type="number"
        placeholder="Balance เริ่มต้น (M)"
        value={balance}
        onChange={(e) => setBalance(e.target.value)}
        required
        style={{ width: '9em' }}
      />
      <button type="submit">เพิ่มทีม</button>
    </form>
  )
}
