import { type FormEvent, useEffect, useState } from 'react'
import { addHallOfFameEntry, removeHallOfFameEntry, subscribeHallOfFame } from '@/features/hallOfFame/api'
import { countChampionshipsByManager, getCategoryLeaders } from '@/features/hallOfFame/helpers'
import { CHAMPION_CATEGORY_LABELS, type ChampionCategory, type HallOfFameEntry } from '@/features/hallOfFame/types'
import { listAllTeamsForLogin, subscribeLeagues, type TeamPickerEntry } from '@/features/leagues/api'
import type { League } from '@/features/leagues/types'
import { useAuth } from '@/hooks/useAuth'

const CATEGORIES = Object.keys(CHAMPION_CATEGORY_LABELS) as ChampionCategory[]

export default function HallOfFamePage() {
  const { role } = useAuth()
  const [entries, setEntries] = useState<HallOfFameEntry[]>([])
  const [leagues, setLeagues] = useState<League[]>([])
  const [allTeams, setAllTeams] = useState<TeamPickerEntry[]>([])
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => subscribeHallOfFame(setEntries), [])
  useEffect(() => subscribeLeagues(setLeagues), [])

  useEffect(() => {
    listAllTeamsForLogin()
      .then(setAllTeams)
      .catch(() => setAllTeams([]))
  }, [entries])

  const leaderboard = Array.from(countChampionshipsByManager(entries).entries()).sort(
    (a, b) => b[1].total - a[1].total,
  )
  const categoryLeaders = getCategoryLeaders(entries)

  // เอกสาร phase 06: ตารางเกียรติยศต้องโชว์ทีมปัจจุบันของผู้จัดการทีมคนนั้น (ค้นหาสด ไม่ใช่ snapshot)
  // ถ้าไม่ได้คุมทีมไหนอยู่แล้ว ให้แสดงชื่อเฉยๆ ไม่ซ่อนแถวไปเลย
  function currentTeamFor(managerUid: string) {
    return allTeams.find((t) => t.managerUid === managerUid)
  }

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

      <h2>เจ้าแห่งความสำเร็จ</h2>
      {CATEGORIES.every((category) => !categoryLeaders.get(category)?.length) && <p>ยังไม่มีข้อมูล</p>}
      <div className="stat-grid">
        {CATEGORIES.map((category) => {
          const leaders = categoryLeaders.get(category)
          if (!leaders || leaders.length === 0) return null
          return (
            <div className="award-card" key={category}>
              <div className="award-card__title">
                {CHAMPION_CATEGORY_LABELS[category]} ({leaders[0].count} แชมป์)
              </div>
              <div className="award-card__names">{leaders.map((l) => l.managerName).join(', ')}</div>
            </div>
          )
        })}
      </div>

      <h2>ตารางเกียรติยศ</h2>
      <ul>
        {leaderboard.length === 0 && <li>ยังไม่มีข้อมูล</li>}
        {leaderboard.map(([managerUid, info]) => {
          const currentTeam = currentTeamFor(managerUid)
          return (
            <li key={managerUid}>
              {info.managerName}
              {currentTeam ? ` (${currentTeam.teamName} — ${currentTeam.leagueName})` : ' (ไม่ได้คุมทีมในระบบแล้ว)'}
              {' — '}
              {info.total} แชมป์ (
              {Array.from(info.byCategory.entries())
                .map(([cat, count]) => `${CHAMPION_CATEGORY_LABELS[cat]} x${count}`)
                .join(', ')}
              )
            </li>
          )
        })}
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
  const [teams, setTeams] = useState<TeamPickerEntry[]>([])
  const [teamId, setTeamId] = useState('')

  useEffect(() => {
    if (!leagueId) {
      setTeams([])
      setTeamId('')
      return
    }
    listAllTeamsForLogin()
      .then((all) => setTeams(all.filter((t) => t.leagueId === leagueId)))
      .catch(() => setTeams([]))
    setTeamId('')
  }, [leagueId])

  const selectedTeam = teams.find((t) => t.teamId === teamId)

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!selectedTeam) return
    onSubmit({
      category,
      season: Number(season),
      leagueId,
      teamId: selectedTeam.teamId,
      teamName: selectedTeam.teamName,
      managerUid: selectedTeam.managerUid,
      managerName: selectedTeam.managerName,
    })
    setSeason('')
    setTeamId('')
  }

  return (
    <form onSubmit={handleSubmit}>
      <h2>เพิ่มแชมป์ (รองรับกรอกย้อนหลัง)</h2>
      <p>
        <small>
          เลือกทีมจาก dropdown เท่านั้น — ระบบดึงชื่อผู้จัดการทีมของทีมนั้นให้อัตโนมัติ กันพิมพ์ชื่อผิด/ไม่ตรงกับของจริง
        </small>
      </p>
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
      <select value={leagueId} onChange={(e) => setLeagueId(e.target.value)} required>
        <option value="">— เลือกลีก —</option>
        {leagues.map((l) => (
          <option key={l.id} value={l.id}>
            {l.name}
          </option>
        ))}
      </select>
      <select value={teamId} onChange={(e) => setTeamId(e.target.value)} required disabled={!leagueId}>
        <option value="">— เลือกทีม —</option>
        {teams.map((t) => (
          <option key={t.teamId} value={t.teamId}>
            {t.teamName}
          </option>
        ))}
      </select>
      <button type="submit" disabled={!selectedTeam || !season}>
        บันทึกแชมป์
      </button>
    </form>
  )
}
