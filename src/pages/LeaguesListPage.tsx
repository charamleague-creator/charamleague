import { type FormEvent, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { createLeague, deleteLeague, subscribeLeagues } from '@/features/leagues/api'
import { DEFAULT_FORFEIT_PENALTY, DEFAULT_UNBEATEN_BONUS } from '@/features/leagues/finance'
import { DEFAULT_ACADEMY72_LIMIT } from '@/features/leagues/quotas'
import type { League } from '@/features/leagues/types'
import { useAuth } from '@/hooks/useAuth'

export default function LeaguesListPage() {
  const { role } = useAuth()
  const [leagues, setLeagues] = useState<League[]>([])
  const [name, setName] = useState('')
  const [forfeitPenalty, setForfeitPenalty] = useState(String(DEFAULT_FORFEIT_PENALTY))
  const [academy72Limit, setAcademy72Limit] = useState(String(DEFAULT_ACADEMY72_LIMIT))
  const [unbeatenBonus, setUnbeatenBonus] = useState(String(DEFAULT_UNBEATEN_BONUS))
  const [error, setError] = useState<string | null>(null)

  useEffect(() => subscribeLeagues(setLeagues), [])

  async function handleCreate(e: FormEvent) {
    e.preventDefault()
    setError(null)
    try {
      await createLeague(
        name.trim(),
        Number(forfeitPenalty),
        Number(academy72Limit),
        Number(unbeatenBonus),
      )
      setName('')
      setForfeitPenalty(String(DEFAULT_FORFEIT_PENALTY))
      setAcademy72Limit(String(DEFAULT_ACADEMY72_LIMIT))
      setUnbeatenBonus(String(DEFAULT_UNBEATEN_BONUS))
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
              {league.forfeitPenalty}M/ทีม — ถือ Academy72 ได้สูงสุด {league.academy72Limit} คน —
              โบนัสแชมป์ไร้พ่าย {league.unbeatenBonus}M)
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
          <input
            type="number"
            min={0}
            placeholder="ถือ Academy72 ได้สูงสุด (คน)"
            value={academy72Limit}
            onChange={(e) => setAcademy72Limit(e.target.value)}
            required
            style={{ width: '11em' }}
          />
          <input
            type="number"
            min={0}
            placeholder="โบนัสแชมป์ไร้พ่าย (M)"
            value={unbeatenBonus}
            onChange={(e) => setUnbeatenBonus(e.target.value)}
            required
            style={{ width: '11em' }}
          />
          <button type="submit">สร้างลีก</button>
        </form>
      )}
    </main>
  )
}
