import { type FormEvent, useEffect, useState } from 'react'
import { addHallOfFameEntry, removeHallOfFameEntry, subscribeHallOfFame } from '@/features/hallOfFame/api'
import { countChampionshipsByManager } from '@/features/hallOfFame/helpers'
import { CHAMPION_CATEGORY_LABELS, type ChampionCategory, type HallOfFameEntry } from '@/features/hallOfFame/types'
import { subscribeLeagues, subscribeTeams } from '@/features/leagues/api'
import type { League, Team } from '@/features/leagues/types'
import { useAuth } from '@/hooks/useAuth'

const CATEGORIES = Object.keys(CHAMPION_CATEGORY_LABELS) as ChampionCategory[]

export default function HallOfFamePage() {
  const { role } = useAuth()
  const [entries, setEntries] = useState<HallOfFameEntry[]>([])
  const [leagues, setLeagues] = useState<League[]>([])
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => subscribeHallOfFame(setEntries), [])
  useEffect(() => subscribeLeagues(setLeagues), [])

  const leaderboard = Array.from(countChampionshipsByManager(entries).entries()).sort(
    (a, b) => b[1].total - a[1].total,
  )

  async function handleAdd(input: Parameters<typeof addHallOfFameEntry>[0]) {
    setError(null)
    setNotice(null)
    try {
      const result = await addHallOfFameEntry(input)
      if (result.isFirstChampionship) {
        setNotice(`🌟 นี่คือแชมป์ "${CHAMPION_CATEGORY_LABELS[input.category]}" ครั้งแรกของ ${input.managerName}!`)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  async function handleRemove(entryId: string) {
    setError(null)
    try {
      await removeHallOfFameEntry(entryId)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <main style={{ maxWidth: 800, margin: '2rem auto' }}>
      <h1>หอเกียรติยศ</h1>
      {error && <p role="alert">{error}</p>}
      {notice && <p>{notice}</p>}

      <h2>สรุปแชมป์ตามผู้จัดการทีม</h2>
      <ul>
        {leaderboard.length === 0 && <li>ยังไม่มีข้อมูล</li>}
        {leaderboard.map(([managerUid, info]) => (
          <li key={managerUid}>
            {info.managerName} — {info.total} แชมป์ (
            {Array.from(info.byCategory.entries())
              .map(([cat, count]) => `${CHAMPION_CATEGORY_LABELS[cat]} x${count}`)
              .join(', ')}
            )
          </li>
        ))}
      </ul>

      <h2>ประวัติทั้งหมด</h2>
      <ul>
        {entries.length === 0 && <li>ยังไม่มีข้อมูล</li>}
        {entries
          .sort((a, b) => b.season - a.season)
          .map((entry) => (
            <li key={entry.id}>
              ฤดูกาล {entry.season} — {CHAMPION_CATEGORY_LABELS[entry.category]}: {entry.teamName} (
              ผู้จัดการทีม: {entry.managerName})
              {role === 'admin' && (
                <button type="button" onClick={() => handleRemove(entry.id)}>
                  ลบ
                </button>
              )}
            </li>
          ))}
      </ul>

      {role === 'admin' && <AddEntryForm leagues={leagues} onSubmit={handleAdd} />}
    </main>
  )
}

function AddEntryForm({
  leagues,
  onSubmit,
}: {
  leagues: League[]
  onSubmit: (input: Parameters<typeof addHallOfFameEntry>[0]) => void
}) {
  const [category, setCategory] = useState<ChampionCategory>('league_primary')
  const [season, setSeason] = useState('')
  const [leagueId, setLeagueId] = useState('')
  const [teams, setTeams] = useState<Team[]>([])
  const [teamId, setTeamId] = useState('')
  const [teamName, setTeamName] = useState('')
  const [managerUid, setManagerUid] = useState('')
  const [managerName, setManagerName] = useState('')

  useEffect(() => {
    if (!leagueId) {
      setTeams([])
      return
    }
    return subscribeTeams(leagueId, setTeams)
  }, [leagueId])

  function handlePickTeam(id: string) {
    setTeamId(id)
    const team = teams.find((t) => t.id === id)
    if (team) {
      setTeamName(team.name)
      setManagerUid(team.managerUid)
      setManagerName(team.managerName)
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    onSubmit({
      category,
      season: Number(season),
      leagueId: leagueId || null,
      teamId: teamId || null,
      teamName,
      managerUid,
      managerName,
    })
    setSeason('')
    setTeamId('')
    setTeamName('')
    setManagerUid('')
    setManagerName('')
  }

  return (
    <form onSubmit={handleSubmit}>
      <h2>เพิ่มแชมป์ (รองรับกรอกย้อนหลัง)</h2>
      <select value={category} onChange={(e) => setCategory(e.target.value as ChampionCategory)}>
        {CATEGORIES.map((c) => (
          <option key={c} value={c}>
            {CHAMPION_CATEGORY_LABELS[c]}
          </option>
        ))}
      </select>
      <input
        type="number"
        placeholder="ฤดูกาล"
        value={season}
        onChange={(e) => setSeason(e.target.value)}
        required
      />
      <select value={leagueId} onChange={(e) => setLeagueId(e.target.value)}>
        <option value="">— เลือกลีก (ถ้ามี) —</option>
        {leagues.map((l) => (
          <option key={l.id} value={l.id}>
            {l.name}
          </option>
        ))}
      </select>
      {teams.length > 0 && (
        <select value={teamId} onChange={(e) => handlePickTeam(e.target.value)}>
          <option value="">— เลือกทีม (ดึงชื่อผู้จัดการทีมอัตโนมัติ) —</option>
          {teams.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      )}
      <input
        placeholder="ชื่อทีม"
        value={teamName}
        onChange={(e) => setTeamName(e.target.value)}
        required
      />
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
      <button type="submit">บันทึกแชมป์</button>
    </form>
  )
}
