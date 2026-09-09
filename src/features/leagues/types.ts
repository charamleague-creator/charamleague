export type LeagueStatus = 'transfer_window' | 'in_season'

export interface League {
  id: string
  name: string
  status: LeagueStatus
  currentSeason: number
  forfeitPenalty: number
}

export interface Team {
  id: string
  name: string
  managerUid: string
  managerName: string
  isForfeited: boolean
  balance: number
  lineupSubmitted: boolean
  lineupApproved: boolean
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

export type PlayerTag = 'Academy' | 'Academy72' | 'Worldcup' | 'นักเตะ65' | 'Free'

export interface Player {
  id: string
  name: string
  position: PlayerPosition
  age: number
  joinedSeason: number
  tag: PlayerTag
  isVeteran: boolean
}

export type TransferType = 'auction'

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

export type AuctionListingStatus =
  | 'pending_approval'
  | 'open'
  | 'closed'
  | 'closed_no_winner'
  | 'rejected'

export interface AuctionListing {
  id: string
  season: number
  sellerTeamId: string
  sellerTeamName: string
  playerId: string
  playerName: string
  playerPosition: PlayerPosition
  playerAge: number
  startingPrice: number
  status: AuctionListingStatus
  highestBid: number | null
  highestBidderTeamId: string | null
  highestBidderTeamName: string | null
}

export type TransactionType = 'income' | 'expense'

export interface Transaction {
  id: string
  type: TransactionType
  category: string
  desc: string
  amount: number
  season: number
}

export type TearRequestStatus = 'pending' | 'success' | 'failed_insufficient_funds' | 'failed_outbid'

export interface TearRequest {
  id: string
  season: number
  requesterTeamId: string
  requesterTeamName: string
  targetTeamId: string
  targetTeamName: string
  playerId: string
  playerName: string
  status: TearRequestStatus
  requestedAtMs: number | null
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
