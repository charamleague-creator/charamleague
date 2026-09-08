export type CupType = 'major' | 'minor'

export interface Cup {
  id: string
  name: string
  type: CupType
  season: number
  status: 'in_progress' | 'completed'
}

export type CupMatchStatus = 'pending' | 'scheduled' | 'played' | 'bye'

export interface CupMatch {
  round: number
  slot: number
  homeTeamId: string | null
  awayTeamId: string | null
  status: CupMatchStatus
  homeScore: number | null
  awayScore: number | null
  winnerTeamId: string | null
}
