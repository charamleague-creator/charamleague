import { type FormEvent, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  completeSale,
  createTeam,
  endSeason,
  reportMatchResult,
  respondToSaleOffer,
  setTeamForfeited,
  startNewSeason,
  subscribeFreeAgents,
  subscribeLeague,
  subscribeSaleOffers,
  subscribeSeasonMatches,
  subscribeTeams,
} from '@/features/leagues/api'
import { computeStandings } from '@/features/leagues/standings'
import type { FreeAgent, League, Match, SaleOffer, Team } from '@/features/leagues/types'
import { useAuth } from '@/hooks/useAuth'

export default function LeagueDetailPage() {
  const { leagueId } = useParams<{ leagueId: string }>()
  const { user, role } = useAuth()
  const [league, setLeague] = useState<League | null>(null)
  const [teams, setTeams] = useState<Team[]>([])
  const [matches, setMatches] = useState<Match[]>([])
  const [freeAgents, setFreeAgents] = useState<FreeAgent[]>([])
  const [saleOffers, setSaleOffers] = useState<SaleOffer[]>([])
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
    return subscribeFreeAgents(leagueId, setFreeAgents)
  }, [leagueId])

  useEffect(() => {
    if (!leagueId) return
    return subscribeSaleOffers(leagueId, setSaleOffers)
  }, [leagueId])

  if (!leagueId || !league) return <main style={{ margin: '2rem' }}>กำลังโหลด...</main>

  const teamsById = new Map(teams.map((t) => [t.id, t]))
  const standings = computeStandings(matches, teams)

  async function run(action: () => Promise<void>) {
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

      <h2>ผู้เล่นอิสระ (ฉีกสัญญาแล้ว รอทีมใหม่รับเข้า)</h2>
      <ul>
        {freeAgents.length === 0 && <li>ไม่มีผู้เล่นอิสระ</li>}
        {freeAgents.map((agent) => (
          <li key={agent.id}>
            {agent.name} ({agent.position}, อายุ {agent.age}) — ปล่อยจาก {agent.releasedFromTeamName}{' '}
            (ฤดูกาล {agent.releasedSeason})
          </li>
        ))}
      </ul>

      <h2>ข้อเสนอซื้อขาย</h2>
      <ul>
        {saleOffers.length === 0 && <li>ไม่มีข้อเสนอ</li>}
        {saleOffers.map((offer) => {
          const involved =
            !!user &&
            (teamsById.get(offer.fromTeamId)?.managerUid === user.uid ||
              teamsById.get(offer.toTeamId)?.managerUid === user.uid)
          return (
            <li key={offer.id}>
              {offer.fromTeamName} เสนอขาย {offer.playerName} ({offer.playerPosition}) ให้{' '}
              {offer.toTeamName} ที่ราคา {offer.price} — สถานะ: {offer.status}
              {offer.status === 'pending' && (role === 'admin' || involved) && (
                <>
                  <button
                    type="button"
                    onClick={() => run(() => respondToSaleOffer(leagueId, offer.id, 'accepted'))}
                  >
                    ยอมรับ
                  </button>
                  <button
                    type="button"
                    onClick={() => run(() => respondToSaleOffer(leagueId, offer.id, 'rejected'))}
                  >
                    ปฏิเสธ
                  </button>
                  <button
                    type="button"
                    onClick={() => run(() => respondToSaleOffer(leagueId, offer.id, 'cancelled'))}
                  >
                    ยกเลิก
                  </button>
                </>
              )}
              {offer.status === 'accepted' && role === 'admin' && (
                <button type="button" onClick={() => run(() => completeSale(leagueId, offer.id))}>
                  ปิดการขาย (ย้ายผู้เล่นจริง)
                </button>
              )}
            </li>
          )
        })}
      </ul>

      {role === 'admin' && (
        <section>
          <h2>จัดการทีม</h2>
          <ul>
            {teams.map((team) => (
              <li key={team.id}>
                {team.name} (ผู้จัดการทีม: {team.managerName}){' '}
                <label>
                  <input
                    type="checkbox"
                    checked={team.isForfeited}
                    onChange={(e) => run(() => setTeamForfeited(leagueId, team.id, e.target.checked))}
                  />
                  ฟอส
                </label>
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

function AddTeamForm({
  onSubmit,
}: {
  onSubmit: (input: { name: string; managerUid: string; managerName: string }) => void
}) {
  const [name, setName] = useState('')
  const [managerUid, setManagerUid] = useState('')
  const [managerName, setManagerName] = useState('')

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    onSubmit({ name, managerUid, managerName })
    setName('')
    setManagerUid('')
    setManagerName('')
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
      <button type="submit">เพิ่มทีม</button>
    </form>
  )
}
