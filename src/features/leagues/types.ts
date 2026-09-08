export type LeagueStatus = 'transfer_window' | 'in_season'

export interface League {
  id: string
  name: string
  status: LeagueStatus
  currentSeason: number
}

export interface Team {
  id: string
  name: string
  managerUid: string
  managerName: string
  isForfeited: boolean
}

export type MatchStatus = 'scheduled' | 'played' | 'bye'

export interface Match {
  id: string
  season: number
  matchday: number
  homeTeamId: string
  awayTeamId: string
  involvedManagerUids: string[]
  status: MatchStatus
  homeScore: number | null
  awayScore: number | null
  winnerTeamId: string | null
}

export interface StandingsRow {
  teamId: string
  teamName: string
  played: number
  won: number
  drawn: number
  lost: number
  goalsFor: number
  goalsAgainst: number
  goalDifference: number
  points: number
}
