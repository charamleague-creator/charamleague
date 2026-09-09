import { type FormEvent, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { createLeague, deleteLeague, subscribeLeagues } from '@/features/leagues/api'
import { DEFAULT_FORFEIT_PENALTY } from '@/features/leagues/finance'
import type { League } from '@/features/leagues/types'
import { useAuth } from '@/hooks/useAuth'

export default function LeaguesListPage() {
  const { role } = useAuth()
  const [leagues, setLeagues] = useState<League[]>([])
  const [name, setName] = useState('')
  const [forfeitPenalty, setForfeitPenalty] = useState(String(DEFAULT_FORFEIT_PENALTY))
  const [error, setError] = useState<string | null>(null)

  useEffect(() => subscribeLeagues(setLeagues), [])

  async function handleCreate(e: FormEvent) {
    e.preventDefault()
    setError(null)
    try {
      await createLeague(name.trim(), Number(forfeitPenalty))
      setName('')
      setForfeitPenalty(String(DEFAULT_FORFEIT_PENALTY))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  async function handleDelete(leagueId: string, leagueName: string) {
    if (!window.confirm(`ลบลีก "${leagueName}" ทิ้งทั้งหมด (ทีม+นัดแข่งทั้งหมด) ใช่ไหม?`)) return
    setError(null)
    try {
      await deleteLeague(leagueId)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <main style={{ maxWidth: 640, margin: '2rem auto' }}>
      <h1>ลีกทั้งหมด</h1>
      {error && <p role="alert">{error}</p>}
      <ul>
        {leagues.map((league) => (
          <li key={league.id}>
            <Link to={`/leagues/${league.id}`}>{league.name}</Link>{' '}
            <small>
              (ฤดูกาล {league.currentSeason} —{' '}
              {league.status === 'in_season' ? 'กำลังแข่งขัน' : 'ตลาดเปิด'} — ค่าปรับนัดไม่ส่งผล{' '}
              {league.forfeitPenalty}M/ทีม)
            </small>
            {role === 'admin' && (
              <button type="button" onClick={() => handleDelete(league.id, league.name)}>
                ลบ
              </button>
            )}
          </li>
        ))}
      </ul>

      {role === 'admin' && (
        <form onSubmit={handleCreate}>
          <input
            placeholder="ชื่อลีกใหม่"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
          <input
            type="number"
            min={0}
            placeholder="ค่าปรับนัดไม่ส่งผล (M/ทีม)"
            value={forfeitPenalty}
            onChange={(e) => setForfeitPenalty(e.target.value)}
            required
            style={{ width: '11em' }}
          />
          <button type="submit">สร้างลีก</button>
        </form>
      )}
    </main>
  )
}
