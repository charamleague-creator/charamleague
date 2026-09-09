import { signInWithEmailAndPassword } from 'firebase/auth'
import { type FormEvent, useEffect, useState } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { listAllTeamsForLogin, type TeamPickerEntry } from '@/features/leagues/api'
import { auth } from '@/lib/firebase'
import { useAuth } from '@/hooks/useAuth'

type LoginMode = 'admin' | 'manager'

export default function LoginPage() {
  const { user, loading } = useAuth()
  const location = useLocation()
  const [mode, setMode] = useState<LoginMode>('admin')
  const [teams, setTeams] = useState<TeamPickerEntry[]>([])
  const [selectedTeamKey, setSelectedTeamKey] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [redirectTo, setRedirectTo] = useState<string | null>(null)

  useEffect(() => {
    if (mode !== 'manager') return
    listAllTeamsForLogin()
      .then(setTeams)
      .catch(() => setTeams([]))
  }, [mode])

  if (!loading && user) {
    const from = (location.state as { from?: string } | null)?.from ?? redirectTo ?? '/'
    return <Navigate to={from} replace />
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const selected = teams.find((t) => `${t.leagueId}/${t.teamId}` === selectedTeamKey)
      if (mode === 'manager' && selected) {
        setRedirectTo(`/leagues/${selected.leagueId}/teams/${selected.teamId}`)
      }
      await signInWithEmailAndPassword(auth, email, password)
    } catch {
      setError('อีเมลหรือรหัสผ่านไม่ถูกต้อง')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main style={{ maxWidth: 360, margin: '4rem auto' }}>
      <h1>CHARAM LEAGUE — เข้าสู่ระบบ</h1>
      <div role="tablist" style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
        <button
          type="button"
          aria-pressed={mode === 'admin'}
          onClick={() => setMode('admin')}
        >
          แอดมิน
        </button>
        <button
          type="button"
          aria-pressed={mode === 'manager'}
          onClick={() => setMode('manager')}
        >
          ผู้จัดการทีม
        </button>
      </div>
      <form onSubmit={handleSubmit}>
        {mode === 'manager' && (
          <div>
            <label htmlFor="team">ทีมของฉัน</label>
            <select
              id="team"
              value={selectedTeamKey}
              onChange={(e) => setSelectedTeamKey(e.target.value)}
            >
              <option value="">-- เลือกทีม --</option>
              {teams.map((t) => (
                <option key={`${t.leagueId}/${t.teamId}`} value={`${t.leagueId}/${t.teamId}`}>
                  {t.teamName} ({t.leagueName})
                </option>
              ))}
            </select>
          </div>
        )}
        <div>
          <label htmlFor="email">อีเมล</label>
          <input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="password">รหัสผ่าน</label>
          <input
            id="password"
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        {error && <p role="alert">{error}</p>}
        <button type="submit" disabled={submitting}>
          {submitting ? 'กำลังเข้าสู่ระบบ...' : 'เข้าสู่ระบบ'}
        </button>
      </form>
    </main>
  )
}
