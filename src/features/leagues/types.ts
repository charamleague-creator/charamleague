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

export type PlayerPosition = 'GK' | 'DF' | 'MF' | 'FW'

export interface Player {
  id: string
  name: string
  position: PlayerPosition
  age: number
  joinedSeason: number
}

export interface FreeAgent {
  id: string
  name: string
  position: PlayerPosition
  age: number
  joinedSeason: number
  releasedFromTeamId: string
  releasedFromTeamName: string
  releasedSeason: number
}

export type SaleOfferStatus = 'pending' | 'accepted' | 'rejected' | 'cancelled' | 'completed'

export interface SaleOffer {
  id: string
  season: number
  fromTeamId: string
  fromTeamName: string
  toTeamId: string
  toTeamName: string
  playerId: string
  playerName: string
  playerPosition: PlayerPosition
  playerAge: number
  price: number
  status: SaleOfferStatus
  proposedBy: 'seller' | 'buyer'
}

export type TransferType = 'simple_sale' | 'auction'

export interface Transfer {
  id: string
  season: number
  type: TransferType
  fromTeamId: string
  toTeamId: string
  playerId: string
  playerName: string
  price: number
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
