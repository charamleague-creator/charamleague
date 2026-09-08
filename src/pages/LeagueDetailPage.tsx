import { type FormEvent, useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import {
  createTeam,
  endSeason,
  reportMatchResult,
  setTeamForfeited,
  startNewSeason,
  subscribeLeague,
  subscribeSeasonMatches,
  subscribeTeams,
} from '@/features/leagues/api'
import { computeStandings } from '@/features/leagues/standings'
import type { League, Match, Team } from '@/features/leagues/types'
import { useAuth } from '@/hooks/useAuth'

export default function LeagueDetailPage() {
  const { leagueId } = useParams<{ leagueId: string }>()
  const { user, role } = useAuth()
  const [league, setLeague] = useState<League | null>(null)
  const [teams, setTeams] = useState<Team[]>([])
  const [matches, setMatches] = useState<Match[]>([])
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
                {row.teamName}
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
