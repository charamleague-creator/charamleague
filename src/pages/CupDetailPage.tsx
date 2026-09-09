import { type FormEvent, useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { reportCupMatchResult, subscribeCupMatches, subscribeCups } from '@/features/cups/api'
import type { Cup, CupMatch } from '@/features/cups/types'
import { subscribeLeague, subscribeTeams } from '@/features/leagues/api'
import type { League, Team } from '@/features/leagues/types'
import { useAuth } from '@/hooks/useAuth'

export default function CupDetailPage() {
  const { leagueId, cupId } = useParams<{ leagueId: string; cupId: string }>()
  const { role } = useAuth()
  const [league, setLeague] = useState<League | null>(null)
  const [cups, setCups] = useState<Cup[]>([])
  const [matches, setMatches] = useState<CupMatch[]>([])
  const [teams, setTeams] = useState<Team[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!leagueId) return
    return subscribeLeague(leagueId, setLeague)
  }, [leagueId])

  useEffect(() => {
    if (!leagueId) return
    return subscribeCups(leagueId, setCups)
  }, [leagueId])

  useEffect(() => {
    if (!leagueId || !cupId) return
    return subscribeCupMatches(leagueId, cupId, setMatches)
  }, [leagueId, cupId])

  useEffect(() => {
    if (!leagueId) return
    return subscribeTeams(leagueId, setTeams)
  }, [leagueId])

  if (!leagueId || !cupId) return null
  const cup = cups.find((c) => c.id === cupId)
  const teamsById = new Map(teams.map((t) => [t.id, t]))
  const teamName = (id: string | null) => (id ? teamsById.get(id)?.name ?? id : 'รอผลรอบก่อนหน้า')

  const numRounds = matches.length > 0 ? Math.max(...matches.map((m) => m.round)) : 0

  async function handleReport(round: number, slot: number, homeScore: number, awayScore: number) {
    setError(null)
    if (!leagueId || !cupId) return
    try {
      await reportCupMatchResult(leagueId, cupId, round, slot, homeScore, awayScore)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <main style={{ maxWidth: 800, margin: '2rem auto' }}>
      <h1>{cup?.name ?? 'ถ้วย'}</h1>
      <p>สถานะ: {cup?.status === 'completed' ? 'จบแล้ว' : 'กำลังแข่ง'}</p>
      {league && league.status !== 'in_season' && (
        <p role="alert">รายงาน/แก้ผลบอลถ้วยได้เฉพาะตอนลีกกำลังแข่งขันเท่านั้น (ตอนนี้ตลาดเปิดอยู่)</p>
      )}
      {error && <p role="alert">{error}</p>}
      {Array.from({ length: numRounds }, (_, i) => i + 1).map((round) => (
        <div key={round}>
          <h2>{round === numRounds ? 'รอบชิงชนะเลิศ' : `รอบที่ ${round}`}</h2>
          <ul>
            {matches
              .filter((m) => m.round === round)
              .sort((a, b) => a.slot - b.slot)
              .map((m) => (
                <li key={`${m.round}_${m.slot}`}>
                  {teamName(m.homeTeamId)} vs {teamName(m.awayTeamId)} —{' '}
                  {m.status === 'played' && `${m.homeScore} - ${m.awayScore}`}
                  {m.status === 'bye' && 'บาย'}
                  {m.status === 'pending' && 'รอทีม'}
                  {(m.status === 'scheduled' || m.status === 'played') &&
                    role === 'admin' &&
                    league?.status === 'in_season' && (
                    <CupScoreForm
                      key={`${m.round}_${m.slot}_${m.homeScore}_${m.awayScore}`}
                      initialHome={m.homeScore}
                      initialAway={m.awayScore}
                      onSubmit={(h, a) => handleReport(m.round, m.slot, h, a)}
                    />
                  )}
                </li>
              ))}
          </ul>
        </div>
      ))}
    </main>
  )
}

function CupScoreForm({
  initialHome,
  initialAway,
  onSubmit,
}: {
  initialHome: number | null
  initialAway: number | null
  onSubmit: (homeScore: number, awayScore: number) => void
}) {
  const [homeScore, setHomeScore] = useState(initialHome !== null ? String(initialHome) : '')
  const [awayScore, setAwayScore] = useState(initialAway !== null ? String(initialAway) : '')

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
      <button type="submit">{initialHome !== null ? 'แก้ผล' : 'บันทึกผล'}</button>
    </form>
  )
}
