import { type FormEvent, useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import {
  addPlayer,
  createSaleOffer,
  releasePlayer,
  removePlayer,
  subscribeLeague,
  subscribePlayers,
  subscribeTeams,
} from '@/features/leagues/api'
import type { League, Player, PlayerPosition, Team } from '@/features/leagues/types'
import { useAuth } from '@/hooks/useAuth'

const POSITIONS: PlayerPosition[] = ['GK', 'DF', 'MF', 'FW']

export default function TeamSquadPage() {
  const { leagueId, teamId } = useParams<{ leagueId: string; teamId: string }>()
  const { role, user } = useAuth()
  const [league, setLeague] = useState<League | null>(null)
  const [teams, setTeams] = useState<Team[]>([])
  const [players, setPlayers] = useState<Player[]>([])
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

  if (!leagueId || !teamId) return null
  const currentLeagueId: string = leagueId
  const currentTeamId: string = teamId
  const team = teams.find((t) => t.id === teamId)

  async function handleAdd(input: { name: string; position: PlayerPosition; age: number }) {
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

  async function handleRelease(playerId: string) {
    setError(null)
    try {
      await releasePlayer(currentLeagueId, currentTeamId, playerId)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  const isOwnManager = !!user && !!team && user.uid === team.managerUid
  const canRelease = role === 'admin' || isOwnManager
  const otherTeams = teams.filter((t) => t.id !== teamId)

  async function handleProposeSale(
    player: Player,
    toTeamId: string,
    price: number,
  ) {
    setError(null)
    const toTeam = teams.find((t) => t.id === toTeamId)
    if (!team || !toTeam) return
    try {
      await createSaleOffer(currentLeagueId, {
        fromTeamId: currentTeamId,
        fromTeamName: team.name,
        toTeamId,
        toTeamName: toTeam.name,
        playerId: player.id,
        playerName: player.name,
        playerPosition: player.position,
        playerAge: player.age,
        price,
        proposedBy: 'seller',
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <main style={{ maxWidth: 640, margin: '2rem auto' }}>
      <h1>{team?.name ?? 'ทีม'} — รายชื่อผู้เล่น</h1>
      <p>จำนวนผู้เล่นในทีม: {players.length}</p>
      {error && <p role="alert">{error}</p>}
      <ul>
        {players.map((player) => (
          <li key={player.id}>
            {player.name} ({player.position}, อายุ {player.age})
            {canRelease && (
              <button type="button" onClick={() => handleRelease(player.id)}>
                ฉีกสัญญา
              </button>
            )}
            {role === 'admin' && (
              <button type="button" onClick={() => handleRemove(player.id)}>
                ลบ (แก้ข้อมูลผิด)
              </button>
            )}
            {canRelease && otherTeams.length > 0 && (
              <ProposeSaleForm
                teams={otherTeams}
                onSubmit={(toTeamId, price) => handleProposeSale(player, toTeamId, price)}
              />
            )}
          </li>
        ))}
      </ul>
      {role === 'admin' && <AddPlayerForm onSubmit={handleAdd} />}
    </main>
  )
}

function ProposeSaleForm({
  teams,
  onSubmit,
}: {
  teams: Team[]
  onSubmit: (toTeamId: string, price: number) => void
}) {
  const [toTeamId, setToTeamId] = useState(teams[0]?.id ?? '')
  const [price, setPrice] = useState('')

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    onSubmit(toTeamId, Number(price))
    setPrice('')
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'inline' }}>
      <select value={toTeamId} onChange={(e) => setToTeamId(e.target.value)}>
        {teams.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </select>
      <input
        type="number"
        min={0}
        placeholder="ราคา"
        value={price}
        onChange={(e) => setPrice(e.target.value)}
        required
        style={{ width: '5em' }}
      />
      <button type="submit">เสนอขาย</button>
    </form>
  )
}

function AddPlayerForm({
  onSubmit,
}: {
  onSubmit: (input: { name: string; position: PlayerPosition; age: number }) => void
}) {
  const [name, setName] = useState('')
  const [position, setPosition] = useState<PlayerPosition>('MF')
  const [age, setAge] = useState('')

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    onSubmit({ name, position, age: Number(age) })
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
      <button type="submit">เพิ่มผู้เล่น</button>
    </form>
  )
}
